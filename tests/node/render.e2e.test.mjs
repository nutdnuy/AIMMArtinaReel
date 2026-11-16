import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, statSync, chmodSync, readdirSync, copyFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { buildProject } from '../../skills/paim-reel/scripts/build.mjs';
import { renderProject } from '../../skills/paim-reel/scripts/render.mjs';
import { stills } from '../../skills/paim-reel/scripts/still.mjs';
import { saveProfile } from '../../skills/paim-reel/lib/profile.mjs';
import { StoryError } from '../../skills/paim-reel/lib/story.mjs';
import { openPage } from '../../skills/paim-reel/lib/serve.mjs';
import { ENTER_DUR } from '../../skills/paim-reel/engine/motion.mjs';
import { copyFixture, tempDir, sineWav, solidPng, ffprobe, addPhoto } from '../helpers.mjs';

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

// ffmpeg's own readings of a media file's sound. `window` ([from, length] in seconds) limits it to a span.
function listen(file, filter, window) {
  const span = window ? ['-ss', String(window[0]), '-t', String(window[1])] : [];
  const r = spawnSync('ffmpeg', ['-hide_banner', ...span, '-i', file, '-vn', '-af', filter, '-f', 'null', '-'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stderr;
}

const meanVolume = (file, window) => Number(/mean_volume: (-?[\d.]+) dB/.exec(listen(file, 'volumedetect', window))?.[1]);

// {peak, rms} in dB of the whole of a span of the file's sound, as ffmpeg's astats reports them (3 decimals).
function levels(file, window) {
  const overall = listen(file, 'astats', window).split('Overall')[1];
  return { peak: Number(/Peak level dB: (-?[\d.]+)/.exec(overall)[1]), rms: Number(/RMS level dB: (-?[\d.]+)/.exec(overall)[1]) };
}

// {lufs, truePeak} over the whole file: the integrated loudness and the true peak that ebur128 reports.
function loudness(file) {
  const summary = listen(file, 'ebur128=peak=true').split('Summary:')[1];
  return { lufs: Number(/I:\s+(-?[\d.]+) LUFS/.exec(summary)[1]), truePeak: Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(summary)[1]) };
}

// Marks the timing as aligned and gives the project a 3 s synthesised voice at about -14 LUFS (what
// prep_voice leaves), with a sine of the given peak so that a hot voice can test the limiter. The sine fades in
// and out over 50 ms: speech does not start or stop at full level, and an abrupt sine edge makes the AAC
// encoder overshoot by about 0.15 dB, which would hide what the limiter does.
function addLoudVoice(t, dir, { peak = null } = {}) {
  const timing = readJson(join(dir, 'timing.json'));
  timing.estimated = false;
  writeJson(join(dir, 'timing.json'), timing);
  const raw = join(tempDir(t, 'paim-voice'), 'raw.wav');
  sineWav(raw, 3);
  mkdirSync(join(dir, 'voice'), { recursive: true });
  const measured = Number(/I:\s+(-?[\d.]+) LUFS/.exec(listen(raw, 'ebur128').split('Summary:')[1])[1]);
  const gain = peak === null ? -14 - measured : peak - (-18.06); // the sine is 0.125 of full scale
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', raw, '-af', `volume=${gain}dB,afade=t=in:d=0.05,afade=t=out:st=2.95:d=0.05`, '-ar', '48000', '-ac', '1', join(dir, 'voice', 'voice.wav')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
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

// The mean RGB of the w x h patch whose top-left corner is (x, y), in a PNG buffer.
async function patchMean(page, png, x, y, w = 40, h = 40) {
  return page.evaluate(async ([b64, px, py, pw, ph]) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(px, py, pw, ph).data;
    const sum = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k += 1) sum[k] += d[i + k];
    return sum.map((v) => v / (pw * ph));
  }, [png.toString('base64'), x, y, w, h]);
}

const near = (rgb, hex, tol = 12) => {
  const want = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return rgb.every((v, i) => Math.abs(v - want[i]) <= tol);
};

const BRAND = { cream: '#FFFAF0', charcoal: '#252B31', green: '#14856D', orange: '#F5820B' };

