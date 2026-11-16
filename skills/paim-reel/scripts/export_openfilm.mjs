#!/usr/bin/env node
// export_openfilm.mjs <project>: the finished reel as an OpenFilm project in <project>/openfilm/, so that P.AIM
// can change it by hand in OpenFilm Studio. Our own renderer (render.mjs) still makes the MP4.
//
// The folder holds film.html (the edit: tracks of clips), one page per scene plus one for the end card, and the
// files they load. A page is our own page.html with our own engine/ and data.js; a thin wrapper sets
// window.film = {frame(t), duration, ready}, and frame(t) is __paim.seek(sceneStart + t). There is no second
// drawing code. Format: OpenFilm's SPEC.md, `npx -y openfilm@latest skill edit`, and references/openfilm.md.
//
// Only a final reel is exported: a project whose timing is still estimated (a draft) is refused with one sentence.
//
// Hand edits are never overwritten: every export writes a manifest of file hashes, and a folder whose files no
// longer match its manifest (or that has none) is left alone; the export goes to openfilm-2/, openfilm-3/, ...
import {
  readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, copyFileSync, cpSync, readdirSync, renameSync,
  mkdtempSync, statSync,
} from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { buildProject, BuildError, exitWithError, isMain } from './build.mjs';
import { sfxEvents, loadSounds, SFX_RATE, SFX_DIR } from '../lib/sfx.mjs';

const MANIFEST = '.paim-export.json';
const MUSIC_DB = -30; // the level render.mjs mixes the music at (a test keeps the two equal)
const CLAMP = 1e-6; // s: a scene page never draws the very end of its scene, where the next scene begins

const ms = (seconds) => Math.round(seconds * 1000);
const floorMs = (seconds) => Math.floor(seconds * 1000 + 1e-6);
const sec = (millis) => String(millis / 1000);
const volumeOf = (db) => (10 ** (db / 20)).toFixed(4);

// Length in seconds of an audio file, from ffprobe.
function mediaSeconds(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], {
    encoding: 'utf8', timeout: 30_000,
  });
  const seconds = Number(r.stdout?.trim());
  if (r.error || r.status !== 0 || !(seconds > 0)) {
    throw new BuildError(`cannot read the length of ${file} (ffprobe is needed: run doctor.sh)`);
  }
  return seconds;
}

// The page of one span of the reel: build/index.html with the OpenFilm wrapper after the runtime.
function pageOf(indexHtml, start, span, length) {
  if (!indexHtml.includes('</head>')) throw new BuildError('build/index.html has no </head>');
  const wrapper = `  <script type="module">
    // OpenFilm: this page is one span of the reel. frame(t) asks the same runtime for the reel's own time.
    const START = ${start}; // s on the reel
    const SPAN = ${span}; // s of the reel it covers
    window.film = {
      duration: ${length},
      ready: window.__paim.ready,
      frame(t) { window.__paim.seek(START + Math.min(Math.max(t, 0), SPAN - ${CLAMP})); },
    };
  </script>
`;
  return indexHtml.replace('</head>', `${wrapper}</head>`);
}

// A clip element. A value that holds double quotes (the overrides JSON) goes in single quotes, as in OpenFilm's SPEC.
const quoted = (v) => (v.includes('"') ? `'${v}'` : `"${v}"`);
const clip = (tag, attrs) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}=${quoted(v)}`).join(' ')}></${tag}>`;
const track = (title, clips) => ({ title, clips });
const trackHtml = ({ title, clips }) => `<section title="${title}">\n  ${clips.join('\n  ')}\n</section>`;

