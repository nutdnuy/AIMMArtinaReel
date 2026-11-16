import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadBrand } from '../../skills/paim-reel/lib/brand.mjs';
import { resolveAnchor, validateStory, StoryError } from '../../skills/paim-reel/lib/story.mjs';

const fixture = (name) => JSON.parse(readFileSync(
  fileURLToPath(new URL(`../fixtures/mini/${name}`, import.meta.url)), 'utf8'));
const T = fixture('timing.json');
const S = fixture('story.json');
const brand = loadBrand();

// Run validateStory and return the problems it reports.
function problemsOf(story, assets) {
  try {
    validateStory(story, T, brand, assets);
  } catch (e) {
    assert.ok(e instanceof StoryError, `expected StoryError, got ${e}`);
    return e.problems;
  }
  return assert.fail('validateStory accepted a bad story');
}

// A story with two scenes (s1 from l01, s2 from l02), each holding one icon.
function twoScenes() {
  const s = structuredClone(S);
  s.scenes[0].layout = 'center';
  s.scenes[0].items = [{ id: 'a', type: 'icon', icon: 'coins', color: 'orange', at: 'l01' }];
  s.scenes.push({
    id: 's2', from: 'l02', layout: 'center', bg: 'charcoal',
    items: [{ id: 'b', type: 'icon', icon: 'basket', color: 'cream', at: 'l02' }],
  });
  return s;
}

test('anchors', () => {
  assert.equal(resolveAnchor('l02', T), 1.60);
  assert.equal(resolveAnchor('l02@1', T), 1.95);
  assert.ok(Math.abs(resolveAnchor('l02@1+0.2', T) - 2.15) < 1e-9);
  assert.ok(Math.abs(resolveAnchor('l02-0.1', T) - 1.5) < 1e-9);
  assert.throws(() => resolveAnchor('l09', T), /l09/);
  assert.throws(() => resolveAnchor('l02@7', T), /l02@7/);
  assert.throws(() => resolveAnchor('02', T), /anchor/i);
  assert.throws(() => resolveAnchor('l02@1+', T), /anchor/i);
  assert.throws(() => resolveAnchor(5, T), /anchor/i);
});

test('resolves the mini story', () => {
  const r = validateStory(S, T, brand);
  assert.equal(r.duration, 5.0);
  assert.equal(r.voiceEnd, 3.0);
  assert.equal(r.estimated, true);
  assert.equal(r.slug, 'mini');
  assert.deepEqual([r.width, r.height, r.fps], [1080, 1920, 30]);
  assert.equal(r.scenes[0].t0, 0);
  assert.equal(r.scenes[0].t1, 3.0);
  assert.equal(r.scenes[0].bg, 'cream');
  assert.equal(r.scenes[0].items[0].t, 0.25);
  assert.equal(r.scenes[0].items[1].t, 1.60);
  assert.deepEqual(r.endCard.t0, 3.0);
  assert.equal(r.endCard.t1, 5.0);
  assert.equal(r.captions.length, 5);
  assert.equal(r.captions[4].highlight, true);
  assert.equal(r.captions[0].bg, 'cream');
});

test('items carry defaults, a rect, the slot they fill and a story-wide seed', () => {
  const r = validateStory(twoScenes(), T, brand);
  const [a, b] = [r.scenes[0].items[0], r.scenes[1].items[0]];
  assert.deepEqual([a.enter, a.idle, a.weight], ['pop', 'none', 'fill']);
  assert.deepEqual([a.seed, b.seed], [0, 1]);
  assert.deepEqual(a.rect, { x: 240, y: 500, w: 600, h: 600 });
  assert.equal(r.scenes[0].t1, 1.6);
  assert.equal(r.scenes[1].t0, 1.6);
  assert.equal(r.scenes[1].t1, 3.0);
  assert.equal(r.scenes[1].bg, 'charcoal');
  assert.equal(r.captions.find((c) => c.t0 === 1.6).bg, 'charcoal');
});

