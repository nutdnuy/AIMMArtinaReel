import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, statSync, chmodSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { buildProject } from '../../skills/paim-reel/scripts/build.mjs';
import { renderProject } from '../../skills/paim-reel/scripts/render.mjs';
import { stills } from '../../skills/paim-reel/scripts/still.mjs';
import { saveProfile } from '../../skills/paim-reel/lib/profile.mjs';
import { openPage } from '../../skills/paim-reel/lib/serve.mjs';
import { ENTER_DUR } from '../../skills/paim-reel/engine/motion.mjs';
import { copyFixture, tempDir, sineWav, solidPng, ffprobe } from '../helpers.mjs';

const SLOW = { timeout: 120_000 };

function project(t, leaf = 'mini') {
  process.env.PAIM_CONFIG_DIR = tempDir(t, 'paim-config');
  return copyFixture(t, 'mini', leaf);
}

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const writeJson = (file, value) => writeFileSync(file, JSON.stringify(value));

// Marks the timing as aligned and gives the project a 3 s synthesised voice.
function addVoice(dir) {
  const timing = readJson(join(dir, 'timing.json'));
  timing.estimated = false;
  writeJson(join(dir, 'timing.json'), timing);
  sineWav(join(dir, 'voice', 'voice.wav'), 3);
}

// Opens the built page and runs `fn(page)`; the browser and server are closed on every path.
async function withPage(dir, fn) {
  await buildProject(dir);
  const { page, close } = await openPage(dir);
  try {
    return await fn(page);
  } finally {
    await close();
  }
}

const seek = (page, t) => page.evaluate((s) => window.__paim.seek(s), t);

// The RGB of pixel (x, y) in a PNG buffer, decoded by the page's own canvas.
async function pixelAt(page, png, x, y) {
  return page.evaluate(async ([b64, px, py]) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return [...ctx.getImageData(px, py, 1, 1).data.slice(0, 3)];
  }, [png.toString('base64'), x, y]);
}

const near = (rgb, hex, tol = 12) => {
  const want = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return rgb.every((v, i) => Math.abs(v - want[i]) <= tol);
};

test('silent draft from estimated timing', SLOW, async (t) => {
  const dir = project(t);
  const r = await renderProject(dir, { preview: true });
  assert.match(r.file, /renders\/mini-draft\.mp4$/);
  assert.equal(r.frames, 150);
  const v = ffprobe(r.file);
  assert.deepEqual(
    [v.video.width, v.video.height, v.video.r_frame_rate, v.video.pix_fmt, v.video.codec_name],
    [1080, 1920, '30/1', 'yuv420p', 'h264'],
  );
  assert.ok(Math.abs(v.duration - 5.0) < 0.1);
  assert.equal(v.audio, undefined);
  assert.equal(ffprobe(r.previewFile).video.width, 720);
  assert.match(r.previewFile, /renders\/mini-draft-preview\.mp4$/);
});

test('final with voice', SLOW, async (t) => {
  const dir = project(t);
  addVoice(dir);
  const r = await renderProject(dir);
  assert.match(r.file, /renders\/mini\.mp4$/);
  const v = ffprobe(r.file);
  assert.equal(v.audio.codec_name, 'aac');
  assert.equal(Number(v.audio.sample_rate), 48000);
  assert.ok(Math.abs(v.duration - 5.0) < 0.1);
});

test('a --from/--to render is a silent part', SLOW, async (t) => {
  const dir = project(t);
  addVoice(dir);
  const r = await renderProject(dir, { from: 1, to: 2 });
  assert.match(r.file, /renders\/mini-part\.mp4$/);
  assert.equal(r.frames, 30);
  const v = ffprobe(r.file);
  assert.equal(v.audio, undefined);
  assert.ok(Math.abs(v.duration - 1.0) < 0.1);
});

test('frames are deterministic', SLOW, async (t) => {
  await withPage(project(t), async (page) => {
    await seek(page, 1.0);
    const a = await page.screenshot({ type: 'png' });
    await seek(page, 2.5);
    await seek(page, 1.0);
    const b = await page.screenshot({ type: 'png' });
    assert.ok(a.equals(b), 'the same time must give the same bytes');
  });
});

test('the frame actually shows the brand', SLOW, async (t) => {
  await withPage(project(t), async (page) => {
    await seek(page, 2.6);
    assert.ok(near(await pixelAt(page, await page.screenshot({ type: 'png' }), 20, 20), '#FFFAF0'), 'cream at 2.6 s');
    const boxes = await page.evaluate(() => window.__paim.textBoxes());
    assert.ok(boxes.some((b) => b.kind === 'caption' && b.text === 'ตะกร้าหุ้น'), JSON.stringify(boxes));
    await seek(page, 4.5);
    assert.ok(near(await pixelAt(page, await page.screenshot({ type: 'png' }), 20, 20), '#14856D'), 'green end card');
  });
});

