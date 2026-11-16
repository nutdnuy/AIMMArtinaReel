import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildProject } from '../../skills/paim-reel/scripts/build.mjs';
import { StoryError } from '../../skills/paim-reel/lib/story.mjs';
import { saveProfile } from '../../skills/paim-reel/lib/profile.mjs';
import { copyFixture, tempDir, solidPng, addPhoto, HOME_PREFIX } from '../helpers.mjs';

// Every test works on a fixture copy and an empty profile folder.
function project(t) {
  process.env.PAIM_CONFIG_DIR = tempDir(t, 'paim-config');
  return copyFixture(t, 'mini');
}

const readStory = (dir) => JSON.parse(readFileSync(join(dir, 'story.json'), 'utf8'));
const writeStory = (dir, story) => writeFileSync(join(dir, 'story.json'), JSON.stringify(story));

test('mini builds into build/', async (t) => {
  const dir = project(t);
  const { resolved, buildDir } = await buildProject(dir);
  assert.equal(resolved.duration, 5.0);
  assert.equal(buildDir, join(dir, 'build'));
  for (const f of ['index.html', 'style.css', 'data.js', 'resolved.json', 'engine/runtime.mjs',
    'assets/ibm-plex-sans-thai-thai-400-normal.woff2', 'assets/ibm-plex-sans-thai-thai-700-normal.woff2']) {
    assert.ok(existsSync(join(buildDir, f)), `${f} is missing`);
  }
  const data = readFileSync(join(buildDir, 'data.js'), 'utf8');
  assert.match(data, /^window\.__PAIM_DATA = /);
  assert.match(data, /<svg/);
  assert.ok(data.includes('"buildings:fill"') && data.includes('"basket:fill"'), 'both icons are in data.js');
  assert.ok(!data.includes(HOME_PREFIX), 'data.js holds no absolute home path');
  assert.deepEqual(JSON.parse(readFileSync(join(buildDir, 'resolved.json'), 'utf8')), resolved);
});

test('an unknown icon is a StoryError', async (t) => {
  const dir = project(t);
  const story = readStory(dir);
  story.scenes[0].items[0].icon = 'no-such-icon-xyz';
  writeStory(dir, story);
  await assert.rejects(buildProject(dir), StoryError);
});

test('a project without timing.json names timing.py', async (t) => {
  const dir = project(t);
  const { rmSync } = await import('node:fs');
  rmSync(join(dir, 'timing.json'));
  await assert.rejects(buildProject(dir), /timing\.py/);
});

test('a story.music file that does not exist is named', async (t) => {
  const dir = project(t);
  const story = readStory(dir);
  story.music = 'audio/missing-bed.wav';
  writeStory(dir, story);
  await assert.rejects(buildProject(dir), /audio\/missing-bed\.wav/);
});

test('a sprite item builds when the sprite exists and names gen_sprites.py when not', async (t) => {
  const dir = project(t);
  const story = readStory(dir);
  story.scenes[0].layout = 'center';
  story.scenes[0].items = [{ id: 'b', type: 'sprite', sprite: 'basket', at: 'l01' }];
  writeStory(dir, story);
  await assert.rejects(buildProject(dir), (e) => e instanceof StoryError && /gen_sprites\.py/.test(e.message));
  solidPng(join(dir, 'gen', 'sprites', 'basket.png'), '0000FF');
  solidPng(join(dir, 'gen', 'sprites', 'basket-raw.png'), 'FF0000');
  const { buildDir } = await buildProject(dir);
  assert.ok(existsSync(join(buildDir, 'assets', 'sprites', 'basket.png')));
  assert.ok(!existsSync(join(buildDir, 'assets', 'sprites', 'basket-raw.png')));
});

test('the profile handle reaches the end card', async (t) => {
  const dir = project(t);
  saveProfile({ handle: '@test' });
  const { resolved } = await buildProject(dir);
  assert.equal(resolved.endCard.handle, '@test');
});

test('the logo is copied into build/assets and the end card points at it', async (t) => {
  const dir = project(t);
  const logo = join(tempDir(t, 'paim-logo'), 'my logo.png');
  solidPng(logo, '14856D', 64);
  saveProfile({ logo });
  const { resolved, buildDir } = await buildProject(dir);
  assert.equal(resolved.endCard.logo, 'assets/logo.png');
  assert.ok(existsSync(join(buildDir, 'assets', 'logo.png')));
  assert.ok(!readFileSync(join(buildDir, 'data.js'), 'utf8').includes(logo));
});

test('a logo path that does not exist is named', async (t) => {
  const dir = project(t);
  saveProfile({ logo: join(dir, 'nope', 'gone.png') });
  await assert.rejects(buildProject(dir), /nope\/gone\.png/);
});