test('a draft carries the sound effects but no voice', SLOW, async (t) => {
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
  assert.equal(v.audioStreams.length, 1);
  assert.equal(v.audio.codec_name, 'aac');
  assert.equal(Number(v.audio.sample_rate), 48000);
  // The first item enters at 0.25 s: the 0.3 s after it is not silence, and the 0.2 s before it is.
  const after = meanVolume(r.file, [0.25, 0.3]);
  assert.ok(after > -60, `the first entrance makes no sound (mean ${after} dB)`);
  assert.ok(after < -20, `the effects sit well below full scale (mean ${after} dB)`);
  assert.ok(!(meanVolume(r.file, [0, 0.2]) > -60), 'nothing plays before the first entrance');
  assert.equal(ffprobe(r.previewFile).video.width, 720);
  assert.equal(ffprobe(r.previewFile).audioStreams.length, 1, 'the preview keeps the sound');
  assert.match(r.previewFile, /renders\/mini-draft-preview\.mp4$/);
});

test('with sfx: false a draft has no audio stream', SLOW, async (t) => {
  const dir = project(t);
  const story = readJson(join(dir, 'story.json'));
  story.sfx = false;
  writeJson(join(dir, 'story.json'), story);
  const r = await renderProject(dir, { preview: true });
  assert.match(r.file, /renders\/mini-draft\.mp4$/);
  assert.equal(ffprobe(r.file).audio, undefined);
  assert.equal(ffprobe(r.previewFile).audio, undefined);
});

