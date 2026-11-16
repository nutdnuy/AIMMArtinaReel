import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrand } from '../../skills/paim-reel/lib/brand.mjs';
import { validateStory, StoryError } from '../../skills/paim-reel/lib/story.mjs';
import { sfxEvents, loadSounds, mixBed, writeFloatWav, SFX_RATE, MAX_EVENTS } from '../../skills/paim-reel/lib/sfx.mjs';
import { tempDir } from '../helpers.mjs';

const fixture = (name) => JSON.parse(readFileSync(
  fileURLToPath(new URL(`../fixtures/mini/${name}`, import.meta.url)), 'utf8'));
const T = fixture('timing.json');
const S = fixture('story.json');
const brand = loadBrand();

// A hand-made Resolved: only the fields sfxEvents reads.
const resolvedOf = (scenes, endAt = 100, extra = {}) => ({ sfx: true, scenes, endCard: { t0: endAt }, ...extra });
const scene = (t0, items = [], marks = []) => ({ t0, items, marks });
const item = (t, enter = 'pop', extra = {}) => ({ type: 'icon', t, enter, ...extra });
const summary = (events) => events.map((e) => `${e.t} ${e.name} ${e.gainDb}`);

test('the mini fixture: a pop for each icon and the chime at the end card', () => {
  const r = validateStory(S, T, brand);
  assert.deepEqual(sfxEvents(r), [
    { t: 0.25, name: 'pop', gainDb: -16 },
    { t: 1.6, name: 'pop', gainDb: -16 },
    { t: 3, name: 'chime', gainDb: -16 },
  ]);
});

test('every rule at once: scene starts, entrances, photo, marks, a number, the end card', () => {
  const events = sfxEvents(resolvedOf([
    scene(0, [
      item(1, 'pop'), item(2, 'drop'), item(3, 'slide-l'), item(4, 'slide-r'), item(5, 'rise'), item(6, 'fade'),
      item(7, 'pop', { type: 'photo' }), item(7.5, 'fade', { type: 'photo' }),
      item(8, 'rise', { type: 'number' }),
    ], [{ type: 'ring', t: 9 }]),
    scene(10),
  ], 12));
  assert.deepEqual(summary(events), [
    '1 pop -16', '2 thud -16', '3 whoosh -20', '4 whoosh -20', '5 whoosh -20',
    '7 paper -18', '7.5 paper -18',
    '8 whoosh -20', '8.2 tick -22', '8.45 tick -22', '8.7 tick -22',
    '9 tick -18', '10 paper -20', '12 chime -16',
  ]);
});

test('the first scene start makes no sound; every later one makes a paper rustle', () => {
  const events = sfxEvents(resolvedOf([scene(0), scene(2), scene(4)], 6));
  assert.deepEqual(summary(events), ['2 paper -20', '4 paper -20', '6 chime -16']);
});

test('a fade entrance gives nothing', () => {
  assert.deepEqual(sfxEvents(resolvedOf([scene(0, [item(1, 'fade')])], 5)).map((e) => e.name), ['chime']);
});

test('a photo gives paper at -18 instead of its entrance sound', () => {
  const events = sfxEvents(resolvedOf([scene(0, [item(1, 'drop', { type: 'photo' })])], 5));
  assert.deepEqual(summary(events), ['1 paper -18', '5 chime -16']);
});

test('sfx: false gives no events', () => {
  const r = validateStory({ ...S, sfx: false }, T, brand);
  assert.equal(r.sfx, false);
  assert.deepEqual(sfxEvents(r), []);
});

test('story.sfx defaults to true and must be a boolean', () => {
  assert.equal(validateStory(S, T, brand).sfx, true);
  assert.equal(validateStory({ ...S, sfx: true }, T, brand).sfx, true);
  assert.throws(() => validateStory({ ...S, sfx: 'no' }, T, brand),
    (e) => e instanceof StoryError && e.problems.some((p) => /sfx must be true or false/.test(p)));
});

test('two pops 0.05 s apart become one; 0.12 s apart both stay', () => {
  const close = sfxEvents(resolvedOf([scene(0, [item(1), item(1.05)])], 5));
  assert.deepEqual(summary(close), ['1 pop -16', '5 chime -16']);
  const apart = sfxEvents(resolvedOf([scene(0, [item(1), item(1.12)])], 5));
  assert.deepEqual(summary(apart), ['1 pop -16', '1.12 pop -16', '5 chime -16']);
});

