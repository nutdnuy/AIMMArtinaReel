import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, rmSync, chmodSync, realpathSync, mkdtempSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { exportOpenfilm } from '../../skills/paim-reel/scripts/export_openfilm.mjs';
import { buildProject } from '../../skills/paim-reel/scripts/build.mjs';
import { openPage, serveFolder } from '../../skills/paim-reel/lib/serve.mjs';
import { sfxEvents } from '../../skills/paim-reel/lib/sfx.mjs';
import { copyFixture, tempDir, sineWav } from '../helpers.mjs';

const SKILL = fileURLToPath(new URL('../../skills/paim-reel/', import.meta.url));
const EXPORT_CLI = join(SKILL, 'scripts', 'export_openfilm.mjs');
const OPEN_STUDIO = join(SKILL, 'scripts', 'open_studio.sh');
const DOCTOR = join(SKILL, 'scripts', 'doctor.sh');
// playwright lives in the skill's own node_modules, not in the repository root
const { chromium } = createRequire(join(SKILL, 'package.json'))('playwright');
const SLOW = { timeout: 180_000 };
const REAL = process.env.PAIM_RUN_OPENFILM === '1';

// ---- helpers -----------------------------------------------------------------------------------

// The mini fixture (one scene s1, 0 to 3 s, then the 2 s end card). `story` may edit the story;
// `voice` writes a 3 s voice file the way prep_voice.py leaves it.
function project(t, { story: edit, voice = true } = {}) {
  process.env.PAIM_CONFIG_DIR = tempDir(t, 'paim-config');
  const dir = copyFixture(t, 'mini');
  if (voice) sineWav(join(dir, 'voice', 'voice.wav'), 3);
  if (edit) {
    const file = join(dir, 'story.json');
    const story = JSON.parse(readFileSync(file, 'utf8'));
    edit(story, dir);
    writeFileSync(file, JSON.stringify(story));
  }
  return dir;
}

// The mini fixture with a count-up number in a second scene (from 1.6 s), so a scene page that forgot its
// own start time draws a different picture from ours.
const twoScenes = (story) => {
  const etf = story.scenes[0].items.pop();
  story.scenes.push({
    id: 's2', from: 'l02', layout: 'row',
    items: [etf, { id: 'n', type: 'number', to: 1050, color: 'green', source: 'test', at: 'l02' }],
  });
};

const attrsOf = (text) => Object.fromEntries(
  [...text.matchAll(/([\w-]+)=(?:"([^"]*)"|'([^']*)')/g)].map((m) => [m[1], m[2] ?? m[3]]));

// {viewport, tracks: [{attrs, clips: [{tag, attrs, file, from, to, at, length}]}]} of a film.html.
function readFilm(dir) {
  const html = readFileSync(join(dir, 'film.html'), 'utf8');
  const tracks = [...html.matchAll(/<section\b([^>]*)>([\s\S]*?)<\/section>/g)].map((m) => ({
    attrs: attrsOf(m[1]),
    clips: [...m[2].matchAll(/<(iframe|audio)\b([^>]*)>\s*<\/\1>/g)].map((c) => {
      const attrs = attrsOf(c[2]);
      const [file, fragment] = attrs.src.split('#');
      const [from, to] = fragment ? fragment.replace('t=', '').split(',').map(Number) : [0, undefined];
      return {
        tag: c[1], attrs, file, from, to, at: Number(attrs.at ?? 0),
        length: to === undefined ? undefined : to - from,
      };
    }),
  }));
  return { html, viewport: /<meta name="viewport" content="([^"]*)"/.exec(html)?.[1], tracks };
}

const allClips = (film) => film.tracks.flatMap((tr) => tr.clips);
const pictureClips = (film) => allClips(film).filter((c) => c.tag === 'iframe');
const soundClips = (film) => allClips(film).filter((c) => c.tag === 'audio');
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

function filesUnder(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(path));
    else out.push(path);
  }
  return out;
}

// ---- what the export contains ----------------------------------------------------------------

