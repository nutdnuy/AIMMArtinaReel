import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ENTER_DUR, EXIT_DUR, enterState, idleState, itemState, progress, numberAt, barAt,
} from '../../skills/paim-reel/engine/motion.mjs';

const it = { t: 1.0, enter: 'pop', idle: 'none', seed: 3 };

test('durations', () => {
  assert.equal(ENTER_DUR, 0.40);
  assert.equal(EXIT_DUR, 0.20);
});

test('hidden before its time', () => assert.equal(itemState(it, 0.99).visible, false));

test('settled after ENTER_DUR', () => {
  const s = itemState(it, 1.0 + ENTER_DUR);
  assert.deepEqual([s.visible, s.opacity, s.dx, s.dy, s.rot], [true, 1, 0, 0, 0]);
  assert.ok(Math.abs(s.scale - 1) < 1e-9);
});

test('every enter kind ends at identity', () => {
  for (const kind of ['pop', 'drop', 'slide-l', 'slide-r', 'rise', 'fade']) {
    const s = enterState(kind, 1);
    assert.deepEqual([s.opacity, s.dx, s.dy, s.rot], [1, 0, 0, 0], kind);
    assert.ok(Math.abs(s.scale - 1) < 1e-9, kind);
  }
});

test('opacity reaches 1 at p = 0.4', () => {
  for (const kind of ['pop', 'drop', 'slide-l', 'slide-r', 'rise', 'fade']) {
    assert.equal(enterState(kind, 0).opacity, 0, kind);
    assert.ok(enterState(kind, 0.2).opacity > 0 && enterState(kind, 0.2).opacity < 1, kind);
    assert.equal(enterState(kind, 0.4).opacity, 1, kind);
  }
});

test('pop starts at scale 0', () => assert.equal(enterState('pop', 0).scale, 0));

test('pop overshoots', () => assert.ok(enterState('pop', 0.7).scale > 1));

test('start offsets', () => {
  assert.equal(enterState('drop', 0).dy, -420);
  assert.equal(enterState('slide-l', 0).dx, -520);
  assert.equal(enterState('slide-r', 0).dx, 520);
  assert.equal(enterState('rise', 0).dy, 260);
});

test('fade changes opacity only', () => {
  const s = enterState('fade', 0.1);
  assert.deepEqual([s.dx, s.dy, s.scale, s.rot], [0, 0, 1, 0]);
});

test('deterministic', () => assert.deepEqual(
  itemState({ ...it, idle: 'bob' }, 2.345),
  itemState({ ...it, idle: 'bob' }, 2.345),
));

test('bob stays within 10 px', () => {
  let peak = 0;
  for (let k = 0; k <= 600; k++) {
    const t = 1.0 + k / 60;
    const s = itemState({ ...it, idle: 'bob' }, t);
    assert.ok(Math.abs(s.dy) <= 10 + 1e-9, `dy ${s.dy} at ${t}`);
    assert.ok(Math.abs(idleState('bob', k / 60, 3).dy) <= 10 + 1e-9);
    peak = Math.max(peak, Math.abs(s.dy));
  }
  assert.ok(peak > 9.9, `bob should actually move, peak ${peak}`);
});

test('idle formulas', () => {
  const ts = 0.7;
  const seed = 2;
  assert.ok(Math.abs(idleState('bob', ts, seed).dy - 10 * Math.sin(2 * Math.PI * ts / 2.4 + seed)) < 1e-12);
  assert.ok(Math.abs(idleState('sway', ts, seed).rot - 3 * Math.sin(2 * Math.PI * ts / 3.0 + seed)) < 1e-12);
  assert.ok(Math.abs(idleState('pulse', ts, seed).scale - (1 + 0.04 * Math.sin(2 * Math.PI * ts / 1.6 + seed))) < 1e-12);
  assert.deepEqual(idleState('none', ts, seed), { dx: 0, dy: 0, scale: 1, rot: 0 });
});

test('exit: fading during EXIT_DUR, gone after', () => {
  const ex = { ...it, exitT: 2.0 };
  const mid = itemState(ex, 2.1);
  assert.equal(mid.visible, true);
  assert.ok(Math.abs(mid.opacity - 0.5) < 1e-9, `opacity ${mid.opacity}`);
  assert.equal(itemState(ex, 2.2).visible, false);
  assert.equal(itemState(ex, 1.99).opacity, 1);
});

test('progress is clamped', () => {
  assert.equal(progress(0, 1, 2), 0);
  assert.equal(progress(2, 1, 2), 0.5);
  assert.equal(progress(9, 1, 2), 1);
});

test('numberAt', () => {
  const n = { t: 1, from: 0, to: 7.5, decimals: 1, prefix: '', suffix: '%' };
  assert.equal(numberAt(n, 0.5), '0.0%');
  assert.equal(numberAt(n, 1.8), '7.5%');
  assert.equal(numberAt(n, 9), '7.5%');
  assert.equal(numberAt({ ...n, prefix: '฿', suffix: '', decimals: 0, to: 120 }, 9), '฿120');
});

test('numberAt never shows a negative zero', () => {
  const n = { t: 0, from: -0.01, to: 0, decimals: 1, prefix: '', suffix: '' };
  assert.equal(numberAt(n, 0), '0.0');
});

test('barAt', () => {
  const b = { t: 2, value: 0.6 };
  assert.equal(barAt(b, 1.9), 0);
  assert.equal(barAt(b, 2), 0);
  const mid = barAt(b, 2.3);
  assert.ok(mid > 0 && mid < 0.6);
  assert.ok(Math.abs(barAt(b, 2.6) - 0.6) < 1e-9);
  assert.equal(barAt(b, 5), 0.6);
});