// Effect clips spread over as few tracks as will hold them: clips on one track must not overlap.
function effectTracks(events, sounds, total) {
  const lanes = [];
  events.forEach((e, i) => {
    const at = ms(e.t);
    const length = Math.min(floorMs(sounds[e.name].length / SFX_RATE), total - at);
    if (length <= 0) return;
    let lane = lanes.find((l) => l.end <= at);
    if (!lane) lanes.push(lane = { end: 0, clips: [] });
    lane.end = at + length;
    lane.clips.push(clip('audio', {
      id: `sfx-${String(i + 1).padStart(2, '0')}`,
      src: `assets/sfx/${e.name}.wav#t=0,${sec(length)}`,
      at: sec(at),
      volume: volumeOf(e.gainDb),
    }));
  });
  return lanes.map((l, i) => track(i === 0 ? 'Effects' : `Effects ${i + 1}`, l.clips));
}

// The music bed looped to the length of the reel the way render.mjs loops it, faded out over the end card
// (the fade is on the last piece only: a piece shorter than the fade fades over its own length).
function musicTrack(file, ext, total, voiceEnd) {
  const piece = floorMs(mediaSeconds(file));
  const fade = total - ms(voiceEnd);
  const clips = [];
  for (let at = 0; at < total; at += piece) {
    const length = Math.min(piece, total - at);
    const attrs = { id: `music-${clips.length + 1}`, src: `assets/music${ext}#t=0,${sec(length)}`, at: sec(at), volume: volumeOf(MUSIC_DB) };
    if (at + length >= total && fade > 0) attrs.overrides = JSON.stringify([{ fade: [0, Math.min(fade, length) / 1000] }]);
    clips.push(clip('audio', attrs));
  }
  return track('Music', clips);
}

// Writes the whole export into `staging` and returns the number of clips in film.html.
function writeExport(staging, projectDir, buildDir, resolved) {
  const index = readFileSync(join(buildDir, 'index.html'), 'utf8');
  copyFileSync(join(buildDir, 'style.css'), join(staging, 'style.css'));
  copyFileSync(join(buildDir, 'data.js'), join(staging, 'data.js'));
  cpSync(join(buildDir, 'engine'), join(staging, 'engine'), { recursive: true });
  cpSync(join(buildDir, 'assets'), join(staging, 'assets'), { recursive: true });

  const total = ms(resolved.duration);
  const starts = [...resolved.scenes.map((s) => s.t0), resolved.endCard.t0];
  const stops = [...resolved.scenes.map((s) => s.t1), resolved.endCard.t1];
  const at = [...starts.map(ms), total];
  const pictures = starts.map((start, i) => {
    const file = i < resolved.scenes.length ? `scene-${String(i + 1).padStart(2, '0')}.html` : 'endcard.html';
    const length = at[i + 1] - at[i];
    if (!(length > 0)) throw new BuildError(`${file}: the span ${starts[i]} to ${stops[i]} s is shorter than a millisecond`);
    writeFileSync(join(staging, file), pageOf(index, start, Math.round((stops[i] - start) * 1e6) / 1e6, sec(length)));
    return clip('iframe', { id: file.slice(0, -'.html'.length), src: `${file}#t=0,${sec(length)}`, at: sec(at[i]) });
  });
  const tracks = [track('Pictures', pictures)];

  const voice = join(projectDir, 'voice', 'voice.wav');
  if (existsSync(voice)) {
    const length = mediaSeconds(voice);
    copyFileSync(voice, join(staging, 'assets', 'voice.wav'));
    const cut = length > resolved.duration ? `#t=0,${sec(total)}` : ''; // a voice longer than the reel is cut where the render cuts it
    tracks.push(track('Voice', [clip('audio', { id: 'voice', src: `assets/voice.wav${cut}`, at: '0', volume: '1' })]));
  }

  const events = sfxEvents(resolved);
  if (events.length) {
    mkdirSync(join(staging, 'assets', 'sfx'), { recursive: true });
    for (const name of new Set(events.map((e) => e.name))) copyFileSync(join(SFX_DIR, `${name}.wav`), join(staging, 'assets', 'sfx', `${name}.wav`));
    tracks.push(...effectTracks(events, loadSounds(), total));
  }

  if (resolved.music) {
    const ext = resolved.music.slice(resolved.music.lastIndexOf('.'));
    tracks.push(musicTrack(join(buildDir, resolved.music), ext, total, resolved.voiceEnd));
  }

  writeFileSync(join(staging, 'film.html'), `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=${resolved.width}, height=${resolved.height}">
</head>
<body>
${tracks.map(trackHtml).join('\n')}
</body>
</html>
`);
  return tracks.reduce((n, tr) => n + tr.clips.length, 0);
}

