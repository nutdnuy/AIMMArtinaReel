import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildCaptions, captionAt } from '../../skills/paim-reel/engine/captions.mjs';

const T = JSON.parse(readFileSync(
  fileURLToPath(new URL('../fixtures/mini/timing.json', import.meta.url)), 'utf8'));
const bgAt = () => 'cream';

test('a caption runs from its token to the next token in the line', () => {
  const c = buildCaptions(T, [], bgAt);
  assert.equal(c.length, 5);
  assert.deepEqual([c[0].t0, c[0].t1, c[0].text], [0.25, 0.8, 'หุ้นคือ']);
  assert.deepEqual([c[3].t0, c[3].t1], [1.95, 2.3]);
});

test('the last caption of a line holds 0.40 s, but not into the next line', () => {
  const c = buildCaptions(T, [], bgAt);
  assert.equal(c[1].t1, 1.6);   // min(1.30 + 0.40, 1.60)
});

test('the final caption ends at voiceEnd, never over the end card', () => {
  const c = buildCaptions(T, [], bgAt);
  assert.equal(c[4].t1, 3.0);   // min(2.75 + 0.40, 3.0)
});

test('the last caption of a line gets the full 0.40 s when there is room', () => {
  const t = structuredClone(T);
  t.duration = 9;
  t.lines[1].t0 = 4; t.lines[1].tokens.forEach((k, i) => { k.t0 = 4 + i * 0.3; k.t1 = k.t0 + 0.3; });
  t.lines[1].t1 = 4.9;
  const c = buildCaptions(t, [], bgAt);
  assert.equal(c[1].t1, 1.7);
  assert.equal(c[4].t1, 5.3);
});

test('captionAt', () => {
  const c = buildCaptions(T, [], bgAt);
  assert.equal(captionAt(c, 0.10), null);
  assert.equal(captionAt(c, 0.30).text, 'หุ้นคือ');
  assert.equal(captionAt(c, 0.85).text, 'บริษัทเดียว');
  assert.equal(captionAt(c, 0.8).text, 'บริษัทเดียว', 'a boundary belongs to the later caption');
  assert.equal(captionAt(c, 1.65).text, 'ETF', 'the next line starts as the last caption ends');
  assert.equal(captionAt(c, 3.0), null, 'nothing over the end card');
});

test('captions never overlap in time', () => {
  const c = buildCaptions(T, [], bgAt);
  c.forEach((k, i) => {
    assert.ok(k.t1 > k.t0);
    if (i) assert.ok(c[i - 1].t1 <= k.t0);
  });
});

test('highlight marks the addressed phrase, offsets ignored', () => {
  const c = buildCaptions(T, ['l02@2', 'l01+0.1'], bgAt);
  assert.deepEqual(c.map((k) => k.highlight), [true, false, false, false, true]);
});

test('bg comes from sceneBgAt at the caption start', () => {
  const c = buildCaptions(T, [], (t) => (t < 1 ? 'cream' : 'charcoal'));
  assert.deepEqual(c.map((k) => k.bg), ['cream', 'cream', 'charcoal', 'charcoal', 'charcoal']);
});