test('film.html: 1080x1920, a picture clip per scene plus the end card tiling [0, duration], voice, effects', SLOW, async (t) => {
  const dir = project(t, { story: twoScenes });
  const { resolved } = await buildProject(dir);
  const r = await exportOpenfilm(dir);
  assert.equal(r.dir, join(dir, 'openfilm'));
  const film = readFilm(r.dir);
  assert.equal(film.viewport, 'width=1080, height=1920');

  const pictures = pictureClips(film);
  assert.equal(pictures.length, resolved.scenes.length + 1, 'one picture clip per scene, plus the end card');
  let cursor = 0;
  for (const c of pictures) {
    assert.ok(near(c.at, cursor, 1e-9), `clip at ${c.at} starts where the last one ended (${cursor})`);
    assert.ok(c.length > 0);
    cursor = Math.round((c.at + c.length) * 1000) / 1000;
  }
  assert.equal(cursor, resolved.duration, 'the picture clips end exactly at the reel duration');
  const spans = [...resolved.scenes.map((s) => s.t0), resolved.endCard.t0];
  pictures.forEach((c, i) => assert.ok(Math.abs(c.at - spans[i]) <= 0.0005, `clip ${i} starts at its scene start`));

  const voice = soundClips(film).filter((c) => c.file === 'assets/voice.wav');
  assert.equal(voice.length, 1, 'one voice clip');
  assert.equal(voice[0].at, 0);

  const effects = soundClips(film).filter((c) => c.file.startsWith('assets/sfx/'));
  const events = sfxEvents(resolved);
  assert.equal(effects.length, events.length, 'one effect clip per sfxEvents entry');
  assert.ok(events.length >= 4, `the fixture has enough effects to mean something (${events.length})`);
  const wanted = events.map((e) => `${e.t} ${e.name} ${(10 ** (e.gainDb / 20)).toFixed(4)}`).sort();
  const got = effects.map((c) => `${c.at} ${c.file.slice('assets/sfx/'.length, -'.wav'.length)} ${c.attrs.volume}`).sort();
  assert.deepEqual(got, wanted, 'each effect at its time, with its sound and its gain');

  assert.equal(r.clips, allClips(film).length, 'the returned count is the number of clips in film.html');
  assert.equal(new Set(allClips(film).map((c) => c.attrs.id)).size, r.clips, 'every clip has its own id');
});

test('every src film.html and the pages name exists in openfilm/, and nothing names an absolute path', SLOW, async (t) => {
  const dir = project(t, { story: twoScenes });
  const r = await exportOpenfilm(dir);
  const film = readFilm(r.dir);
  for (const c of allClips(film)) {
    assert.ok(existsSync(join(r.dir, c.file)), `${c.file} exists`);
    assert.ok(!c.file.startsWith('/') && !c.file.includes('..'), `${c.file} is relative and inside the folder`);
  }
  for (const page of pictureClips(film).map((c) => c.file)) {
    const html = readFileSync(join(r.dir, page), 'utf8');
    for (const [, url] of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
      assert.ok(!/^(\/|[a-z]+:)/i.test(url), `${page}: ${url} is relative`);
      assert.ok(existsSync(join(r.dir, url)), `${page}: ${url} exists`);
    }
  }
  const roots = [dir, realpathSync(dir), tmpdir(), realpathSync(tmpdir())];
  for (const file of filesUnder(r.dir)) {
    if (!/\.(html|js|mjs|css|json)$/.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const root of roots) assert.ok(!text.includes(root), `${relative(r.dir, file)} does not contain ${root}`);
    assert.ok(!text.includes('/Users/') && !text.includes('file:'), `${relative(r.dir, file)} has no absolute path`);
  }
});