test('one icon in two weights builds and both drawings are in data.js', async (t) => {
  const dir = project(t);
  const story = readStory(dir);
  story.scenes[0].items = [
    { id: 'a', type: 'icon', icon: 'coins', weight: 'fill', color: 'orange', at: 'l01' },
    { id: 'b', type: 'icon', icon: 'coins', weight: 'duotone', color: 'green', at: 'l02' },
  ];
  writeStory(dir, story);
  const { buildDir } = await buildProject(dir);
  const data = readFileSync(join(buildDir, 'data.js'), 'utf8');
  const icons = JSON.parse(data.slice('window.__PAIM_DATA = '.length, data.lastIndexOf(';'))).icons;
  assert.deepEqual(Object.keys(icons).sort(), ['coins:duotone', 'coins:fill']);
  assert.notEqual(icons['coins:fill'], icons['coins:duotone']);
});

test('the fallback font is four files with their unicode ranges', async (t) => {
  const { buildDir } = await buildProject(project(t));
  const data = readFileSync(join(buildDir, 'data.js'), 'utf8');
  const urls = JSON.parse(data.slice('window.__PAIM_DATA = '.length, data.lastIndexOf(';'))).fallbackFontUrls;
  for (const weight of ['400', '700']) {
    assert.equal(urls[weight].length, 2);
    const [thai, latin] = ['thai', 'latin'].map((s) => urls[weight].find((e) => e.url.includes(`-${s}-`)));
    assert.match(thai.unicodeRange, /U\+0E01-0E5B/);
    assert.match(latin.unicodeRange, /U\+0000-00FF/);
    for (const e of urls[weight]) assert.ok(existsSync(join(buildDir, e.url)), `${e.url} is missing`);
  }
});

test('an absolute story.music is not written into the build', async (t) => {
  const dir = project(t);
  const music = join(tempDir(t, 'paim-music'), 'bed.wav');
  writeFileSync(music, 'RIFF');
  const story = readStory(dir);
  story.music = music;
  writeStory(dir, story);
  const { buildDir, resolved } = await buildProject(dir);
  for (const f of ['data.js', 'resolved.json']) {
    assert.ok(!readFileSync(join(buildDir, f), 'utf8').includes(music), `${f} holds the absolute music path`);
  }
  assert.ok(!JSON.stringify(resolved).includes(music));
});

// mini as one centred photo item.
function photoProject(t, { photo = 'old-bank', ...options } = {}) {
  const dir = project(t);
  const story = readStory(dir);
  story.scenes[0].layout = 'center';
  story.scenes[0].items = [{ id: 'p', type: 'photo', photo: 'old-bank', label: 'ธนาคาร', at: 'l01' }];
  writeStory(dir, story);
  if (photo) addPhoto(dir, photo, '0000FF', options);
  return dir;
}

test('a photo item names fetch_photo.py until the photo is fetched', async (t) => {
  const dir = photoProject(t, { photo: null });
  await assert.rejects(buildProject(dir), (e) => e instanceof StoryError && /old-bank/.test(e.message) && /fetch_photo\.py/.test(e.message));
});

test('a used photo is copied into build/assets/photos and no absolute path reaches data.js', async (t) => {
  const dir = photoProject(t);
  addPhoto(dir, 'unused-one');
  const { buildDir, resolved } = await buildProject(dir);
  assert.ok(existsSync(join(buildDir, 'assets', 'photos', 'old-bank.jpg')));
  assert.ok(!existsSync(join(buildDir, 'assets', 'photos', 'unused-one.jpg')), 'a photo the story does not use is not copied');
  const item = resolved.scenes[0].items[0];
  assert.deepEqual([item.photo, item.treatment], ['old-bank', 'mono']);
  const data = readFileSync(join(buildDir, 'data.js'), 'utf8');
  assert.ok(data.includes('"photo":"old-bank"'));
  assert.ok(!data.includes(dir) && !data.includes(HOME_PREFIX) && !data.includes('credits.json'), 'data.js names no folder of the project');
  assert.ok(!/https?:\/\/page\.example/.test(data), 'the credits do not travel into the page');
});

test('a photo without a credits entry does not build, and the message names it', async (t) => {
  const dir = photoProject(t, { credited: false });
  await assert.rejects(buildProject(dir), (e) => e instanceof StoryError && /old-bank/.test(e.message) && /credits\.json/.test(e.message));
});

test('a credits entry without its picture does not build either', async (t) => {
  const dir = photoProject(t);
  const { rmSync } = await import('node:fs');
  rmSync(join(dir, 'gen', 'photos', 'old-bank.jpg'));
  await assert.rejects(buildProject(dir), /old-bank.*fetch_photo\.py/s);
});

test('a damaged credits.json is a build error that names the file', async (t) => {
  const dir = photoProject(t);
  writeFileSync(join(dir, 'gen', 'photos', 'credits.json'), '{nope');
  await assert.rejects(buildProject(dir), /credits\.json is not valid JSON/);
});
