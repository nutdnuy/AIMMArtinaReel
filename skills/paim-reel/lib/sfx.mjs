// Sound effects: which sound plays when (sfxEvents), and the effects track the renderer mixes under the voice.
// Node only (it reads the bundled WAV files). The sounds themselves are made by scripts/make_sfx.py.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SFX_RATE = 48000;
export const MAX_EVENTS = 60;
const MIN_GAP = 0.12; // seconds between two events of the same sound
const GAP_SLACK = 1e-9;
const TICK_AT = [0.2, 0.45, 0.7]; // seconds into a number's count (it counts for NUMBER_DUR = 0.8 s)

export const SFX_DIR = fileURLToPath(new URL('../assets/sfx/', import.meta.url));
export const SOUND_NAMES = Object.freeze(['pop', 'whoosh', 'tick', 'thud', 'paper', 'chime']);

const round6 = (x) => Math.round(x * 1e6) / 1e6;

// The sound for an item's entrance, or null.
const ENTRANCE = Object.freeze({
  pop: { name: 'pop', gainDb: -16 },
  drop: { name: 'thud', gainDb: -16 },
  'slide-l': { name: 'whoosh', gainDb: -20 },
  'slide-r': { name: 'whoosh', gainDb: -20 },
  rise: { name: 'whoosh', gainDb: -20 },
});
const PHOTO = { name: 'paper', gainDb: -18 };

// Sound effects for a Resolved, sorted by time: [{t, name, gainDb}]. Pure. Nothing at all when story.sfx
// was false. An event less than 0.12 s after the last kept event of the same sound is dropped, and at most
// 60 events are kept (the earliest).
export function sfxEvents(resolved) {
  if (resolved.sfx === false) return [];
  const events = [];
  const add = (t, sound) => { if (sound) events.push({ t: round6(t), name: sound.name, gainDb: sound.gainDb }); };

  resolved.scenes.forEach((scene, i) => {
    if (i > 0) add(scene.t0, { name: 'paper', gainDb: -20 });
    for (const item of scene.items) {
      add(item.t, item.type === 'photo' ? PHOTO : ENTRANCE[item.enter]);
      if (item.type === 'number') for (const dt of TICK_AT) add(item.t + dt, { name: 'tick', gainDb: -22 });
    }
    for (const mark of scene.marks) add(mark.t, { name: 'tick', gainDb: -18 });
  });
  add(resolved.endCard.t0, { name: 'chime', gainDb: -16 });

  events.sort((a, b) => a.t - b.t); // stable: equal times keep the order above
  const lastKept = new Map();
  const kept = [];
  for (const e of events) {
    const prev = lastKept.get(e.name);
    if (prev !== undefined && e.t - prev < MIN_GAP - GAP_SLACK) continue;
    lastKept.set(e.name, e.t);
    kept.push(e);
  }
  return kept.slice(0, MAX_EVENTS);
}

// The samples (-1..1) of a mono 48 kHz 16-bit PCM WAV file.
function readWav(file) {
  const buf = readFileSync(file);
  if (buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WAVE') {
    throw new Error(`${file} is not a WAV file`);
  }
  let format = null;
  for (let at = 12; at + 8 <= buf.length;) {
    const id = buf.toString('latin1', at, at + 4);
    const size = buf.readUInt32LE(at + 4);
    const body = at + 8;
    if (id === 'fmt ') {
      format = { tag: buf.readUInt16LE(body), channels: buf.readUInt16LE(body + 2), rate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) };
    } else if (id === 'data') {
      if (!format || format.tag !== 1 || format.channels !== 1 || format.rate !== SFX_RATE || format.bits !== 16) {
        throw new Error(`${file} must be mono 48 kHz 16-bit PCM: run scripts/make_sfx.py`);
      }
      const n = Math.min(size, buf.length - body) >> 1;
      const out = new Float32Array(n);
      for (let k = 0; k < n; k++) out[k] = buf.readInt16LE(body + 2 * k) / 32768;
      return out;
    }
    at = body + size + (size & 1);
  }
  throw new Error(`${file} has no audio data`);
}

// {pop, whoosh, ...: Float32Array} from the bundled files (or from `dir`).
export function loadSounds(dir = SFX_DIR) {
  return Object.fromEntries(SOUND_NAMES.map((name) => [name, readWav(join(dir, `${name}.wav`))]));
}

// One track of `seconds` length with every event's sound added at its time and gain. Events that start
// after the end are left out; one that runs past the end is cut.
export function mixBed(events, seconds, sounds) {
  const length = Math.round(seconds * SFX_RATE);
  const bed = new Float32Array(length);
  for (const { t, name, gainDb } of events) {
    const sound = sounds[name];
    if (!sound) throw new Error(`no sound called "${name}"`);
    const start = Math.round(t * SFX_RATE);
    if (start < 0 || start >= length) continue;
    const gain = 10 ** (gainDb / 20);
    const n = Math.min(sound.length, length - start);
    for (let k = 0; k < n; k++) bed[start + k] += sound[k] * gain;
  }
  return bed;
}

// Writes `samples` as a mono 48 kHz 32-bit float WAV, so a sum above full scale is kept for the limiter.
export function writeFloatWav(file, samples) {
  const bytes = samples.length * 4;
  const head = Buffer.alloc(44);
  head.write('RIFF', 0, 'latin1');
  head.writeUInt32LE(36 + bytes, 4);
  head.write('WAVEfmt ', 8, 'latin1');
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(3, 20); // IEEE float
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(SFX_RATE, 24);
  head.writeUInt32LE(SFX_RATE * 4, 28);
  head.writeUInt16LE(4, 32);
  head.writeUInt16LE(32, 34);
  head.write('data', 36, 'latin1');
  head.writeUInt32LE(bytes, 40);
  const body = Buffer.alloc(bytes);
  samples.forEach((v, k) => body.writeFloatLE(v, 4 * k));
  writeFileSync(file, Buffer.concat([head, body]));
}
