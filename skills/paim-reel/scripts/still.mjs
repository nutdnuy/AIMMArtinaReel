#!/usr/bin/env node
// still.mjs <project> <t1,t2,...> <out.png>: a contact sheet of the frames at the given times.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildProject, BuildError, exitWithError, isMain } from './build.mjs';
import { openPage } from '../lib/serve.mjs';
import { W, H } from '../engine/layout.mjs';

const GAP = 12;

// Draws each time at full size, then lays the frames side by side, scaled, in one PNG.
export async function stills(projectDir, times, outFile, scale = 0.3) {
  if (!Array.isArray(times) || times.length === 0 || !times.every((t) => Number.isFinite(t) && t >= 0)) {
    throw new BuildError('stills needs a list of times in seconds, such as 0.5,2.6,4.5');
  }
  await buildProject(projectDir);
  const { page, close } = await openPage(projectDir);
  try {
    const frames = [];
    for (const t of times) {
      await page.evaluate((s) => window.__paim.seek(s), t);
      frames.push((await page.screenshot({ type: 'png' })).toString('base64'));
    }
    const w = Math.round(W * scale);
    const h = Math.round(H * scale);
    const sheet = await page.context().browser().newPage({
      viewport: { width: GAP + frames.length * (w + GAP), height: h + 2 * GAP },
    });
    await sheet.setContent(
      `<body style="margin:0;padding:${GAP}px;display:flex;gap:${GAP}px;background:#252B31">${frames
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
    console.error('usage: still.mjs <project> <t1,t2,...> <out.png>');
    process.exit(2);
  }
  stills(project, list.split(',').map(Number), out)
    .then(() => console.log(`stills -> ${out}`))
    .catch(exitWithError);
}