test('film.html uses only what OpenFilm reads: section, iframe and audio, with their known attributes', SLOW, async (t) => {
  const dir = project(t, {
    story: (s, d) => { twoScenes(s); sineWav(join(d, 'bed.wav'), 3); s.music = 'bed.wav'; },
  });
  const r = await exportOpenfilm(dir);
  const { html } = readFilm(r.dir);
  const body = /<body>([\s\S]*)<\/body>/.exec(html)[1];
  const tags = [...body.matchAll(/<\/?([a-z]+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(tags)].sort(), ['audio', 'iframe', 'section']);
  const allowed = { section: ['title'], iframe: ['id', 'src', 'at'], audio: ['id', 'src', 'at', 'volume', 'overrides'] };
  for (const m of body.matchAll(/<(section|iframe|audio)\b([^>]*)>/g)) {
    for (const name of Object.keys(attrsOf(m[2]))) assert.ok(allowed[m[1]].includes(name), `<${m[1]} ${name}> is a known attribute`);
  }
  assert.ok(!/<script/i.test(html), 'the head of a film has no script');
});

test('effects that overlap in time go to different tracks; no track has clips that overlap', SLOW, async (t) => {
  const dir = project(t, {
    story: (s) => {
      // three things entering at the same moment: pop, whoosh, thud sounding together
      s.scenes[0].items = [
        { id: 'a', type: 'icon', icon: 'buildings', color: 'orange', label: 'ก', at: 'l01', enter: 'pop' },
        { id: 'b', type: 'icon', icon: 'basket', color: 'green', label: 'ข', at: 'l01', enter: 'slide-l' },
        { id: 'c', type: 'icon', icon: 'buildings', color: 'green', label: 'ค', at: 'l01', enter: 'drop' },
      ];
      s.scenes[0].layout = 'row';
    },
  });
  const r = await exportOpenfilm(dir);
  const film = readFilm(r.dir);
  const effectTracks = film.tracks.filter((tr) => tr.clips.some((c) => c.file.startsWith('assets/sfx/')));
  assert.ok(effectTracks.length >= 3, `three sounds at 0.25 s need three tracks, got ${effectTracks.length}`);
  for (const tr of film.tracks) {
    const clips = [...tr.clips].sort((a, b) => a.at - b.at);
    for (let i = 1; i < clips.length; i++) {
      assert.ok(clips[i].at >= clips[i - 1].at + clips[i - 1].length - 1e-9, `${clips[i].attrs.id} starts after ${clips[i - 1].attrs.id} ends`);
    }
  }
  const { resolved } = await buildProject(dir);
  const total = resolved.duration;
  for (const c of soundClips(film)) assert.ok(c.at + (c.length ?? 0) <= total + 1e-9, `${c.attrs.id} ends inside the reel`);
});

test('music: its own track at the render level, looped to the length of the reel, faded out over the end card', SLOW, async (t) => {
  const render = readFileSync(join(SKILL, 'scripts', 'render.mjs'), 'utf8');
  const musicDb = Number(/const MUSIC_DB = (-?\d+);/.exec(render)[1]);
  const dir = project(t, { story: (s, d) => { sineWav(join(d, 'bed.wav'), 3); s.music = 'bed.wav'; } });
  const r = await exportOpenfilm(dir);
  const film = readFilm(r.dir);
  const music = soundClips(film).filter((c) => c.file.startsWith('assets/music.'));
  assert.deepEqual(music.map((c) => [c.at, c.length]), [[0, 3], [3, 2]], 'a 3 s bed under 5 s: 3 s, then 2 s of it again');
  for (const c of music) assert.equal(c.attrs.volume, (10 ** (musicDb / 20)).toFixed(4), 'the render level');
  assert.equal(music[0].attrs.overrides, undefined);
  assert.deepEqual(JSON.parse(music[1].attrs.overrides), [{ fade: [0, 2] }], 'the last piece fades out over the end card');
  const track = film.tracks.find((tr) => tr.clips.includes(music[0]));
  assert.equal(track.clips.length, 2, 'music has a track of its own');

  // a bed longer than the reel is one clip cut at the end
  const long = project(t, { story: (s, d) => { sineWav(join(d, 'bed.wav'), 9); s.music = 'bed.wav'; } });
  const longFilm = readFilm((await exportOpenfilm(long)).dir);
  const one = soundClips(longFilm).filter((c) => c.file.startsWith('assets/music.'));
  assert.deepEqual(one.map((c) => [c.at, c.from, c.to]), [[0, 0, 5]]);
  assert.deepEqual(JSON.parse(one[0].attrs.overrides), [{ fade: [0, 2] }]);
});

test('no voice file, no voice clip; no music, no music clip; sfx false, no effect clips', SLOW, async (t) => {
  const dir = project(t, { voice: false, story: (s) => { s.sfx = false; } });
  const film = readFilm((await exportOpenfilm(dir)).dir);
  assert.deepEqual(soundClips(film), []);
  assert.equal(film.tracks.length, 1, 'only the picture track is left');
});

// ---- the heart: the same picture as our own renderer -------------------------------------------

test('a scene page at frame(0.5) draws exactly what our page draws at sceneStart + 0.5', SLOW, async (t) => {
  const dir = project(t, { story: twoScenes });
  const { resolved } = await buildProject(dir);
  const r = await exportOpenfilm(dir);
  const pages = pictureClips(readFilm(r.dir)).map((c) => c.file);
  const starts = [...resolved.scenes.map((s) => s.t0), resolved.endCard.t0];
  assert.equal(pages.length, starts.length);

  const ours = await openPage(dir);
  const server = await serveFolder(r.dir);
  let browser = null;
  try {
    browser = await chromium.launch();
    const pngs = [];
    for (let i = 0; i < pages.length; i++) {
      await ours.page.evaluate((s) => window.__paim.seek(s), starts[i] + 0.5);
      const expected = await ours.page.screenshot({ type: 'png' });

      const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`${server.url}${pages[i]}`, { waitUntil: 'load' });
      const length = await page.evaluate(async () => { await window.film.ready; return window.film.duration; });
      assert.ok(length > 0, `${pages[i]} says how long it is`);
      await page.evaluate((s) => window.film.frame(s), 0.5);
      const got = await page.screenshot({ type: 'png' });
      assert.deepEqual(errors, [], `${pages[i]} has no page error`);
      assert.ok(Buffer.compare(expected, got) === 0, `${pages[i]}: frame(0.5) is the picture at ${starts[i] + 0.5} s`);
      pngs.push(got);

      // a frame is a function of t: drawn after another time, and again, it is the same
      await page.evaluate(() => { window.film.frame(0.1); window.film.frame(0.9); });
      await page.evaluate((s) => window.film.frame(s), 0.5);
      assert.ok(Buffer.compare(got, await page.screenshot({ type: 'png' })) === 0, `${pages[i]}: the same t draws the same picture`);
      await page.close();
    }
    assert.ok(Buffer.compare(pngs[0], pngs[1]) !== 0, 'the scenes really differ, so the comparison means something');
  } finally {
    await browser?.close();
    await server.close();
    await ours.close();
  }
});

