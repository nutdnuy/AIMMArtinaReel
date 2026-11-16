#!/usr/bin/env node
// check.mjs <project>: the review gate before rendering. Builds the project, opens the page, and measures
// every text box at settled moments: inside the safe zone, clear of the phone-button column, not clipped,
// and (captions and headlines) clear of the pictures. Also finds stretches with nothing new on screen.
import { resolve } from 'node:path';
import { buildProject, exitWithError, isMain } from './build.mjs';
import { openPage } from '../lib/serve.mjs';
import { SAFE, RIGHT_UI, HEADLINE } from '../engine/layout.mjs';
import { ENTER_DUR, NUMBER_DUR, BOB_PX, SWAY_DEG, PULSE_SCALE } from '../engine/motion.mjs';

const MAX_GAP = 3.0; // s; a longer stretch with no new picture, headline or mark is a dead beat
const SETTLE = 0.05; // s after an entrance ends, so overshoot and easing have finished
const CAPTION_GROW = 0.12; // s; a highlighted caption scales 0.92 -> 1 over its first 0.12 s
const MARGIN = 0.02; // s kept clear of a scene's end and of an item's exit
const TOLERANCE = 0.5; // px; sub-pixel layout noise is not a finding

const round3 = (x) => Math.round(x * 1000) / 1000;

// Dead beats: gaps longer than `maxGap` between consecutive visual events (scene starts, item, mark and
// headline times), or between the last event and the end of the voice.
export function deadBeats(resolved, maxGap = MAX_GAP) {
  const events = [];
  for (const scene of resolved.scenes) {
    events.push(scene.t0);
    if (scene.headline) events.push(scene.headline.t);
    for (const item of scene.items ?? []) events.push(item.t);
    for (const mark of scene.marks ?? []) events.push(mark.t);
  }
  const times = [...new Set(events.filter((t) => t < resolved.voiceEnd))].sort((a, b) => a - b);
  times.push(resolved.voiceEnd);
  const gaps = [];
  for (let i = 1; i < times.length; i += 1) {
    if (times[i] - times[i - 1] > maxGap + 1e-9) gaps.push({ t0: times[i - 1], t1: times[i] });
  }
  return gaps;
}

// ---------- geometry (rects are {x, y, w, h}; zones in layout.mjs are {x0, y0, x1, y1})

const asRect = (z) => ({ x: z.x0, y: z.y0, w: z.x1 - z.x0, h: z.y1 - z.y0 });
const SAFE_RECT = asRect(SAFE);
const RIGHT_UI_RECT = asRect(RIGHT_UI);

const inside = (r, zone) => r.x >= zone.x - TOLERANCE && r.y >= zone.y - TOLERANCE
  && r.x + r.w <= zone.x + zone.w + TOLERANCE && r.y + r.h <= zone.y + zone.h + TOLERANCE;

const intersects = (a, b) => a.x + a.w > b.x + TOLERANCE && b.x + b.w > a.x + TOLERANCE
  && a.y + a.h > b.y + TOLERANCE && b.y + b.h > a.y + TOLERANCE;

// The box of an item's text over a whole idle loop, as one rect, from its resting rect `r`. The loops
// (motion.mjs) bob up and down, sway about the item's centre, or pulse in size about it, whatever the
// item's seed: only the amplitude matters, so the result does not depend on when the box is measured.
const SWAY_STEPS = 12; // angles tried between -SWAY_DEG and SWAY_DEG; a corner's extreme lies between them

function idleReach(item, r) {
  const c = { x: item.rect.x + item.rect.w / 2, y: item.rect.y + item.rect.h / 2 };
  const corners = [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]];
  const moved = [];
  for (const [x, y] of corners) {
    if (item.idle === 'bob') {
      moved.push([x, y - BOB_PX], [x, y + BOB_PX]);
    } else if (item.idle === 'pulse') {
      for (const k of [1 - PULSE_SCALE, 1 + PULSE_SCALE]) moved.push([c.x + (x - c.x) * k, c.y + (y - c.y) * k]);
    } else if (item.idle === 'sway') {
      for (let i = 0; i <= SWAY_STEPS; i += 1) {
        const a = ((-SWAY_DEG + (2 * SWAY_DEG * i) / SWAY_STEPS) * Math.PI) / 180;
        const [dx, dy] = [x - c.x, y - c.y];
        moved.push([c.x + dx * Math.cos(a) - dy * Math.sin(a), c.y + dx * Math.sin(a) + dy * Math.cos(a)]);
      }
    }
  }
  if (moved.length === 0) return r;
  const xs = moved.map((p) => p[0]);
  const ys = moved.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

// ---------- sample times

// When an item's entrance is over: a number also counts up, and its finished figure is the widest.
const entranceEnd = (item) => item.t + (item.type === 'number' ? Math.max(ENTER_DUR, NUMBER_DUR) : ENTER_DUR);

// When a scene's headline is measured: once its pop is over, or just before the scene ends.
const headlineSample = (scene) => Math.min(scene.headline.t + ENTER_DUR + SETTLE, scene.t1 - MARGIN);