// ---- the manifest and the never-clobber rule ------------------------------------------------------

// {relative path: sha256} of every file under `dir`, except what starts with a dot (OpenFilm's own .film/
// and our manifest): those are the tools', not hand edits.
function hashTree(dir, prefix = '') {
  const out = {};
  for (const entry of readdirSync(join(dir, prefix), { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) Object.assign(out, hashTree(dir, rel));
    else out[rel] = createHash('sha256').update(readFileSync(join(dir, rel))).digest('hex');
  }
  return out;
}

// True when `dir` is exactly what an earlier export wrote: it has a manifest and its files match it.
function untouched(dir) {
  try {
    if (!statSync(dir).isDirectory()) return false;
    const manifest = JSON.parse(readFileSync(join(dir, MANIFEST), 'utf8'));
    if (manifest.version !== 1 || typeof manifest.files !== 'object') return false;
    const now = hashTree(dir);
    const names = Object.keys(now);
    return names.length === Object.keys(manifest.files).length && names.every((n) => manifest.files[n] === now[n]);
  } catch {
    return false;
  }
}

// The first of openfilm/, openfilm-2/, ... that is free or still exactly as an export left it, and the
// folders before it that hold edits (oldest first).
function pickFolder(projectDir) {
  const kept = [];
  for (let n = 1; ; n++) {
    const dir = join(projectDir, n === 1 ? 'openfilm' : `openfilm-${n}`);
    if (!existsSync(dir) || untouched(dir)) return { dir, kept };
    kept.push(dir);
  }
}

// Exports <projectDir> to openfilm/ (or the next free openfilm-<n>/). Returns {dir, clips, kept, keptAll}:
// `keptAll` lists the folders left alone because of hand edits, `kept` the newest of them (null for none).
export async function exportOpenfilm(projectDir) {
  projectDir = resolve(projectDir);
  const { resolved, buildDir } = await buildProject(projectDir);
  // A draft has no voice yet and its timing is a guess: there is nothing to hand over for hand edits.
  if (resolved.estimated) {
    throw new BuildError('This reel is still a draft (its timing is estimated, there is no voice yet): the OpenFilm export happens once her voice is in.');
  }
  const staging = mkdtempSync(join(projectDir, '.openfilm-staging-'));
  try {
    const clips = writeExport(staging, projectDir, buildDir, resolved);
    writeFileSync(join(staging, MANIFEST), `${JSON.stringify({ version: 1, files: hashTree(staging) }, null, 2)}\n`);
    const { dir, kept } = pickFolder(projectDir);
    if (existsSync(dir)) {
      // exactly what an export left: refresh it in place, keeping OpenFilm's own dot folders
      for (const entry of readdirSync(dir)) if (!entry.startsWith('.')) rmSync(join(dir, entry), { recursive: true, force: true });
      for (const entry of readdirSync(staging)) renameSync(join(staging, entry), join(dir, entry));
    } else {
      renameSync(staging, dir);
    }
    return { dir, clips, kept: kept.at(-1) ?? null, keptAll: kept };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

if (isMain(import.meta.url)) {
  const [project, ...extra] = process.argv.slice(2);
  if (!project || extra.length) {
    console.error('usage: export_openfilm.mjs <project>');
    process.exit(2);
  }
  exportOpenfilm(project)
    .then((r) => {
      console.log(`openfilm -> ${r.dir} (${r.clips} clips)`);
      for (const dir of r.keptAll) {
        console.log(`${basename(dir)}/ has hand edits and was not overwritten; this export is in ${basename(r.dir)}/`);
      }
    })
    .catch(exitWithError);
}