test('a scene page does not run into the next scene past its own length', SLOW, async (t) => {
  const dir = project(t, { story: twoScenes });
  const r = await exportOpenfilm(dir);
  const film = readFilm(r.dir);
  const first = pictureClips(film)[0];
  const server = await serveFolder(r.dir);
  let browser = null;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
    await page.goto(`${server.url}${first.file}`, { waitUntil: 'load' });
    await page.evaluate(() => window.film.ready);
    const state = await page.evaluate((len) => {
      window.film.frame(len - 0.01);
      const before = document.querySelectorAll('.scene').length && [...document.querySelectorAll('.scene')].map((s) => s.style.display);
      window.film.frame(len + 5);
      const after = [...document.querySelectorAll('.scene')].map((s) => s.style.display);
      return { before, after, duration: window.film.duration };
    }, first.length);
    assert.deepEqual(state.after, state.before, 'asked for a time past its end, the page still shows its own scene');
    assert.ok(near(state.duration, first.length, 0.0005));
  } finally {
    await browser?.close();
    await server.close();
  }
});

// ---- never clobber hand edits ----------------------------------------------------------------------

test('a re-export of an untouched openfilm/ overwrites it in place; files no longer exported go', SLOW, async (t) => {
  const dir = project(t, { story: twoScenes });
  const first = await exportOpenfilm(dir);
  assert.equal(first.dir, join(dir, 'openfilm'));
  assert.equal(first.kept, null);
  mkdirSync(join(first.dir, '.film'), { recursive: true });
  writeFileSync(join(first.dir, '.film', 'opened'), ''); // what OpenFilm itself keeps: not an edit
  assert.ok(existsSync(join(first.dir, 'assets', 'voice.wav')));

  rmSync(join(dir, 'voice'), { recursive: true });
  const again = await exportOpenfilm(dir);
  assert.equal(again.dir, first.dir, 'untouched: written in place');
  assert.equal(again.kept, null);
  assert.ok(!existsSync(join(again.dir, 'assets', 'voice.wav')), 'the old voice file is gone');
  assert.ok(existsSync(join(again.dir, '.film', 'opened')), "OpenFilm's own folder is left alone");
  assert.equal(readdirSync(dir).filter((n) => n.startsWith('openfilm')).join(), 'openfilm');
});