// The moments to measure, as a Map from seconds (rounded to 1 ms) to the ids of the items that moment is
// meant for. Only settled moments: a pop starts at scale 0 and overshoots, a highlighted caption starts at
// 0.92, so the boxes of a half-drawn entrance say nothing about the layout.
function sampleTimes(R) {
  const times = new Map();
  const add = (t, itemId) => {
    const key = round3(t);
    if (!times.has(key)) times.set(key, new Set());
    if (itemId !== undefined) times.get(key).add(itemId);
  };
  for (const cap of R.captions) {
    const mid = (cap.t0 + cap.t1) / 2;
    const grown = cap.t0 + CAPTION_GROW;
    add(grown < cap.t1 - MARGIN ? Math.max(mid, grown) : mid);
  }
  for (const scene of R.scenes) {
    const last = scene.t1 - MARGIN;
    for (const item of scene.items) {
      const clampTo = item.exitT === undefined ? last : Math.min(last, item.exitT - MARGIN);
      add(Math.max(item.t, Math.min(entranceEnd(item) + SETTLE, clampTo)), item.id);
    }
    if (scene.headline) add(headlineSample(scene));
  }
  add((R.endCard.t0 + R.endCard.t1) / 2);
  return new Map([...times].sort((a, b) => a[0] - b[0]));
}

// The items of the scene on screen at time t (an item shows from its t until its exitT).
function visibleItems(R, t) {
  const scene = R.scenes.find((s) => t >= s.t0 && t < s.t1);
  if (!scene) return [];
  return scene.items.filter((item) => t >= item.t && (item.exitT === undefined || t < item.exitT));
}

// ---------- findings

// `owner` is the item the text belongs to (or undefined); `box.rect` is its resting rect (idle loops off).
function findingsFor(t, box, items, owner) {
  const text = [];
  const overlaps = [];
  const base = { t, kind: box.kind, text: box.text };
  const reach = owner ? idleReach(owner, box.rect) : box.rect; // where the text goes during the item's idle loop
  if (!inside(reach, SAFE_RECT) || (box.kind === 'headline' && !inside(box.rect, HEADLINE))) {
    text.push({ ...base, problem: 'outside-safe' });
  }
  if (intersects(reach, RIGHT_UI_RECT)) text.push({ ...base, problem: 'right-ui' });
  if (box.clipped) text.push({ ...base, problem: 'clipped' });
  if (box.kind === 'caption' || box.kind === 'headline') {
    for (const item of items) {
      if (intersects(box.rect, item.rect)) overlaps.push({ ...base, problem: 'overlap', item: item.id });
    }
  }
  return { text, overlaps };
}

// A thing that stays wrong across several samples is reported once, at the first time it was seen.
function unique(findings) {
  const seen = new Set();
  return findings.filter((f) => {
    const key = [f.kind, f.text, f.problem, f.item ?? ''].join('\u0000');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function checkProject(projectDir, opts = {}) {
  projectDir = resolve(projectDir);
  const { resolved } = await buildProject(projectDir, { forceFallback: opts.forceFallback === true });
  const { page, close } = await openPage(projectDir);
  try {
    const font = await page.evaluate(() => window.__paim.fontUsed());
    // Idle loops off: the boxes are then the resting ones, and idleReach() adds the loop's reach back, so
    // the verdict does not depend on the item's seed (which only sets the phase of the loop).
    await page.evaluate(() => {
      for (const scene of window.__PAIM_DATA.resolved.scenes) for (const item of scene.items) item.idle = 'none';
    });
    const text = [];
    const overlaps = [];
    for (const [t, due] of sampleTimes(resolved)) {
      const boxes = await page.evaluate((s) => {
        window.__paim.seek(s);
        return window.__paim.textBoxes();
      }, t);
      const items = visibleItems(resolved, t);
      for (const box of boxes) {
        // An item's text is judged once its entrance is over (or at the moment chosen for that item).
        const owner = items.find((item) => item.id === box.item);
        if (owner && t < entranceEnd(owner) - 1e-6 && !due.has(owner.id)) continue;
        // A headline likewise: its pop overshoots the zone, so a caption sample during it says nothing.
        const scene = resolved.scenes.find((s) => t >= s.t0 && t < s.t1);
        if (box.kind === 'headline' && scene?.headline && t < scene.headline.t + ENTER_DUR - 1e-6
          && t !== round3(headlineSample(scene))) continue;
        const found = findingsFor(t, box, items, owner);
        text.push(...found.text);
        overlaps.push(...found.overlaps);
      }
    }
    const result = { font, text: unique(text), deadBeats: deadBeats(resolved), overlaps: unique(overlaps) };
    return { pass: result.text.length + result.deadBeats.length + result.overlaps.length === 0, ...result };
  } finally {
    await close();
  }
}

// ---------- CLI

const status = (list) => (list.length === 0 ? 'PASS' : `FAIL (${list.length})`);
const secs = (t) => `${t.toFixed(2)} s`;

function report(c) {
  const lines = [`font: ${c.font}`];
  const shorten = (s) => (s.length > 40 ? `${s.slice(0, 40)}...` : s);
  const describe = (f) => `  ${secs(f.t)}  ${f.kind} "${shorten(f.text)}": ${f.problem}${f.item ? ` (item ${f.item})` : ''}`;
  lines.push(`text: ${status(c.text)}`, ...c.text.map(describe));
  lines.push(`dead beats: ${status(c.deadBeats)}`,
    ...c.deadBeats.map((g) => `  ${secs(g.t0)} to ${secs(g.t1)}: nothing new for ${secs(g.t1 - g.t0)}`));
  lines.push(`overlap: ${status(c.overlaps)}`, ...c.overlaps.map(describe));
  return lines.join('\n');
}

if (isMain(import.meta.url)) {
  const [project, ...extra] = process.argv.slice(2);
  if (!project || extra.length) {
    console.error('usage: check.mjs <project>   (PAIM_FORCE_FALLBACK_FONT=1 checks the fallback font)');
    process.exit(2);
  }
  checkProject(project, { forceFallback: process.env.PAIM_FORCE_FALLBACK_FONT === '1' })
    .then((c) => {
      console.log(report(c));
      process.exitCode = c.pass ? 0 : 1;
    })
    .catch(exitWithError);
}
