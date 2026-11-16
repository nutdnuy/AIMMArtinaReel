import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkProject, deadBeats } from '../../skills/paim-reel/scripts/check.mjs';
import { copyFixture, tempDir } from '../helpers.mjs';

const SLOW = { timeout: 120_000 };
const CHECK_CLI = fileURLToPath(new URL('../../skills/paim-reel/scripts/check.mjs', import.meta.url));

// A fixture copy, an empty profile folder, and (optionally) a story edited before the check.
function project(t, name = 'mini', edit) {
  process.env.PAIM_CONFIG_DIR = tempDir(t, 'paim-config');
  const dir = copyFixture(t, name);
  if (edit) {
    const file = join(dir, 'story.json');
    const story = JSON.parse(readFileSync(file, 'utf8'));
    edit(story);
    writeFileSync(file, JSON.stringify(story));
  }
  return dir;
}

// mini with a pill in the phone-button column.
const rightUi = (story) => story.scenes[0].items.push(
  { id: 'btn', type: 'pill', text: 'ติดตาม', bg: 'orange', at: 'l01', x: 940, y: 1100 },
);

const problems = (findings) => findings.map((f) => f.problem);

test('deadBeats', () => {
  const r = { voiceEnd: 10, scenes: [{ t0: 0, items: [{ t: 0 }, { t: 2.5 }, { t: 6.0 }], marks: [{ t: 8.9 }] }] };
  assert.deepEqual(deadBeats(r), [{ t0: 2.5, t1: 6.0 }]);
  assert.deepEqual(deadBeats({ voiceEnd: 10, scenes: [{ t0: 0, items: [{ t: 0 }], marks: [] }] }), [{ t0: 0, t1: 10 }]);
});

test('deadBeats counts headlines and scene starts, and a gap of exactly maxGap is fine', () => {
  const r = {
    voiceEnd: 9,
    scenes: [
      { t0: 0, headline: { t: 3 }, items: [], marks: [] },
      { t0: 6, items: [], marks: [] },
    ],
  };
  assert.deepEqual(deadBeats(r), []);
  assert.deepEqual(deadBeats(r, 2.5), [{ t0: 0, t1: 3 }, { t0: 3, t1: 6 }, { t0: 6, t1: 9 }]);
});

test('mini passes', SLOW, async (t) => {
  const c = await checkProject(project(t));
  assert.equal(c.pass, true);
  assert.deepEqual([c.text, c.deadBeats, c.overlaps], [[], [], []]);
});

test('Thai stacked marks are not clipped', SLOW, async (t) => {
  // fixture thai-marks: captions 'ที่', 'น้ำ', 'ปั๊ม', 'ผู้ถือหุ้นกู้', 'กี่ปี'; item labels 'ผู้ถือหุ้นกู้'
  const c = await checkProject(project(t, 'thai-marks'));
  assert.equal(c.text.filter((f) => f.problem === 'clipped').length, 0);
  assert.equal(c.pass, true);
});

test('same fixture passes on the fallback font and reports it', SLOW, async (t) => {
  const c = await checkProject(project(t, 'thai-marks'), { forceFallback: true });
  assert.equal(c.font, 'IBM Plex Sans Thai');
  assert.equal(c.pass, true);
});

test('default font is reported', SLOW, async (t) => {
  const c = await checkProject(project(t));
  if (process.platform === 'darwin') assert.equal(c.font, 'Sukhumvit Set');
  else assert.ok(['Sukhumvit Set', 'IBM Plex Sans Thai'].includes(c.font));
});

test('text in the phone-button column fails', SLOW, async (t) => {
  const c = await checkProject(project(t, 'mini', rightUi));
  assert.equal(c.pass, false);
  const hit = c.text.find((f) => f.problem === 'right-ui');
  assert.ok(hit, `no right-ui finding in ${JSON.stringify(c.text)}`);
  assert.equal(hit.text, 'ติดตาม');
});

test('item over the caption fails', SLOW, async (t) => {
  // an icon placed inside the caption zone
  const c = await checkProject(project(t, 'mini', (story) => {
    Object.assign(story.scenes[0].items[0], { x: 540, y: 1360 });
  }));
  assert.equal(c.pass, false);
  assert.ok(c.overlaps.some((f) => f.problem === 'overlap' && f.kind === 'caption'), JSON.stringify(c.overlaps));
});

test('a very long headline produces a finding', SLOW, async (t) => {
  const c = await checkProject(project(t, 'mini', (story) => {
    story.scenes[0].headline = { text: 'หุ้นกับกองทุนรวมอีทีเอฟต่างกันอย่างไรและควรเลือกแบบไหนดีสำหรับมือใหม่ที่เพิ่งเริ่มลงทุนเป็นครั้งแรก '.repeat(3) };
  }));
  assert.equal(c.pass, false);
  const findings = [...c.text, ...c.overlaps].filter((f) => f.kind === 'headline');
  assert.ok(findings.length > 0, 'no finding on the headline');
  assert.ok(problems(findings).every((p) => ['outside-safe', 'overlap'].includes(p)));
});

test('CLI exit code', SLOW, (t) => {
  const run = (dir) => spawnSync('node', [CHECK_CLI, dir], { encoding: 'utf8', env: process.env, timeout: 100_000 });
  const ok = run(project(t));
  assert.equal(ok.status, 0, ok.stderr);
  for (const line of [/^font: /m, /^text: PASS$/m, /^dead beats: PASS$/m, /^overlap: PASS$/m]) assert.match(ok.stdout, line);
  const bad = run(project(t, 'mini', rightUi));
  assert.equal(bad.status, 1, bad.stderr);
  assert.match(bad.stdout, /^font: /m);
  assert.match(bad.stdout, /^text: FAIL \(\d+\)$/m);
  assert.match(bad.stdout, /^dead beats: PASS$/m);
  assert.match(bad.stdout, /^overlap: PASS$/m);
  assert.match(bad.stdout, /right-ui/);
  assert.match(bad.stdout, /ติดตาม/);
});