test('a final whose voice file is missing stays silent, so the missing voice is noticed', SLOW, async (t) => {
  const dir = project(t);
  const timing = readJson(join(dir, 'timing.json'));
  timing.estimated = false;
  writeJson(join(dir, 'timing.json'), timing);
  const r = await renderProject(dir);
  assert.match(r.file, /renders\/mini\.mp4$/);
  assert.equal(ffprobe(r.file).audio, undefined);
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

test('a final with voice and effects: -14 LUFS, true peak under -1 dBFS, the voice between effects untouched', SLOW, async (t) => {
  const dir = project(t);
  addLoudVoice(t, dir);
  const withEffects = await renderProject(dir);
  const plain = join(tempDir(t, 'paim-plain'), 'mini-sfx.mp4');
  copyFileSync(withEffects.file, plain);
  const heard = loudness(plain);
  assert.ok(Math.abs(heard.lufs - -14) <= 1.5, `integrated loudness ${heard.lufs} LUFS`);
  assert.ok(heard.truePeak <= -1, `true peak ${heard.truePeak} dBFS`);

  const story = readJson(join(dir, 'story.json'));
  story.sfx = false;
  writeJson(join(dir, 'story.json'), story);
  const without = await renderProject(dir);
  // No effect plays between 0.45 s (the first pop ends at 0.37) and 1.55 s (the second starts at 1.6).
  const a = meanVolume(plain, [0.6, 0.8]);
  const b = meanVolume(without.file, [0.6, 0.8]);
  assert.ok(Math.abs(a - b) <= 0.5, `voice-only window: ${a} dB with effects, ${b} dB without`);
  assert.ok(Math.abs(loudness(without.file).lufs - heard.lufs) <= 1.5, 'the effects barely move the loudness');
});

test('a hot voice with effects on top is held under -1 dBFS true peak by the limiter', SLOW, async (t) => {
  const dir = project(t);
  addLoudVoice(t, dir, { peak: -0.3 });
  const r = await renderProject(dir);
  const heard = loudness(r.file);
  assert.ok(heard.truePeak <= -1, `true peak ${heard.truePeak} dBFS`);
});

test('a voice with peaks at -1.2 dBFS (what prep_voice leaves) is not touched by the effects mix', SLOW, async (t) => {
  const dir = project(t);
  addLoudVoice(t, dir, { peak: -1.2 });
  const withEffects = await renderProject(dir);
  const kept = join(tempDir(t, 'paim-keep'), 'mini-sfx.mp4');
  copyFileSync(withEffects.file, kept);
  const story = readJson(join(dir, 'story.json'));
  story.sfx = false;
  writeJson(join(dir, 'story.json'), story);
  const plain = await renderProject(dir);
  // No effect plays in 0.5-1.0 s (the first pop ends at 0.37 s, the second starts at 1.6 s) or in 2.0-2.9 s.
  for (const window of [[0.5, 0.5], [2.0, 0.9]]) {
    const a = levels(kept, window);
    const b = levels(plain.file, window);
    assert.ok(Math.abs(a.peak - b.peak) <= 0.1, `window ${window}: peak ${a.peak} dB with effects, ${b.peak} dB without`);
    assert.ok(Math.abs(a.rms - b.rms) <= 0.1, `window ${window}: RMS ${a.rms} dB with effects, ${b.rms} dB without`);
  }
  assert.ok(loudness(kept).truePeak <= -1, `true peak ${loudness(kept).truePeak} dBFS`);
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

test('two page loads draw the same frame', SLOW, async (t) => {
  const dir = project(t);
  const shot = () => withPage(dir, async (page) => {
    await seek(page, 1.0);
    return page.screenshot({ type: 'png' });
  });
  const a = await shot();
  const b = await shot();
  assert.ok(a.equals(b), 'the paper must not change between page loads');
});

test('the frame actually shows the brand', SLOW, async (t) => {
  await withPage(project(t), async (page) => {
    await seek(page, 2.6);
    const cream = await patchMean(page, await page.screenshot({ type: 'png' }), 20, 20);
    assert.ok(near(cream, BRAND.cream, 10), `cream paper at 2.6 s: ${cream}`);
    const boxes = await page.evaluate(() => window.__paim.textBoxes());
    assert.ok(boxes.some((b) => b.kind === 'caption' && b.text === 'ตะกร้าหุ้น'), JSON.stringify(boxes));
    await seek(page, 4.5);
    const green = await patchMean(page, await page.screenshot({ type: 'png' }), 20, 20);
    assert.ok(near(green, BRAND.green, 10), `green end card: ${green}`);
  });
});

test('every 40 px patch of paper stays within 10 levels of its colour', SLOW, async (t) => {
  const dir = project(t);
  const story = readJson(join(dir, 'story.json'));
  const etf = story.scenes[0].items.pop();
  story.scenes.push({ id: 's2', from: 'l02', layout: 'center', bg: 'charcoal', items: [etf] });
  writeJson(join(dir, 'story.json'), story);
  await withPage(dir, async (page) => {
    // Worst patch per paper canvas, over a 40 x 40 window moved in 8 px steps (summed-area table).
    const worst = await page.evaluate(() => [...document.querySelectorAll('canvas[data-paper]')].map((c) => {
      const { width: w, height: h } = c;
      const d = c.getContext('2d').getImageData(0, 0, w, h).data;
      const want = getComputedStyle(document.documentElement).getPropertyValue(`--${c.dataset.paper}`).trim();
      const base = [1, 3, 5].map((i) => parseInt(want.slice(i, i + 2), 16));
      let max = 0;
      for (let k = 0; k < 3; k += 1) {
        const S = new Float64Array((w + 1) * (h + 1));
        for (let y = 0; y < h; y += 1) {
          let row = 0;
          for (let x = 0; x < w; x += 1) {
            row += d[(y * w + x) * 4 + k];
            S[(y + 1) * (w + 1) + x + 1] = S[y * (w + 1) + x + 1] + row;
          }
        }
        for (let y = 0; y + 40 <= h; y += 8) {
          for (let x = 0; x + 40 <= w; x += 8) {
            const sum = S[(y + 40) * (w + 1) + x + 40] - S[y * (w + 1) + x + 40] - S[(y + 40) * (w + 1) + x] + S[y * (w + 1) + x];
            max = Math.max(max, Math.abs(sum / 1600 - base[k]));
          }
        }
      }
      return { paper: c.dataset.paper, max };
    }));
    assert.deepEqual(worst.map((p) => p.paper).sort(), ['charcoal', 'cream', 'green']);
    for (const p of worst) assert.ok(p.max <= 10, `${p.paper}: a patch is ${p.max.toFixed(1)} levels off`);
  });
});

test('a frame scene is a torn sheet of paper over the frame colour', SLOW, async (t) => {
  const dir = project(t);
  const story = readJson(join(dir, 'story.json'));
  story.scenes[0].frame = 'orange';
  writeJson(join(dir, 'story.json'), story);
  await withPage(dir, async (page) => {
    await seek(page, 1.0); // only the top item is in, so (540, 960) is bare paper
    const png = await page.screenshot({ type: 'png' });
    const edge = await patchMean(page, png, 0, 940, 20, 40);
    assert.ok(near(edge, BRAND.orange, 10), `orange backdrop at (10, 960): ${edge}`);
    const paper = await patchMean(page, png, 520, 940);
    assert.ok(near(paper, BRAND.cream, 10), `cream paper at (540, 960): ${paper}`);
    await seek(page, 2.5);
    await seek(page, 1.0);
    assert.ok(png.equals(await page.screenshot({ type: 'png' })), 'seek(1.0) after seek(2.5) gives the same bytes');
  });
});

test('an unknown frame colour is a StoryError', async (t) => {
  const dir = project(t);
  const story = readJson(join(dir, 'story.json'));
  story.scenes[0].frame = 'purple';
  writeJson(join(dir, 'story.json'), story);
  await assert.rejects(buildProject(dir), (e) => e instanceof StoryError && /frame "purple"/.test(e.message));
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

// mini with `items` (photo items by default) in one scene of the given layout, and the photos they name.
function photoScene(t, items, layout = 'center', photos = { 'old-bank': 'C0402F' }, marks = []) {
  const dir = project(t);
  const story = readJson(join(dir, 'story.json'));
  Object.assign(story.scenes[0], { layout, items, marks });
  writeJson(join(dir, 'story.json'), story);
  for (const [name, hex] of Object.entries(photos)) addPhoto(dir, name, hex);
  return dir;
}

const spread = (rgb) => Math.max(...rgb) - Math.min(...rgb);
const photoItem = (id, extra = {}) => ({ id, type: 'photo', photo: 'old-bank', at: 'l01', ...extra });

test('a photo is a paper card: the centre of its art box is the picture, not the paper', SLOW, async (t) => {
  const dir = photoScene(t, [photoItem('p', { treatment: 'color', label: 'ธนาคาร' })]);
  await withPage(dir, async (page) => {
    const { rect, t: at } = readJson(join(dir, 'build', 'resolved.json')).scenes[0].items[0];
    await seek(page, at + ENTER_DUR + 0.05);
    const png = await page.screenshot({ type: 'png' });
    const art = await page.evaluate(() => {
      const r = document.querySelector('.card').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: document.querySelector('.card').offsetWidth };
    });
    const centre = await pixelAt(page, png, Math.round(art.x), Math.round(art.y));
    assert.ok(near(centre, '#C0402F', 24), `centre pixel is ${centre}`);
    assert.ok(art.w > 600 && art.w < rect.w, `the card (${art.w} px) fills the art box (${rect.w} px) less its margin`);
    // the label is still text the page reports, and the picture is not
    const boxes = await page.evaluate(() => window.__paim.textBoxes());
    assert.deepEqual(boxes.map((b) => [b.kind, b.item, b.text]), [['label', 'p', 'ธนาคาร'], ['caption', undefined, boxes[1].text]]);
  });
});

test('mono is the default: desaturated with a warm tint; color shows the picture as it is', SLOW, async (t) => {
  const dir = photoScene(t, [photoItem('m'), photoItem('c', { treatment: 'color' })], 'row');
  await withPage(dir, async (page) => {
    const { items } = readJson(join(dir, 'build', 'resolved.json')).scenes[0];
    await seek(page, items[1].t + ENTER_DUR + 0.05);
    const png = await page.screenshot({ type: 'png' });
    const centres = await page.evaluate(() => [...document.querySelectorAll('.card')].map((c) => {
      const r = c.getBoundingClientRect();
      return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)];
    }));
    const [mono, color] = [await pixelAt(page, png, ...centres[0]), await pixelAt(page, png, ...centres[1])];
    assert.ok(spread(color) > 120, `color keeps its colour: ${color}`);
    assert.ok(spread(mono) < 70, `mono is nearly grey: ${mono}`);
    assert.ok(mono[0] >= mono[2], `with a warm tint (red not below blue): ${mono}`);
  });
});

test('the card tilt and torn outline come from the item seed, and are the same on every load', SLOW, async (t) => {
  const dir = photoScene(t, [photoItem('a'), photoItem('b')], 'row');
  const look = (page) => page.evaluate(() => [...document.querySelectorAll('.card')].map((card) => {
    const m = new DOMMatrix(getComputedStyle(card).transform);
    return {
      tilt: Math.atan2(m.b, m.a) * 180 / Math.PI,
      clip: card.querySelector('.card-paper').style.clipPath,
      size: [card.offsetWidth, card.offsetHeight],
    };
  }));
  const first = await withPage(dir, async (page) => { await seek(page, 2); return look(page); });
  const second = await withPage(dir, async (page) => { await seek(page, 1); await seek(page, 2); return look(page); });
  assert.deepEqual(first, second);
  for (const c of first) {
    assert.ok(Math.abs(c.tilt) <= 2 + 1e-6, `tilt ${c.tilt}`);
    assert.match(c.clip, /^path\("M [\d. ]+ L /);
  }
  assert.notEqual(first[0].tilt, first[1].tilt, 'each seed tilts its card its own way');
  assert.notEqual(first[0].clip, first[1].clip, 'and tears its own edge');
});

test('a ring on a photo goes round the card, not the label', SLOW, async (t) => {
  const dir = photoScene(t, [photoItem('p', { label: 'ธนาคาร' })], 'center', { 'old-bank': 'C0402F' },
    [{ type: 'ring', on: 'p', at: 'l01@1' }]);
  await withPage(dir, async (page) => {
    const { marks } = readJson(join(dir, 'build', 'resolved.json')).scenes[0];
    await seek(page, marks[0].t + 1);
    const got = await page.evaluate(() => {
      const card = document.querySelector('.card');
      const r = card.getBoundingClientRect();
      const stage = document.getElementById('stage').getBoundingClientRect();
      const nums = document.querySelector('.marks path').getAttribute('d').match(/-?[\d.]+/g).map(Number);
      return {
        cx: r.left - stage.left + r.width / 2, cy: r.top - stage.top + r.height / 2, w: card.offsetWidth, h: card.offsetHeight,
        ring: { x1: nums[0], y1: nums[1], rx: nums[2], ry: nums[3], x2: nums[7], y2: nums[8] },
      };
    });
    assert.ok(Math.abs((got.ring.x1 + got.ring.x2) / 2 - got.cx) < 1.5, 'the ring is centred on the card horizontally');
    assert.ok(Math.abs(got.ring.rx - (got.w / 2 + 16)) < 1.5, `ring half-width ${got.ring.rx} for a card ${got.w} px wide`);
    assert.ok(got.ring.ry <= got.h / 2 + 16 + 1.5, 'and pulled in under the label');
  });
});

test('a story whose photo has lost its credits entry does not render', async (t) => {
  const dir = photoScene(t, [photoItem('p')]);
  writeJson(join(dir, 'gen', 'photos', 'credits.json'), []);
  await assert.rejects(renderProject(dir), (e) => e instanceof StoryError && /old-bank/.test(e.message));
});

test('stills refuse a story whose photo has lost its credits entry, like build and render', SLOW, async (t) => {
  const dir = photoScene(t, [photoItem('p')]);
  writeJson(join(dir, 'gen', 'photos', 'credits.json'), []);
  const out = join(tempDir(t), 'sheet.png');
  await assert.rejects(stills(dir, 'scenes', out), (e) => e instanceof StoryError && /old-bank/.test(e.message));
  await assert.rejects(stills(dir, [1], out), (e) => e instanceof StoryError && /old-bank/.test(e.message));
  assert.equal(existsSync(out), false);
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
