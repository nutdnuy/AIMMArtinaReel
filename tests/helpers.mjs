// Shared test helpers: fixture copies in a temp dir, ffmpeg-made media, ffprobe.
import { mkdtempSync, cpSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));

// Registers cleanup on the node:test context `t` for every temp dir made through it.
export function tempDir(t, name = 'paim-test') {
  const dir = mkdtempSync(join(tmpdir(), `${name}-`));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// Copies tests/fixtures/<name> into a fresh temp dir (optionally inside a sub-folder called `leaf`).
export function copyFixture(t, name, leaf = name) {
  const dir = join(tempDir(t), leaf);
  cpSync(join(FIXTURES, name), dir, { recursive: true });
  return dir;
}

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`);
}

// A sine wave, mono, 48 kHz, written to `file`.
export function sineWav(file, seconds, freq = 440) {
  mkdirSync(dirname(file), { recursive: true });
  ffmpeg(['-f', 'lavfi', '-i', `sine=frequency=${freq}:sample_rate=48000:duration=${seconds}`, '-ac', '1', file]);
}

// A solid-colour PNG (hex like "0000FF").
export function solidPng(file, hex, size = 200) {
  mkdirSync(dirname(file), { recursive: true });
  ffmpeg(['-f', 'lavfi', '-i', `color=c=0x${hex}:s=${size}x${size}`, '-frames:v', '1', '-pix_fmt', 'rgb24', file]);
}

// {video, audio, audioStreams, duration} of a media file.
export function ffprobe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffprobe failed: ${r.stderr}`);
  const info = JSON.parse(r.stdout);
  const audioStreams = info.streams.filter((s) => s.codec_type === 'audio');
  return {
    video: info.streams.find((s) => s.codec_type === 'video'),
    audio: audioStreams[0],
    audioStreams,
    duration: Number(info.format.duration),
  };
}
