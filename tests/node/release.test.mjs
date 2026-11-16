// Release audit: what a stranger would find on GitHub. Reads the files git would publish
// (tracked, plus new and not ignored, so the test is the same before and after the commit).
// Needles that would flag this file itself are spelled in pieces.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SKILL = join(ROOT, 'skills', 'paim-reel');
const PYTHON = join(SKILL, '.venv', 'bin', 'python');
const EXAMPLE = join(SKILL, 'examples', 'etf-vs-stock');

const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: ROOT })
  .toString('utf8').split('\0').filter(Boolean).filter((f) => existsSync(join(ROOT, f)));
const read = (f) => readFileSync(join(ROOT, f));
const text = (f) => read(f).toString('utf8');

// The only binary files the repository may carry.
const ALLOWED_BINARY = [
  /^skills\/paim-reel\/assets\/sfx\/[a-z]+\.wav$/,
  /^skills\/paim-reel\/examples\/etf-vs-stock\/gen\/sprites\/[a-z-]+\.png$/,
  /^skills\/paim-reel\/examples\/etf-vs-stock\/gen\/photos\/woven-basket\.jpg$/,
  /^docs\/preview\.gif$/,
];
const MEDIA_EXT = /\.(ttc|ttf|otf|woff2?|wav|m4a|mp3|mp4|mov|png|jpe?g|gif|webp|ico|pdf)$/i;
const FONT_OR_AV_EXT = /\.(ttc|ttf|otf|wav|m4a|mp3|mp4|mov)$/i;
const isBinary = (f) => MEDIA_EXT.test(f) || read(f).subarray(0, 8000).includes(0);
const textFiles = files.filter((f) => !isBinary(f));

const NEEDLES = {
  'an absolute home path': ['', 'Users', ''].join('/'),
  'another project': ['Quant', 'Corner'].join(''),
  'a bank name': ['Krung', 'sri'].join(''),
  'the owner\'s name': ['Nu', 'th'].join(''),
  'the owner\'s account': ['nu', 'thdan', 'ai'].join(''),
};

test('the repository lists files at all', () => {
  assert.ok(files.length > 80, `${files.length} files`);
  assert.ok(files.includes('LICENSE'));
});

test('no font and no audio or video file, except the six generated sound effects', () => {
  for (const f of files) {
    if (!FONT_OR_AV_EXT.test(f)) continue;
    assert.ok(ALLOWED_BINARY.some((re) => re.test(f)), `${f} must not be published`);
  }
  const sfx = files.filter((f) => f.endsWith('.wav')).sort();
  assert.deepEqual(sfx.map((f) => f.split('/').pop()),
    ['chime.wav', 'paper.wav', 'pop.wav', 'thud.wav', 'tick.wav', 'whoosh.wav']);
});

test('binary files are only the example sprites, the example photo, the sound effects and the preview', () => {
  for (const f of files) {
    if (!isBinary(f)) continue;
    assert.ok(ALLOWED_BINARY.some((re) => re.test(f)), `${f} is binary and not on the allow-list`);
  }
  const sprites = files.filter((f) => /gen\/sprites\/.*\.png$/.test(f));
  assert.ok(sprites.length >= 4, 'the example sprites are tracked');
  assert.ok(files.includes('docs/preview.gif'), 'docs/preview.gif is tracked');
});

test('no file names an absolute home path, another project, a bank or the owner', () => {
  for (const f of textFiles) {
    if (f.endsWith('package-lock.json')) continue;
    const body = text(f);
    for (const [what, needle] of Object.entries(NEEDLES)) {
      assert.ok(!body.toLowerCase().includes(needle.toLowerCase()), `${f} names ${what}`);
    }
  }
});

test('no file holds a key, secret or token', () => {
  const re = /(api[_-]?key|secret|token)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}/i;
  for (const f of textFiles) assert.ok(!re.test(text(f)), `${f} looks like it holds a secret`);
  const cloud = /(sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_\-]{30,}|ghp_[A-Za-z0-9]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/;
  for (const f of textFiles) assert.ok(!cloud.test(text(f)), `${f} holds a credential-shaped string`);
});

test('no file is larger than 3 MB', () => {
  for (const f of files) assert.ok(statSync(join(ROOT, f)).size <= 3 * 1024 * 1024, `${f} is over 3 MB`);
});