test('exit, headline and marks resolve to absolute times', () => {
  const s = structuredClone(S);
  s.scenes[0].headline = { text: 'หุ้น vs ETF', at: 'l01@1' };
  s.scenes[0].items[0].exit = 'l02@1';
  s.scenes[0].marks = [
    { type: 'arrow', from: 'stock', to: 'etf', at: 'l02@1' },
    { type: 'ring', on: 'etf', at: 'l02@2' },
    { type: 'cross', on: 'stock', at: 'l02@2+0.1' },
  ];
  const sc = validateStory(s, T, brand).scenes[0];
  assert.deepEqual(sc.headline, { text: 'หุ้น vs ETF', t: 0.8 });
  assert.equal(sc.items[0].exitT, 1.95);
  assert.deepEqual(sc.marks.map((m) => [m.type, m.t]), [['arrow', 1.95], ['ring', 2.3], ['cross', 2.4]]);
  assert.deepEqual([sc.marks[0].from, sc.marks[0].to, sc.marks[1].on], ['stock', 'etf', 'etf']);
});

test('an item with x and y takes no slot and does not count toward capacity', () => {
  const s = structuredClone(S);
  s.scenes[0].items.push({ id: 'free', type: 'pill', text: 'ใหม่', bg: 'orange', at: 'l02', x: 540, y: 1000, size: 100 });
  const sc = validateStory(s, T, brand).scenes[0];
  assert.deepEqual(sc.items[2].rect, { x: 490, y: 950, w: 100, h: 100 });
  assert.equal(sc.items[2].x, undefined);
  assert.deepEqual(sc.items[1].rect, { x: 140, y: 820, w: 800, h: 340 }, 'slots count only the other two');
  assert.equal(sc.items[0].rect.y + sc.items[0].rect.h <= 800, true);
  const t = structuredClone(s);
  t.scenes[0].items.splice(1, 0, { id: 'c', type: 'pill', text: 'x', bg: 'green', at: 'l02' });
  assert.ok(problemsOf(t).some((p) => /versus/.test(p)), 'three slotted items still overflow');
});

test('default size of a free item is 240', () => {
  const s = structuredClone(S);
  s.scenes[0].items[0].x = 300; s.scenes[0].items[0].y = 700;
  const r = validateStory(s, T, brand).scenes[0].items[0].rect;
  assert.deepEqual(r, { x: 180, y: 580, w: 240, h: 240 });
});

test('number and bar items resolve with their defaults', () => {
  const s = structuredClone(S);
  s.scenes[0].items = [
    { id: 'n', type: 'number', to: 7, suffix: '%', color: 'green', source: 'บริษัท ตัวอย่าง', at: 'l01' },
    { id: 'p', type: 'bar', value: 0.5, color: 'orange', at: 'l02' },
  ];
  const [n, p] = validateStory(s, T, brand).scenes[0].items;
  assert.deepEqual([n.from, n.to, n.decimals, n.prefix, n.suffix], [0, 7, 0, '', '%']);
  assert.equal(p.value, 0.5);
});

test('reports every problem at once', () => {
  const bad = structuredClone(S);
  bad.scenes[0].items[0].icon = 'pigy-bank';
  bad.scenes[0].items[1].icon = 'google-logo';
  bad.scenes[0].items[1].at = 'l05';
  bad.scenes[0].items.push({ id: 'n', type: 'number', to: 7, suffix: '%', color: 'green', at: 'l02' }); // no source; 3 items > versus capacity
  assert.throws(() => validateStory(bad, T, brand), (e) =>
    e instanceof StoryError && e.problems.length >= 5
    && e.problems.some((p) => /piggy-bank/.test(p)) && e.problems.some((p) => /brand/i.test(p))
    && e.problems.some((p) => /l05/.test(p)) && e.problems.some((p) => /source/.test(p))
    && e.problems.some((p) => /versus/.test(p)));
});

test('an unresolvable anchor is one problem, and an over-full layout is one problem', () => {
  const bad = structuredClone(S);
  bad.scenes[0].items[1].at = 'l05';
  const one = problemsOf(bad);
  assert.equal(one.length, 1);
  assert.match(one[0], /l05/);

  const full = structuredClone(S);
  full.scenes[0].layout = 'center';
  full.scenes[0].items.push({ id: 'x', type: 'pill', text: 'x', bg: 'orange', at: 'l02' });
  const two = problemsOf(full);
  assert.equal(two.length, 1, two.join('\n'));
  assert.match(two[0], /center/);
});

test('sprite must have been generated', () => {
  const sp = structuredClone(S);
  sp.scenes[0].items[1] = { id: 'b', type: 'sprite', sprite: 'basket', label: 'ETF', at: 'l02' };
  assert.throws(() => validateStory(sp, T, brand),
    (e) => e.problems.some((p) => /basket/.test(p) && /gen_sprites\.py/.test(p)));
  assert.equal(validateStory(sp, T, brand, { sprites: ['basket'] }).scenes[0].items[1].sprite, 'basket');
});