test('thinning compares with the last event kept, and only within one name', () => {
  const events = sfxEvents(resolvedOf([scene(0, [
    item(1), item(1.1), item(1.2), item(1.3, 'drop'), item(1.31, 'drop'),
  ])], 5));
  assert.deepEqual(summary(events), ['1 pop -16', '1.2 pop -16', '1.3 thud -16', '5 chime -16'],
    'a thud 0.1 s after a pop stays; the pop at 1.1 s goes; the pop at 1.2 s is 0.2 s after the one kept');
});

test('at most 60 events, the earliest first', () => {
  const items = Array.from({ length: 80 }, (_, i) => item(1 + i * 0.2));
  const events = sfxEvents(resolvedOf([scene(0, items)], 100));
  assert.equal(events.length, MAX_EVENTS);
  assert.equal(MAX_EVENTS, 60);
  assert.equal(events[0].t, 1);
  assert.ok(Math.abs(events[59].t - (1 + 59 * 0.2)) < 1e-9);
  assert.ok(events.every((e) => e.name === 'pop'), 'the chime came after the 60th and is dropped');
});

test('events are sorted by time whatever order the story lists them in', () => {
  const events = sfxEvents(resolvedOf([scene(0, [item(3), item(1, 'drop')], [{ type: 'ring', t: 2 }])], 5));
  assert.deepEqual(events.map((e) => e.t), [1, 2, 3, 5]);
});

test('the same Resolved gives the same events, and the input is not changed', () => {
  const r = validateStory(S, T, brand);
  const before = JSON.stringify(r);
  assert.deepEqual(sfxEvents(r), sfxEvents(r));
  assert.equal(JSON.stringify(r), before);
});

test('the bundled sounds load: six mono 48 kHz files of the stated lengths', () => {
  const sounds = loadSounds();
  const seconds = Object.fromEntries(Object.entries(sounds).map(([k, v]) => [k, v.length / SFX_RATE]));
  assert.deepEqual(seconds, { pop: 0.12, whoosh: 0.35, tick: 0.05, thud: 0.25, paper: 0.4, chime: 0.9 });
});

test('mixBed puts each event at its time and gain, adds overlaps, and cuts what runs past the end', () => {
  const sounds = { a: Float32Array.from([0.5, -0.5, 0.25]), b: Float32Array.from([1, 1]) };
  const bed = mixBed([
    { t: 1 / SFX_RATE, name: 'a', gainDb: 0 },
    { t: 2 / SFX_RATE, name: 'b', gainDb: -6.020599913279624 }, // x 0.5
    { t: 9 / SFX_RATE, name: 'b', gainDb: 0 }, // starts after the end: nothing
  ], 8 / SFX_RATE, sounds);
  assert.equal(bed.length, 8);
  assert.deepEqual([...bed].map((v) => Math.round(v * 1e4) / 1e4), [0, 0.5, -0.5 + 0.5, 0.25 + 0.5, 0, 0, 0, 0]);
});

test('writeFloatWav writes a 32-bit float mono 48 kHz WAV that reads back exactly', (t) => {
  const file = join(tempDir(t), 'bed.wav');
  const samples = Float32Array.from([0, 0.5, -1.5, 2]); // values past full scale survive: the limiter handles them
  writeFloatWav(file, samples);
  const buf = readFileSync(file);
  assert.equal(buf.toString('latin1', 0, 4), 'RIFF');
  assert.equal(buf.readUInt16LE(20), 3, 'IEEE float');
  assert.equal(buf.readUInt16LE(22), 1, 'mono');
  assert.equal(buf.readUInt32LE(24), SFX_RATE);
  assert.equal(buf.readUInt16LE(34), 32);
  assert.equal(buf.toString('latin1', 36, 40), 'data');
  assert.equal(buf.readUInt32LE(40), 16);
  assert.deepEqual([...new Float32Array(buf.buffer.slice(buf.byteOffset + 44, buf.byteOffset + 60))], [...samples]);
});
