import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkProject, deadBeats } from '../../skills/paim-reel/scripts/check.mjs';
import { buildProject } from '../../skills/paim-reel/scripts/build.mjs';
import { openPage } from '../../skills/paim-reel/lib/serve.mjs';
import { SAFE } from '../../skills/paim-reel/engine/layout.mjs';
import { ENTER_DUR } from '../../skills/paim-reel/engine/motion.mjs';
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

const LONG_HEADLINE = 'หุ้นกับกองทุนรวมอีทีเอฟต่างกันอย่างไรและควรเลือกแบบไหนดีสำหรับมือใหม่ที่เพิ่งเริ่มลงทุนเป็นครั้งแรก '.repeat(3);

test('a very long headline leaves its zone: outside-safe on the headline', SLOW, async (t) => {
  const c = await checkProject(project(t, 'mini', (story) => {
    story.scenes[0].headline = { text: LONG_HEADLINE };
  }));
  assert.equal(c.pass, false);
  assert.ok(c.text.some((f) => f.kind === 'headline' && f.problem === 'outside-safe'), JSON.stringify(c.text));
});

test('a headline is judged once its pop is over, not while a caption sample catches its overshoot', SLOW, async (t) => {
  // a second scene from l02 with a headline at its start: the l02@0 caption midpoint (1.775 s) falls
  // 0.175 s into the headline's pop, when the pill overshoots its zone
  const c = await checkProject(project(t, 'mini', (story) => {
    const etf = story.scenes[0].items.pop();
    story.scenes.push({ id: 's2', from: 'l02', layout: 'center', headline: { text: 'ETF' }, items: [etf] });
  }));
  assert.deepEqual(c.text, []);
  assert.equal(c.pass, true, JSON.stringify(c));
});

test('a headline over an item is an overlap', SLOW, async (t) => {
  // a normal headline (inside its zone), and an icon whose rect reaches into the headline zone
  const c = await checkProject(project(t, 'mini', (story) => {
    story.scenes[0].headline = { text: 'หุ้น vs ETF' };
    story.scenes[0].items.push({ id: 'high', type: 'icon', icon: 'basket', color: 'green', at: 'l01', x: 540, y: 330 });
  }));
  assert.equal(c.pass, false);
  assert.deepEqual(c.text, []);
  assert.ok(
    c.overlaps.some((f) => f.kind === 'headline' && f.problem === 'overlap' && f.item === 'high'),
    JSON.stringify(c.overlaps),
  );
});

test('a figure too wide for its chip is clipped', SLOW, async (t) => {
  // ten digits in a small number item: the chip cannot fit even at its minimum size
  const c = await checkProject(project(t, 'mini', (story) => {
    story.scenes[0].items.push({ id: 'big', type: 'number', to: 1234567890, color: 'orange', source: 'test', at: 'l01', x: 540, y: 800, size: 120 });
  }));
  assert.equal(c.pass, false);
  assert.ok(c.text.some((f) => f.kind === 'number' && f.problem === 'clipped'), JSON.stringify(c.text));
});

test('a pill that cannot fit its box is clipped', SLOW, async (t) => {
  const c = await checkProject(project(t, 'mini', (story) => {
    story.scenes[0].items.push({ id: 'tiny', type: 'pill', text: 'ผู้ถือหุ้นกู้รายย่อยทั่วไป', bg: 'green', at: 'l01', x: 540, y: 800, size: 60 });
  }));
  assert.equal(c.pass, false);
  assert.ok(c.text.some((f) => f.kind === 'pill' && f.problem === 'clipped'), JSON.stringify(c.text));
});

// mini as a row of 3: the two icons and a pill with `text` in the last slot.
const rowWithPill = (text) => (story) => {
  story.scenes[0].layout = 'row';
  story.scenes[0].items.push({ id: 'p', type: 'pill', text, bg: 'green', at: 'l02' });
};

test('a long Thai pill in a row of 3 does not wrap inside a word: it is clipped', SLOW, async (t) => {
  const c = await checkProject(project(t, 'mini', rowWithPill('ดอกเบี้ยเดิมที่ได้รับทุกปีทบต้น')));
  assert.equal(c.pass, false);
  assert.ok(c.text.some((f) => f.kind === 'pill' && f.problem === 'clipped'), JSON.stringify(c.text));
});