test('a hand-edited openfilm/ is never overwritten: the export goes to openfilm-2/, then openfilm-3/', SLOW, async (t) => {
  const dir = project(t, { story: twoScenes });
  const first = await exportOpenfilm(dir);
  const edited = join(first.dir, 'film.html');
  const mine = `${readFileSync(edited, 'utf8')}\n<!-- P.AIM was here -->\n`;
  writeFileSync(edited, mine);

  const second = await exportOpenfilm(dir);
  assert.equal(second.dir, join(dir, 'openfilm-2'));
  assert.equal(second.kept, first.dir, 'it says which folder holds the edits');
  assert.equal(readFileSync(edited, 'utf8'), mine, 'the edited film.html is exactly as she left it');
  assert.ok(existsSync(join(second.dir, 'film.html')));

  // openfilm-2 is untouched, so it is the one a third export refreshes; openfilm stays as it is
  const third = await exportOpenfilm(dir);
  assert.equal(third.dir, second.dir);
  assert.equal(readFileSync(edited, 'utf8'), mine);

  // an added file counts as an edit too (a new picture she dropped in, an MP4 she exported)
  writeFileSync(join(second.dir, 'assets', 'mine.png'), 'x');
  const fourth = await exportOpenfilm(dir);
  assert.equal(fourth.dir, join(dir, 'openfilm-3'));
  assert.equal(fourth.kept, second.dir);
  assert.ok(existsSync(join(second.dir, 'assets', 'mine.png')));
});

test('a deleted file, a changed page and a folder without a manifest all count as edits', SLOW, async (t) => {
  const dir = project(t, { story: twoScenes });
  const first = await exportOpenfilm(dir);
  rmSync(join(first.dir, 'assets', 'voice.wav'));
  assert.equal((await exportOpenfilm(dir)).dir, join(dir, 'openfilm-2'));

  const other = project(t, { story: twoScenes });
  const made = await exportOpenfilm(other);
  const page = pictureClips(readFilm(made.dir))[0].file;
  writeFileSync(join(made.dir, page), `${readFileSync(join(made.dir, page), 'utf8')} `);
  assert.equal((await exportOpenfilm(other)).dir, join(other, 'openfilm-2'));

  const third = project(t, { story: twoScenes });
  mkdirSync(join(third, 'openfilm'));
  writeFileSync(join(third, 'openfilm', 'film.html'), '<!doctype html>');
  const r = await exportOpenfilm(third);
  assert.equal(r.dir, join(third, 'openfilm-2'), 'a folder this export never made is not ours to overwrite');
  assert.equal(readFileSync(join(third, 'openfilm', 'film.html'), 'utf8'), '<!doctype html>');
});

test('the CLI prints "openfilm -> <dir> (<n> clips)" and says when the edits were kept', SLOW, async (t) => {
  const dir = project(t, { story: twoScenes });
  const run = () => spawnSync(process.execPath, [EXPORT_CLI, dir], { encoding: 'utf8', env: process.env });
  const a = run();
  assert.equal(a.status, 0, a.stderr);
  const n = readFilm(join(dir, 'openfilm')).tracks.flatMap((tr) => tr.clips).length;
  assert.equal(a.stdout.trim(), `openfilm -> ${join(dir, 'openfilm')} (${n} clips)`);
  writeFileSync(join(dir, 'openfilm', 'film.html'), `${readFileSync(join(dir, 'openfilm', 'film.html'), 'utf8')} `);
  const b = run();
  assert.equal(b.status, 0, b.stderr);
  const lines = b.stdout.trim().split('\n');
  assert.equal(lines[0], `openfilm -> ${join(dir, 'openfilm-2')} (${n} clips)`);
  assert.match(lines.slice(1).join('\n'), /openfilm\/.*edits.*not (overwritten|changed)/s);
  assert.equal(spawnSync(process.execPath, [EXPORT_CLI], { encoding: 'utf8' }).status, 2, 'no project: usage, exit 2');
});

// ---- open_studio.sh ------------------------------------------------------------------------------------

