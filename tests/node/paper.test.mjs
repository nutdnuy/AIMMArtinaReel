import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rng, hashSeed, tornPath, flecks, fibres } from '../../skills/paim-reel/engine/paper.mjs';

// The [x, y] points of an SVG path made of M, L and Z commands.
function pointsOf(d) {
  const nums = d.replace(/[MLZ]/g, ' ').trim().split(/\s+/).map(Number);
  assert.ok(nums.length >= 8 && nums.length % 2 === 0, `odd or short path: ${d.slice(0, 80)}`);
  assert.ok(nums.every(Number.isFinite), 'every coordinate is a number');
  const pts = [];
  for (let i = 0; i < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  return pts;
}

test('rng is seeded and stays in [0, 1)', () => {
  const a = rng(7);
  const b = rng(7);
  const xs = Array.from({ length: 1000 }, () => a());
  assert.deepEqual(xs, Array.from({ length: 1000 }, () => b()));
  assert.ok(xs.every((x) => x >= 0 && x < 1));
  assert.notDeepEqual(xs.slice(0, 10), Array.from({ length: 10 }, rng(8)));
});

test('hashSeed tells texts apart and is stable', () => {
  assert.notEqual(hashSeed('a'), hashSeed('b'));
  assert.equal(hashSeed('etf-vs-stock'), hashSeed('etf-vs-stock'));
  assert.ok(Number.isInteger(hashSeed('mini')) && hashSeed('mini') >= 0);
});

test('same seed, same paper; another seed, another paper', () => {
  assert.equal(tornPath(1008, 1848, 5), tornPath(1008, 1848, 5));
  assert.notEqual(tornPath(1008, 1848, 5), tornPath(1008, 1848, 6));
  assert.deepEqual(flecks(5, 1080, 1920), flecks(5, 1080, 1920));
  assert.notDeepEqual(flecks(5, 1080, 1920), flecks(6, 1080, 1920));
  assert.deepEqual(fibres(5, 1080, 1920), fibres(5, 1080, 1920));
  assert.notDeepEqual(fibres(5, 1080, 1920), fibres(6, 1080, 1920));
});

test('tornPath is closed and every point lies in the box, within rough of its edge', () => {
  for (const [w, h, seed, rough] of [[1008, 1848, 1, 14], [1008, 1848, 99, 14], [400, 300, 3, 20], [120, 80, 4, 6]]) {
    const d = tornPath(w, h, seed, rough);
    assert.match(d, /^M /);
    assert.match(d, /Z$/);
    const pts = pointsOf(d);
    assert.ok(pts.length > 40, `${pts.length} points is too smooth for a torn edge`);
    for (const [x, y] of pts) {
      assert.ok(x >= 0 && x <= w && y >= 0 && y <= h, `(${x}, ${y}) is outside ${w}x${h}`);
      assert.ok(Math.min(x, y, w - x, h - y) <= rough, `(${x}, ${y}) is more than ${rough} px inside the edge`);
    }
  }
  assert.equal(tornPath(1008, 1848, 1), tornPath(1008, 1848, 1, 14), 'rough defaults to 14');
});

test('flecks: 46 inside the canvas, in the three allowed colours', () => {
  for (const seed of [1, 2, hashSeed('mini')]) {
    const list = flecks(seed, 1080, 1920);
    assert.equal(list.length, 46);
    for (const f of list) {
      assert.ok(f.x >= 0 && f.x <= 1080 && f.y >= 0 && f.y <= 1920, JSON.stringify(f));
      assert.ok(f.len >= 6 && f.len <= 26, `length ${f.len}`);
      assert.ok(['orange', 'green', 'charcoal'].includes(f.color), f.color);
      assert.ok(Number.isFinite(f.rot));
    }
    assert.equal(new Set(list.map((f) => f.color)).size, 3, 'all three colours are used');
  }
});

test('fibres: 260 of 40 to 220 px, lighter or darker', () => {
  const list = fibres(3, 1080, 1920);
  assert.equal(list.length, 260);
  for (const f of list) {
    assert.ok(f.x >= 0 && f.x <= 1080 && f.y >= 0 && f.y <= 1920, JSON.stringify(f));
    assert.ok(f.len >= 40 && f.len <= 220, `length ${f.len}`);
    assert.ok(f.tone === 1 || f.tone === -1, `tone ${f.tone}`);
    assert.ok(Number.isFinite(f.rot) && Number.isFinite(f.bend));
  }
  assert.ok(list.some((f) => f.tone === 1) && list.some((f) => f.tone === -1));
});