test('a sprite is drawn', SLOW, async (t) => {
  const dir = project(t);
  const story = readJson(join(dir, 'story.json'));
  story.scenes[0].layout = 'center';
  story.scenes[0].items = [{ id: 'b', type: 'sprite', sprite: 'basket', at: 'l01' }];
  writeJson(join(dir, 'story.json'), story);
  solidPng(join(dir, 'gen', 'sprites', 'basket.png'), '0000FF');
  await withPage(dir, async (page) => {
    const { rect, t: at } = readJson(join(dir, 'build', 'resolved.json')).scenes[0].items[0];
    await seek(page, at + ENTER_DUR);
    const png = await page.screenshot({ type: 'png' });
    const rgb = await pixelAt(page, png, Math.round(rect.x + rect.w / 2), Math.round(rect.y + rect.h / 2));
    assert.ok(near(rgb, '#0000FF', 16), `centre pixel is ${rgb}`);
  });
});

test('music bed is accepted', SLOW, async (t) => {
  const dir = project(t);
  addVoice(dir);
  sineWav(join(dir, 'music.wav'), 6, 220);
  const story = readJson(join(dir, 'story.json'));
  story.music = 'music.wav';
  writeJson(join(dir, 'story.json'), story);
  const r = await renderProject(dir);
  const v = ffprobe(r.file);
  assert.equal(v.audioStreams.length, 1);
  assert.equal(v.audio.codec_name, 'aac');
  assert.ok(Math.abs(v.duration - 5.0) < 0.1);
});

test('project path with spaces and Thai letters renders', SLOW, async (t) => {
  const dir = project(t, 'คลิป ทดสอบ');
  const r = await renderProject(dir, { from: 0, to: 0.5 });
  assert.equal(r.frames, 15);
  assert.ok(statSync(r.file).size > 0);
});

test('stills writes a PNG', SLOW, async (t) => {
  const dir = project(t);
  const out = join(tempDir(t, 'paim-stills'), 'sheet.png');
  await stills(dir, [0.5, 2.6, 4.5], out);
  assert.ok(existsSync(out));
  const png = readFileSync(out);
  assert.equal(png.readUInt32BE(16) > 900, true, `sheet width ${png.readUInt32BE(16)}`);
});

test('a missing sprite file surfaces the page message and does not hang', SLOW, async (t) => {
  const dir = project(t);
  const story = readJson(join(dir, 'story.json'));
  story.scenes[0].layout = 'center';
  story.scenes[0].items = [{ id: 'b', type: 'sprite', sprite: 'basket', at: 'l01' }];
  writeJson(join(dir, 'story.json'), story);
  solidPng(join(dir, 'gen', 'sprites', 'basket.png'), '0000FF');
  await buildProject(dir);
  const { rmSync } = await import('node:fs');
  rmSync(join(dir, 'build', 'assets', 'sprites', 'basket.png'));
  await assert.rejects(openPage(dir), /cannot load image assets\/sprites\/basket\.png/);
});

test('a broken data.js surfaces the page message and does not hang', SLOW, async (t) => {
  const dir = project(t);
  await buildProject(dir);
  writeFileSync(join(dir, 'build', 'data.js'), 'window.__PAIM_DATA = {};\n');
  await assert.rejects(openPage(dir), /data\.js did not set window\.__PAIM_DATA|__PAIM_DATA/);
});

// ---- fix round 1

// A fake ffmpeg at the front of PATH: writes its pid to `pid`, creates its output file, ignores SIGTERM,
// drains stdin and exits 0 when stdin ends. A render that "cleans up" with SIGTERM leaves it running.
function fakeFfmpeg(t) {
  const bin = tempDir(t, 'paim-fakebin');
  const pidFile = join(bin, 'pid');
  const script = join(bin, 'ffmpeg');
  writeFileSync(script, `#!/usr/bin/env node
const fs = require('node:fs');
fs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
fs.writeFileSync(process.argv[process.argv.length - 1], 'x');
process.on('SIGTERM', () => {});
process.stdin.resume();
process.stdin.on('end', () => process.exit(0));
setTimeout(() => process.exit(0), 20000);
`);
  chmodSync(script, 0o755);
  const oldPath = process.env.PATH;
  process.env.PATH = `${bin}:${oldPath}`;
  t.after(() => {
    process.env.PATH = oldPath;
    try { process.kill(Number(readFileSync(pidFile, 'utf8')), 'SIGKILL'); } catch { /* already gone or never started */ }
  });
  return pidFile;
}