// Each mutation below breaks exactly one rule, so each must produce a problem naming it.
const REJECTIONS = [
  ['duplicate item id in a scene', (s) => { s.scenes[0].items[1].id = 'stock'; }, /duplicate.*stock/i],
  ['item at outside its scene', (s) => {
    const x = twoScenes(); Object.assign(s, x); s.scenes[0].items[0].at = 'l02';
  }, /outside/i],
  ['scenes out of time order', (s) => {
    const x = twoScenes(); Object.assign(s, x); s.scenes[1].from = 'l01';
  }, /order|after/i],
  ['first scene not from the first line', (s) => { s.scenes[0].from = 'l02'; }, /first scene.*l01/i],
  ['mark pointing at an unknown item', (s) => {
    s.scenes[0].marks = [{ type: 'ring', on: 'ghost', at: 'l02' }];
  }, /ghost/],
  ['arrow pointing at an unknown item', (s) => {
    s.scenes[0].marks = [{ type: 'arrow', from: 'stock', to: 'ghost', at: 'l02' }];
  }, /ghost/],
  ['unknown mark type', (s) => { s.scenes[0].marks = [{ type: 'star', on: 'stock', at: 'l02' }]; }, /star/],
  ['unknown layout', (s) => { s.scenes[0].layout = 'diagonal'; }, /diagonal/],
  ['unknown enter', (s) => { s.scenes[0].items[0].enter = 'zoom'; }, /zoom/],
  ['unknown idle', (s) => { s.scenes[0].items[0].idle = 'spin'; }, /spin/],
  ['unknown scene bg', (s) => { s.scenes[0].bg = 'orange'; }, /orange/],
  ['unknown icon colour', (s) => { s.scenes[0].items[0].color = 'purple'; }, /purple/],
  ['unknown item type', (s) => { s.scenes[0].items[0].type = 'video'; }, /video/],
  ['slug with spaces', (s) => { s.slug = 'my reel'; }, /slug/],
  ['empty title', (s) => { s.title = ''; }, /title/],
  ['number.source blank', (s) => {
    s.scenes[0].items[0] = { id: 'n', type: 'number', to: 3, color: 'green', source: '  ', at: 'l01' };
  }, /source/],
  ['bar.value above 1', (s) => {
    s.scenes[0].items[0] = { id: 'p', type: 'bar', value: 1.2, color: 'green', at: 'l01' };
  }, /value/],
  ['pill without text', (s) => {
    s.scenes[0].items[0] = { id: 'p', type: 'pill', bg: 'green', at: 'l01' };
  }, /text/],
  ['pill bg outside the brand pairs', (s) => {
    s.scenes[0].items[0] = { id: 'p', type: 'pill', text: 'x', bg: 'cream', at: 'l01' };
  }, /cream/],
  ['x without y', (s) => { s.scenes[0].items[0].x = 100; }, /\bx\b.*\by\b|\by\b.*\bx\b/],
  ['slot beyond the layout', (s) => { s.scenes[0].items[0].slot = 5; }, /slot/],
  ['unresolvable highlight', (s) => { s.highlight = ['l02@9']; }, /l02@9/],
  ['bad exit anchor', (s) => { s.scenes[0].items[0].exit = 'soon'; }, /soon/],
  ['exit before the item appears', (s) => { s.scenes[0].items[1].exit = 'l01'; }, /exit/],
  ['no scenes', (s) => { s.scenes = []; }, /scenes/],
  ['icon weight', (s) => { s.scenes[0].items[0].weight = 'bold'; }, /weight/],
];

for (const [name, mutate, pattern] of REJECTIONS) {
  test(`rejects: ${name}`, () => {
    const s = structuredClone(S);
    mutate(s);
    const problems = problemsOf(s);
    assert.ok(problems.some((p) => pattern.test(p)), `no problem matched ${pattern}:\n${problems.join('\n')}`);
  });
}

test('a story that is not an object is rejected, not crashed on', () => {
  for (const bad of [null, 'x', [], 5]) {
    assert.throws(() => validateStory(bad, T, brand), StoryError);
  }
});

test('StoryError lists problems in its message', () => {
  const s = structuredClone(S);
  s.slug = 'bad slug';
  s.title = '';
  assert.throws(() => validateStory(s, T, brand),
    (e) => e.problems.length === 2 && e.message.includes(e.problems[0]) && e.message.includes(e.problems[1]));
});