// A fake `npx` that records its arguments and prints what OpenFilm's `open` prints.
function fakeNpx(t, { studio = 'http://127.0.0.1:4747', status = 0 } = {}) {
  const bin = tempDir(t, 'paim-bin');
  const log = join(bin, 'npx.log');
  writeFileSync(join(bin, 'npx'),
    `#!/bin/sh\nprintf '%s\\n' "$*" >> "${log}"\necho "project  $4"\necho "Studio   ${studio}"\nexit ${status}\n`);
  chmodSync(join(bin, 'npx'), 0o755);
  return { bin, log };
}

const studio = (args, bin) => spawnSync('bash', [OPEN_STUDIO, ...args], {
  encoding: 'utf8', env: { PATH: `${bin}:/usr/bin:/bin`, HOME: tmpdir() }, timeout: 20_000,
});

test('open_studio.sh runs `npx -y openfilm@latest open <project>/openfilm`, prints it and how to stop Studio', async (t) => {
  const dir = project(t);
  const { bin, log } = fakeNpx(t, { studio: 'http://127.0.0.1:4747' });
  await exportOpenfilm(dir);
  const r = studio([dir], bin);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(log, 'utf8').trim(), `-y openfilm@latest open ${join(dir, 'openfilm')}`);
  assert.match(r.stdout, /Studio {3}http:\/\/127\.0\.0\.1:4747/, 'what OpenFilm prints is passed on');
  assert.match(r.stdout, /lsof -ti tcp:4747 -sTCP:LISTEN \| xargs kill/, 'and how to stop it, with the port it is on');
  assert.match(r.stdout, /background/i);

  // a folder that holds film.html is opened as it is (openfilm-2 after a re-export)
  const second = join(dir, 'openfilm-2');
  mkdirSync(second);
  writeFileSync(join(second, 'film.html'), '<!doctype html>');
  assert.equal(studio([second], bin).status, 0);
  assert.equal(readFileSync(log, 'utf8').trim().split('\n').pop(), `-y openfilm@latest open ${second}`);
});

test('open_studio.sh: no project, no export yet, or a failing openfilm each end with a plain message', (t) => {
  const { bin, log } = fakeNpx(t);
  assert.equal(studio([], bin).status, 2);
  const bare = tempDir(t);
  const none = studio([bare], bin);
  assert.equal(none.status, 2);
  assert.match(none.stderr, /export_openfilm\.mjs/);
  assert.ok(!existsSync(log), 'nothing was run');
  const failing = fakeNpx(t, { status: 1 });
  mkdirSync(join(bare, 'openfilm'));
  writeFileSync(join(bare, 'openfilm', 'film.html'), '<!doctype html>');
  const r = studio([bare], failing.bin);
  assert.equal(r.status, 1, 'the exit status of openfilm is kept');
  assert.ok(!/xargs kill/.test(r.stdout), 'no stop hint when Studio did not start');
});

// ---- doctor.sh ------------------------------------------------------------------------------------------------

// PATH holds a `node` that answers for the version and runs the real one for everything else.
function doctorWith(t, version) {
  const bin = tempDir(t, 'paim-bin');
  writeFileSync(join(bin, 'node'),
    `#!/bin/sh\nif [ "$1" = "-p" ] && [ "$2" = "process.versions.node" ]; then echo ${version}; exit 0; fi\nexec "${process.execPath}" "$@"\n`);
  chmodSync(join(bin, 'node'), 0o755);
  return spawnSync(DOCTOR, [], {
    env: { PATH: `${bin}:/usr/bin:/bin`, HOME: tempDir(t), PAIM_CONFIG_DIR: tempDir(t, 'paim-config') }, encoding: 'utf8',
  });
}

test('doctor: an openfilm line, ok from Node 22.2, a WARN (never MISSING) below it', (t) => {
  for (const v of ['22.2.0', '22.22.3', '23.0.1', '24.1.0']) {
    assert.match(doctorWith(t, v).stdout, /^openfilm: ok$/m, `Node ${v}`);
  }
  for (const v of ['22.1.9', '20.19.0', '18.0.0']) {
    const r = doctorWith(t, v);
    assert.match(r.stdout, /^WARN openfilm \(needs Node 22\.2 or newer\)$/m, `Node ${v}`);
    assert.ok(!/MISSING openfilm/.test(r.stdout));
  }
  // a WARN is not a failure: the exit status is the same with and without it
  assert.equal(doctorWith(t, '22.1.0').status, doctorWith(t, '22.22.3').status);
});