const alive = (pidFile) => {
  if (!existsSync(pidFile)) return false;
  try {
    process.kill(Number(readFileSync(pidFile, 'utf8')), 0);
    return true;
  } catch {
    return false;
  }
};

const partials = (dir) => (existsSync(join(dir, 'renders')) ? readdirSync(join(dir, 'renders')).filter((f) => f.includes('.partial')) : []);

test('a failing seek leaves no partial file and no live ffmpeg', SLOW, async (t) => {
  const dir = project(t);
  const pidFile = fakeFfmpeg(t);
  await assert.rejects(
    renderProject(dir, { onFrame: (i) => { if (i === 10) throw new Error('boom at frame 10'); } }),
    /boom at frame 10/,
  );
  assert.deepEqual(partials(dir), []);
  assert.equal(alive(pidFile), false, 'ffmpeg must be dead when renderProject has rejected');
});

test('a real ffmpeg run that fails mid-way leaves no partial file', SLOW, async (t) => {
  const dir = project(t);
  await assert.rejects(
    renderProject(dir, { onFrame: (i) => { if (i === 10) throw new Error('boom at frame 10'); } }),
    /boom at frame 10/,
  );
  assert.deepEqual(partials(dir), []);
});

test('a page that fails to open leaves no partial file and no live ffmpeg', SLOW, async (t) => {
  const dir = project(t);
  const pidFile = fakeFfmpeg(t);
  const logo = join(tempDir(t, 'paim-logo'), 'logo.png');
  writeFileSync(logo, 'this is not a PNG');
  saveProfile({ logo });
  await assert.rejects(renderProject(dir), /cannot load image assets\/logo\.png/);
  assert.deepEqual(partials(dir), []);
  assert.equal(alive(pidFile), false, 'no ffmpeg may be left running (or even started)');
});

test('data.js carries both weights of one icon and the page draws them', SLOW, async (t) => {
  const dir = project(t);
  const story = readJson(join(dir, 'story.json'));
  story.scenes[0].items = [
    { id: 'a', type: 'icon', icon: 'coins', weight: 'fill', color: 'orange', at: 'l01' },
    { id: 'b', type: 'icon', icon: 'coins', weight: 'duotone', color: 'green', at: 'l02' },
  ];
  writeJson(join(dir, 'story.json'), story);
  await withPage(dir, async (page) => {
    await seek(page, 3.0);
    const svgs = await page.evaluate(() => [...document.querySelectorAll('.icon-item svg')].map((s) => s.innerHTML));
    assert.equal(svgs.length, 2);
    assert.notEqual(svgs[0], svgs[1], 'fill and duotone must be different drawings');
  });
});

test('the fallback font has real Thai and Latin faces (forceFallback)', SLOW, async (t) => {
  const dir = project(t);
  await buildProject(dir, { forceFallback: true });
  const { page, close } = await openPage(dir);
  try {
    assert.equal(await page.evaluate(() => window.__paim.fontUsed()), 'IBM Plex Sans Thai');
    const widths = await page.evaluate(() => {
      const ctx = document.createElement('canvas').getContext('2d');
      const width = (family) => { ctx.font = `700 64px ${family}`; return ctx.measureText('ETF 5% 2026').width; };
      return { plex: width('"IBM Plex Sans Thai", sans-serif'), plain: width('sans-serif') };
    });
    assert.notEqual(widths.plex, widths.plain, 'Latin text must be drawn by the IBM Plex Sans Thai latin subset');
    const faces = await page.evaluate(() => [...document.fonts]
      .filter((f) => f.family.replace(/"/g, '') === 'IBM Plex Sans Thai')
      .map((f) => ({ weight: f.weight, status: f.status })));
    assert.equal(faces.length, 4);
    assert.ok(faces.every((f) => f.status === 'loaded'), JSON.stringify(faces));
  } finally {
    await close();
  }
});

test('an absolute story.music is still mixed', SLOW, async (t) => {
  const dir = project(t);
  addVoice(dir);
  const music = join(tempDir(t, 'paim-music'), 'bed.wav');
  sineWav(music, 6, 220);
  const story = readJson(join(dir, 'story.json'));
  story.music = music;
  writeJson(join(dir, 'story.json'), story);
  const r = await renderProject(dir);
  // After the voice ends (3 s) only the music bed is left: faint, but not silence.
  const probe = spawnSync('ffmpeg', ['-hide_banner', '-ss', '3.2', '-t', '0.6', '-i', r.file, '-vn', '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  const mean = Number(/mean_volume: (-?[\d.]+) dB/.exec(probe.stderr)?.[1]);
  assert.ok(mean > -70, `the music bed is missing after the voice ends (mean ${mean} dB)`);
  assert.ok(!readFileSync(join(dir, 'build', 'data.js'), 'utf8').includes(music));
});
