import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  W, H, FPS, END_CARD, SAFE, RIGHT_UI, HEADLINE, CONTENT, CAPTION, CAPACITY, slotRect,
} from '../../skills/paim-reel/engine/layout.mjs';

const inside = (r, box) => r.x >= box.x && r.y >= box.y
  && r.x + r.w <= box.x + box.w && r.y + r.h <= box.y + box.h;
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function slots(layout, count) {
  return Array.from({ length: count }, (_, i) => slotRect(layout, count, i));
}

function assertDisjointInContent(rects) {
  rects.forEach((r, i) => {
    assert.ok(r.w > 0 && r.h > 0, `slot ${i} has an area`);
    assert.ok(inside(r, CONTENT), `slot ${i} inside CONTENT`);
    rects.slice(i + 1).forEach((o, j) => assert.ok(!overlap(r, o), `slots ${i} and ${i + 1 + j} overlap`));
  });
}

test('constants', () => {
  assert.deepEqual([W, H, FPS, END_CARD], [1080, 1920, 30, 2.0]);
  assert.deepEqual(SAFE, { x0: 70, y0: 220, x1: 1010, y1: 1500 });
  assert.deepEqual(RIGHT_UI, { x0: 930, y0: 1000, x1: 1080, y1: 1920 });
  assert.deepEqual(HEADLINE, { x: 90, y: 240, w: 900, h: 170 });
  assert.deepEqual(CONTENT, { x: 90, y: 440, w: 900, h: 720 });
  assert.deepEqual(CAPTION, { x: 180, y: 1250, w: 720, h: 230 });
  assert.deepEqual(CAPACITY, { center: 1, row: 3, stack: 3, versus: 2, grid: 6 });
});

test('center slot is centred in CONTENT', () => {
  const r = slotRect('center', 1, 0);
  assert.equal(r.x + r.w / 2, 540);
  assert.equal(r.y + r.h / 2, 800);
});

test('row slots do not overlap and stay inside CONTENT', () => {
  for (const count of [1, 2, 3]) {
    const rects = slots('row', count);
    assertDisjointInContent(rects);
    rects.forEach((r, i) => i && assert.ok(r.x > rects[i - 1].x, 'left to right'));
    const left = rects[0].x;
    const right = rects[count - 1].x + rects[count - 1].w;
    assert.equal(left + right, 1080, 'the row is centred');
  }
});

test('stack slots run top to bottom without overlap', () => {
  for (const count of [1, 2, 3]) {
    const rects = slots('stack', count);
    assertDisjointInContent(rects);
    rects.forEach((r, i) => i && assert.ok(r.y > rects[i - 1].y, 'top to bottom'));
  }
});

test('versus: slot 0 above y=800, slot 1 below', () => {
  const a = slotRect('versus', 2, 0);
  const b = slotRect('versus', 2, 1);
  assert.ok(a.y + a.h <= 800);
  assert.ok(b.y >= 800);
  assertDisjointInContent([a, b]);
});

test('grid 6 = 2 columns x 3 rows, no overlaps', () => {
  const rects = slots('grid', 6);
  assertDisjointInContent(rects);
  assert.equal(new Set(rects.map((r) => r.x)).size, 2);
  assert.equal(new Set(rects.map((r) => r.y)).size, 3);
  assert.ok(rects[1].x > rects[0].x && rects[1].y === rects[0].y, 'fills left to right first');
  assert.ok(rects[2].y > rects[0].y);
});

test('grid with fewer items keeps the cell size and stays inside CONTENT', () => {
  for (const count of [1, 2, 3, 4, 5]) assertDisjointInContent(slots('grid', count));
  const lone = slotRect('grid', 3, 2);
  assert.equal(lone.x + lone.w / 2, 540, 'a lone last cell is centred');
});

test('slot >= count or count > CAPACITY throws RangeError', () => {
  assert.throws(() => slotRect('row', 2, 2), RangeError);
  assert.throws(() => slotRect('row', 2, -1), RangeError);
  assert.throws(() => slotRect('row', 2, 0.5), RangeError);
  assert.throws(() => slotRect('row', 4, 0), RangeError);
  assert.throws(() => slotRect('center', 2, 0), RangeError);
  assert.throws(() => slotRect('versus', 3, 0), RangeError);
  assert.throws(() => slotRect('grid', 7, 0), RangeError);
  assert.throws(() => slotRect('row', 0, 0), RangeError);
  assert.throws(() => slotRect('diagonal', 1, 0), /diagonal/);
});
