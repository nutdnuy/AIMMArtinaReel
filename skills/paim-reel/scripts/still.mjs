#!/usr/bin/env node
// still.mjs <project> <t1,t2,...> <out.png>: a contact sheet of the frames at the given times.
// still.mjs <project> --scenes <out.png>: one frame per scene, once everything in it has settled.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildProject, BuildError, exitWithError, isMain } from './build.mjs';
import { openPage } from '../lib/serve.mjs';
import { W, H, FPS } from '../engine/layout.mjs';
import { ENTER_DUR, NUMBER_DUR, BAR_DUR, MARK_DUR } from '../engine/motion.mjs';

const GAP = 12;
const PER_ROW = 4; // frames per row, so a sheet of many scenes stays readable
const SETTLE = 0.05; // s after the last motion ends

// When an item has finished moving: its entrance, and a number's count-up or a bar's fill.
const itemDone = (item) => item.t + Math.max(ENTER_DUR,
  item.type === 'number' ? NUMBER_DUR : item.type === 'bar' ? BAR_DUR : 0);

// One time per scene: just after its last entrance, count-up, bar fill, mark and headline pop have
// finished, kept inside the scene (at most its last frame).
export function settledTimes(resolved) {
  return resolved.scenes.map((scene) => {
    const ends = [scene.t0];
    if (scene.headline) ends.push(scene.headline.t + ENTER_DUR);
    for (const item of scene.items ?? []) ends.push(itemDone(item));
    for (const mark of scene.marks ?? []) ends.push(mark.t + MARK_DUR);
    const t = Math.max(...ends) + SETTLE;
    return Math.max(scene.t0, Math.min(t, scene.t1 - 1 / FPS));
  });
}

// Draws each time at full size, then lays the frames out scaled in one PNG, at most PER_ROW to a row.
// `times` is a list of seconds, or 'scenes' for settledTimes().
export async function stills(projectDir, times, outFile, scale = 0.3) {
  const scenes = times === 'scenes';
  if (!scenes && (!Array.isArray(times) || times.length === 0 || !times.every((t) => Number.isFinite(t) && t >= 0))) {
    throw new BuildError('stills needs a list of times in seconds, such as 0.5,2.6,4.5, or --scenes');
  }
  const { resolved } = await buildProject(projectDir);
  if (scenes) times = settledTimes(resolved);
  const { page, close } = await openPage(projectDir);
  try {
    const frames = [];
    for (const t of times) {
      await page.evaluate((s) => window.__paim.seek(s), t);
      frames.push((await page.screenshot({ type: 'png' })).toString('base64'));
    }
    const w = Math.round(W * scale);
    const h = Math.round(H * scale);
    const cols = Math.min(frames.length, PER_ROW);
    const rows = Math.ceil(frames.length / PER_ROW);
    const sheet = await page.context().browser().newPage({
      viewport: { width: GAP + cols * (w + GAP), height: GAP + rows * (h + GAP) },
    });
    await sheet.setContent(
      `<body style="margin:0;padding:${GAP}px;display:grid;grid-template-columns:repeat(${cols},${w}px);gap:${GAP}px;background:#252B31">${frames
        .map((f) => `<img width="${w}" height="${h}" src="data:image/png;base64,${f}">`)
        .join('')}</body>`,
    );
    await sheet.waitForFunction(() => [...document.images].every((i) => i.complete));
    const png = await sheet.screenshot({ type: 'png' });
    mkdirSync(dirname(resolve(outFile)), { recursive: true });
    await sheet.close();
    writeFileSync(outFile, png);
  } finally {
    await close();
  }
}

if (isMain(import.meta.url)) {
  const [project, list, out, ...extra] = process.argv.slice(2);
  if (!project || !list || !out || extra.length) {
    console.error('usage: still.mjs <project> <t1,t2,...>|--scenes <out.png>');
    process.exit(2);
  }
  stills(project, list === '--scenes' ? 'scenes' : list.split(',').map(Number), out)
    .then(() => console.log(`stills -> ${out}`))
    .catch(exitWithError);
}