test('a pill that fits a row of 3 stays on one line and passes', SLOW, async (t) => {
  const dir = project(t, 'mini', rowWithPill('ดอกเบี้ยเดิม'));
  const c = await checkProject(dir);
  assert.equal(c.pass, true, JSON.stringify(c));
  const { resolved } = await buildProject(dir);
  const { page, close } = await openPage(dir);
  try {
    const pill = await page.evaluate((s) => {
      window.__paim.seek(s);
      const el = document.querySelector('.pill');
      const r = el.getBoundingClientRect();
      return { h: r.height, size: parseFloat(getComputedStyle(el).fontSize) };
    }, resolved.scenes[0].items[2].t + ENTER_DUR + 0.05);
    assert.ok(pill.h < 2 * 1.4 * pill.size, `one line: ${pill.h} px tall at ${pill.size} px`);
  } finally {
    await close();
  }
});

test('item text pushed past the safe zone is outside-safe, not right-ui', SLOW, async (t) => {
  // y 700 is above the phone-button column (it starts at y 1000), x 960 puts the pill across SAFE.x1
  const c = await checkProject(project(t, 'mini', (story) => {
    story.scenes[0].items.push({ id: 'edge', type: 'pill', text: 'ขอบจอ', bg: 'orange', at: 'l01', x: 960, y: 700 });
  }));
  assert.equal(c.pass, false);
  assert.ok(c.text.some((f) => f.kind === 'pill' && f.text === 'ขอบจอ' && f.problem === 'outside-safe'), JSON.stringify(c.text));
  assert.ok(!c.text.some((f) => f.problem === 'right-ui'), JSON.stringify(c.text));
});

// ---------- idle loops: the verdict must hold for the whole idle cycle, whatever the item's seed

const LABEL = 'หุ้น';
const SEEDS = 4; // dummy items in front of the test item shift its seed: 0, 1, 2, 3

// Where the label of the first mini item rests, in canvas px, with its idle off.
async function restLabelBottom(t, y) {
  const dir = project(t, 'mini', (story) => {
    Object.assign(story.scenes[0].items[0], { x: 150, y });
  });
  const { resolved } = await buildProject(dir);
  const { page, close } = await openPage(dir);
  try {
    const boxes = await page.evaluate((s) => {
      window.__paim.seek(s);
      return window.__paim.textBoxes();
    }, resolved.scenes[0].items[0].t + ENTER_DUR + 0.05);
    const label = boxes.find((b) => b.kind === 'label' && b.text === LABEL);
    return label.rect.y + label.rect.h;
  } finally {
    await close();
  }
}

// mini whose first item sits at x 150 (clear of the captions) with its label resting `inset` px above the
// bottom of SAFE, with the given idle and `seedShift` free icons in front of it.
async function idleProject(t, idle, inset, seedShift) {
  const y0 = 1300;
  const y = y0 + (SAFE.y1 - inset - await restLabelBottom(t, y0));
  return project(t, 'mini', (story) => {
    const items = story.scenes[0].items;
    Object.assign(items[0], { x: 150, y, idle });
    for (let i = 0; i < seedShift; i += 1) {
      items.unshift({ id: `d${i}`, type: 'icon', icon: 'basket', color: 'green', at: 'l01', x: 540, y: 700 });
    }
  });
}

// idle -> px the label rests inside SAFE: less than the loop's reach, so the item leaves SAFE during it
const REST_INSIDE = { bob: 9, sway: 1, pulse: 2 };

for (const [idle, inset] of Object.entries(REST_INSIDE)) {
  test(`an item with idle ${idle} that leaves SAFE during its loop fails, for every seed`, SLOW, async (t) => {
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const c = await checkProject(await idleProject(t, idle, inset, seed));
      assert.equal(c.pass, false, `${idle}, seed shift ${seed}: ${JSON.stringify(c.text)}`);
      assert.ok(c.text.some((f) => f.text === LABEL && f.problem === 'outside-safe'), `${idle}, seed shift ${seed}: ${JSON.stringify(c.text)}`);
    }
  });

  test(`the same item with idle none passes (${idle} rest position)`, SLOW, async (t) => {
    const c = await checkProject(await idleProject(t, 'none', inset, 0));
    assert.equal(c.pass, true, JSON.stringify(c));
  });
}

test('an item with idle bob 1 px inside the reach of its loop passes, for every seed', SLOW, async (t) => {
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const c = await checkProject(await idleProject(t, 'bob', 11, seed));
    assert.equal(c.pass, true, `seed shift ${seed}: ${JSON.stringify(c)}`);
  }
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