test('LICENSE is MIT and THIRD_PARTY_NOTICES.md names every dependency, asset and what is not included', () => {
  assert.match(text('LICENSE'), /^MIT License/);
  assert.ok(existsSync(join(ROOT, 'THIRD_PARTY_NOTICES.md')), 'THIRD_PARTY_NOTICES.md exists');
  const n = text('THIRD_PARTY_NOTICES.md');
  for (const needle of [
    /Phosphor Icons[^\n]*MIT/, /IBM Plex Sans Thai[^\n]*OFL-1\.1/, /Playwright[^\n]*Apache-2\.0/,
    /faster-whisper[^\n]*MIT/, /Pillow[^\n]*MIT-CMU/, /numpy[^\n]*BSD-3-Clause/, /OpenFilm[^\n]*MIT/,
    /Sukhumvit Set[^\n]*not (included|bundled|distributed)/i,
    /sprites[^\n]*(generated|drawn)[^\n]*image model/i,
    /Wicker Basket Containing Clay Coins/, /Gary Todd/, /CC0 1\.0/,
    /make_sfx\.py/, /paper\.mjs/,
  ]) assert.match(n, needle, `notices lack ${needle}`);
});

test('the example photo has a credits entry with a stated licence, and the notices carry its page', () => {
  const credits = JSON.parse(text('skills/paim-reel/examples/etf-vs-stock/gen/photos/credits.json'));
  const entry = credits.find((c) => c.name === 'woven-basket');
  assert.ok(entry, 'woven-basket has an entry');
  assert.ok(entry.license && entry.license.toLowerCase() !== 'unknown', `licence is ${entry.license}`);
  assert.match(entry.license, /CC0|public domain/i);
  const page = 'https://commons.wikimedia.org/wiki/File:';
  assert.ok(entry.page_url.startsWith(page));
  assert.ok(text('THIRD_PARTY_NOTICES.md').includes(entry.page_url), 'the notices give the photo\'s page');
  assert.equal(credits.filter((c) => c.name !== 'woven-basket').length, 0, 'no other photo is shipped');
});

test('the six sound effects match a fresh synthesis (make_sfx.py --check)', () => {
  const r = spawnSync(PYTHON, [join(SKILL, 'scripts', 'make_sfx.py'), '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('README has a Thai and an English install section and a status section in each, Thai first', () => {
  const readme = text('README.md');
  const section = (title) => {
    const m = readme.match(new RegExp(`^## ${title}\\s*$`, 'm'));
    assert.ok(m, `README has "## ${title}"`);
    const rest = readme.slice(m.index + m[0].length);
    const next = rest.search(/^## /m);
    return { at: m.index, body: next < 0 ? rest : rest.slice(0, next) };
  };
  const th = section('ติดตั้ง');
  const en = section('Install');
  assert.ok(th.at < en.at, 'the Thai install section comes first');
  assert.ok(th.body.includes('./install.sh'), 'Thai install section runs ./install.sh');
  assert.ok(en.body.includes('./install.sh'), 'English install section runs ./install.sh');
  const thStatus = section('สถานะ: อะไรทดสอบแล้ว อะไรยังไม่ได้ทดสอบ');
  const enStatus = section('Status: what has and has not been tested');
  assert.ok(thStatus.at < enStatus.at);
  for (const body of [thStatus.body, enStatus.body]) {
    assert.match(body, /Windows/);
    assert.match(body, /large-v3/);
    assert.match(body, /Codex/);
  }
  assert.ok(!/__[A-Z_]+__/.test(readme), 'no unfilled placeholder is left in the README');
  assert.match(readme, /^# paim-reel/m);
  assert.ok(readme.indexOf('## ') > 0 && readme.indexOf('docs/preview.gif') > 0, 'the preview GIF is shown');
});

test('every command and path the README quotes exists', () => {
  const readme = text('README.md');
  const paths = [...readme.matchAll(/(?:skills\/paim-reel\/|\.\/)?((?:scripts|references|examples|assets|engine|lib)\/[A-Za-z0-9_./-]+\.[a-z]{2,4})/g)]
    .map((m) => m[1]);
  assert.ok(paths.length >= 3, `found ${paths.length} skill paths in the README`);
  for (const p of new Set(paths)) assert.ok(existsSync(join(SKILL, p)), `README names ${p}, which does not exist`);
  for (const p of ['install.sh', 'docs/known-issues.md', 'docs/preview.gif', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) {
    if (readme.includes(p)) assert.ok(existsSync(join(ROOT, p)), `README names ${p}, which does not exist`);
  }
  const gif = read('docs/preview.gif');
  assert.equal(gif.subarray(0, 4).toString('latin1'), 'GIF8', 'docs/preview.gif is a GIF');
});

test('docs/known-issues.md is plain: no commit hash, no agent id, no ledger words', () => {
  assert.ok(existsSync(join(ROOT, 'docs', 'known-issues.md')));
  const body = text('docs/known-issues.md');
  assert.ok(body.split('\n').filter((l) => l.startsWith('- ')).length >= 60, 'every deferred item has its line');
  assert.ok(!/\b[0-9a-f]{7,40}\b/.test(body.replace(/\b\d{7,}\b/g, '')), 'no commit hash');
  assert.ok(!/\b(Task \d+|R\d+|minor|deferred|reviewer|controller|subagent|implementer|ledger)\b/i.test(body),
    'no ledger jargon');
});