// ---- the skill's own text ----------------------------------------------------------------------------------------

test('SKILL.md step 9 tells the agent to export, open Studio and tell her; references/openfilm.md exists', () => {
  const text = readFileSync(join(SKILL, 'SKILL.md'), 'utf8');
  for (const mention of ['scripts/export_openfilm.mjs', 'scripts/open_studio.sh', 'references/openfilm.md']) {
    assert.ok(text.includes(mention), `SKILL.md mentions ${mention}`);
    assert.ok(existsSync(join(SKILL, mention)), `${mention} exists`);
  }
  const deliver = text.slice(text.indexOf('## 9. Deliver'), text.indexOf('## Never'));
  assert.match(deliver, /export_openfilm\.mjs/, 'the export belongs to step 9');
  assert.ok(text.split('\n').length < 200, 'SKILL.md stays under 200 lines');
  const ref = readFileSync(join(SKILL, 'references', 'openfilm.md'), 'utf8');
  for (const word of [/openfilm-2/, /Studio/, /export/i, /volume/i, /not (?:checked|tried)|could not check/i]) assert.match(ref, word);
});

// ---- the real OpenFilm, opt in (PAIM_RUN_OPENFILM=1): downloads the package, starts a private Studio ----------

const portOpen = (port) => new Promise((done) => {
  const socket = createConnection({ port, host: '127.0.0.1' });
  socket.once('connect', () => { socket.destroy(); done(true); });
  socket.once('error', () => done(false));
});

test('with the real OpenFilm: look and render work on the export, Studio answers 200 and is stopped',
  { skip: !REAL && 'set PAIM_RUN_OPENFILM=1 to run OpenFilm (network, a private Studio)', timeout: 900_000 }, async (t) => {
    const dir = project(t, { story: twoScenes });
    const r = await exportOpenfilm(dir);
    // Studio is a background process: it is stopped in this hook, before its home folder is removed (the
    // pids are in the home's run.json), and the test fails if its port is still open afterwards.
    const home = mkdtempSync(join(tmpdir(), 'openfilm-home-'));
    const port = 40000 + (process.pid % 20000);
    const env = {
      ...process.env, OPENFILM_HOME: home, OPENFILM_STUDIO_PORT: String(port), OPENFILM_NO_BROWSER: '1',
      OPENFILM_NO_UPDATE_CHECK: '1',
    };
    t.after(async () => {
      try {
        const run = JSON.parse(readFileSync(join(home, 'run.json'), 'utf8'));
        for (const pid of [run.pid, run.supervisor]) if (pid) { try { process.kill(pid, 'SIGTERM'); } catch { /* gone */ } }
      } catch { /* Studio never started */ }
      for (let i = 0; i < 50 && await portOpen(port); i++) await new Promise((ok) => setTimeout(ok, 100));
      const stillOpen = await portOpen(port);
      rmSync(home, { recursive: true, force: true });
      assert.equal(stillOpen, false, `Studio on port ${port} was not stopped`);
    });
    const look = spawnSync('npx', ['-y', 'openfilm@latest', 'look'], { cwd: r.dir, env, encoding: 'utf8', timeout: 600_000 });
    assert.equal(look.status, 0, `${look.stdout}\n${look.stderr}`);
    const sheet = join(r.dir, '.film', 'cache', 'look');
    assert.ok(existsSync(sheet) && readdirSync(sheet).some((n) => n.endsWith('.png')), 'a contact sheet was written');

    const render = spawnSync('npx', ['-y', 'openfilm@latest', 'render', '0-1'], { cwd: r.dir, env, encoding: 'utf8', timeout: 600_000 });
    assert.equal(render.status, 0, `${render.stdout}\n${render.stderr}`);
    assert.ok(existsSync(join(r.dir, '.film', 'cache', 'render', 'openfilm-0-1.mp4')), 'the first second rendered to an MP4');

    const open = spawnSync('bash', [OPEN_STUDIO, dir], { env, encoding: 'utf8', timeout: 120_000 });
    assert.equal(open.status, 0, `${open.stdout}\n${open.stderr}`);
    const url = /Studio {3}(http:\/\/\S+)/.exec(open.stdout)[1];
    assert.equal((await fetch(url)).status, 200);
    assert.ok(await portOpen(port));
  });
