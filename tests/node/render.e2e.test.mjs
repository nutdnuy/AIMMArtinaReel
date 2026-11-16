import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildProject } from '../../skills/paim-reel/scripts/build.mjs';
import { renderProject } from '../../skills/paim-reel/scripts/render.mjs';
import { stills } from '../../skills/paim-reel/scripts/still.mjs';
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
