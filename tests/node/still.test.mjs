import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { settledTimes } from '../../skills/paim-reel/scripts/still.mjs';
import { buildProject } from '../../skills/paim-reel/scripts/build.mjs';
import { openPage } from '../../skills/paim-reel/lib/serve.mjs';
import { copyFixture, tempDir } from '../helpers.mjs';

const SLOW = { timeout: 120_000 };
const STILL_CLI = fileURLToPath(new URL('../../skills/paim-reel/scripts/still.mjs', import.meta.url));
const near = (a, b) => Math.abs(a - b) < 1e-6;

test('settledTimes: after the last entrance, count-up, bar fill, mark and headline of each scene', () => {
  const R = {
    scenes: [
      {
        t0: 0, t1: 5, headline: { t: 0 },
        items: [{ t: 1, type: 'icon' }, { t: 2, type: 'number' }, { t: 0.5, type: 'bar' }],
        marks: [{ t: 3 }],
      },
      { t0: 5, t1: 6, items: [{ t: 5.9, type: 'sprite' }], marks: [] }, // settles past the scene end: clamped
      { t0: 6, t1: 8, items: [], marks: [] }, // nothing to wait for
      { t0: 8, t1: 9, items: [{ t: 8, type: 'number' }], marks: [] },
    ],
  };
  const [a, b, c, d] = settledTimes(R);
  assert.ok(near(a, 3.35), `mark drawn at 3.3 s, then 0.05 s: ${a}`);
  assert.ok(b < 6 && b >= 6 - 1 / 30 - 1e-9, `inside the scene, its last frame: ${b}`);
  assert.ok(near(c, 6.05), `scene start: ${c}`);
  assert.ok(near(d, 8.85), `number counted up: ${d}`);
});

// mini with a count-up number in a second scene (1.60 to 2.40 s), so the scene's midpoint (2.30 s) catches it mid-count.
function project(t) {
  process.env.PAIM_CONFIG_DIR = tempDir(t, 'paim-config');
  const dir = copyFixture(t, 'mini');
  const file = join(dir, 'story.json');
  const story = JSON.parse(readFileSync(file, 'utf8'));
  const etf = story.scenes[0].items.pop();
  story.scenes.push({
    id: 's2', from: 'l02', layout: 'row',
    items: [etf, { id: 'n', type: 'number', to: 1050, color: 'green', source: 'test', at: 'l02' }],
  });
  writeFileSync(file, JSON.stringify(story));
  return dir;
}

test('at the settled time of each scene the number shows its final figure', SLOW, async (t) => {
  const dir = project(t);
  const { resolved } = await buildProject(dir);
  const times = settledTimes(resolved);
  assert.equal(times.length, 2);
  const { page, close } = await openPage(dir);
  try {
    const shown = await page.evaluate((s) => {
      window.__paim.seek(s);
      return window.__paim.textBoxes().filter((b) => b.kind === 'number').map((b) => b.text);
    }, times[1]);
    assert.deepEqual(shown, ['1,050']);
  } finally {
    await close();
  }
});

test('still.mjs --scenes writes one frame per scene', SLOW, (t) => {
  const dir = project(t);
  const out = join(tempDir(t, 'paim-stills'), 'sheet.png');
  const r = spawnSync(process.execPath, [STILL_CLI, dir, '--scenes', out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /stills -> .*sheet\.png/);
  assert.ok(existsSync(out));
  const width = readFileSync(out).readUInt32BE(16);
  assert.equal(width, 12 + 2 * (Math.round(1080 * 0.3) + 12), 'two frames side by side');
});

test('still.mjs with an explicit time list still works', SLOW, (t) => {
  const dir = project(t);
  const out = join(tempDir(t, 'paim-stills'), 'sheet.png');
  const r = spawnSync(process.execPath, [STILL_CLI, dir, '0.5,2.0,2.9', out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const png = readFileSync(out);
  assert.equal(png.readUInt32BE(16), 12 + 3 * (Math.round(1080 * 0.3) + 12), 'three frames in one row');
  assert.equal(png.readUInt32BE(20), 12 + (Math.round(1920 * 0.3) + 12), 'one row high');
});

test('still.mjs lays 12 frames out in rows of at most 4', SLOW, (t) => {
  const dir = project(t);
  const out = join(tempDir(t, 'paim-stills'), 'sheet.png');
  const times = Array.from({ length: 12 }, (_, i) => (0.3 + i * 0.2).toFixed(1)).join(',');
  const r = spawnSync(process.execPath, [STILL_CLI, dir, times, out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const png = readFileSync(out);
  const w = Math.round(1080 * 0.3);
  const h = Math.round(1920 * 0.3);
  assert.equal(png.readUInt32BE(16), 12 + 4 * (w + 12), 'four columns, not twelve');
  assert.equal(png.readUInt32BE(20), 12 + 3 * (h + 12), 'three rows');
});

test('still.mjs: a fifth frame starts a second row', SLOW, (t) => {
  const dir = project(t);
  const out = join(tempDir(t, 'paim-stills'), 'sheet.png');
  const r = spawnSync(process.execPath, [STILL_CLI, dir, '0.3,0.6,0.9,1.2,1.5', out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const png = readFileSync(out);
  assert.equal(png.readUInt32BE(16), 12 + 4 * (Math.round(1080 * 0.3) + 12));
  assert.equal(png.readUInt32BE(20), 12 + 2 * (Math.round(1920 * 0.3) + 12));
});
