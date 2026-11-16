import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { buildProject } from '../../skills/paim-reel/scripts/build.mjs';
import { checkProject } from '../../skills/paim-reel/scripts/check.mjs';
import { tempDir } from '../helpers.mjs';

const SKILL = fileURLToPath(new URL('../../skills/paim-reel/', import.meta.url));
const SKILLS = fileURLToPath(new URL('../../skills/', import.meta.url));
const EXAMPLE = join(SKILL, 'examples', 'etf-vs-stock');
const PYTHON = join(SKILL, '.venv', 'bin', 'python');
const SLOW = { timeout: 180_000 };

const skillText = () => readFileSync(join(SKILL, 'SKILL.md'), 'utf8');

// {data: {key: value}, body} of a markdown file with a `---` frontmatter of one-line `key: value` pairs.
function frontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  assert.ok(m, 'SKILL.md starts with a --- frontmatter block');
  const data = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([a-z_-]+):\s*(.*)$/.exec(line);
    assert.ok(kv, `frontmatter line parses: ${line}`);
    data[kv[1]] = kv[2].replace(/^"(.*)"$/, '$1');
  }
  return { data, body: m[2] };
}

// Every text file under `dir`, skipping installed dependencies and caches.
function textFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.venv', '__pycache__', '.pytest_cache'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...textFiles(path));
    else if (!/\.(png|jpe?g|woff2?|ttf|mp4|wav|m4a)$/i.test(entry.name)) out.push(path);
  }
  return out;
}

const story = () => JSON.parse(readFileSync(join(EXAMPLE, 'story.json'), 'utf8'));
const allItems = (s) => s.scenes.flatMap((sc) => sc.items);

test('SKILL.md frontmatter: name, and a description that names both entry points', () => {
  const { data } = frontmatter(skillText());
  assert.equal(data.name, 'paim-reel');
  assert.ok(data.description.length > 0 && data.description.length <= 1024, `description is ${data.description.length} chars`);
  assert.match(data.description, /topic/i);
  assert.match(data.description, /voice recording/i);
  for (const phrase of ['ทำคลิปจากเสียงนี้', 'ทำ reel เรื่อง', 'make a P.AIM short about']) {
    assert.ok(data.description.includes(phrase), `description has the trigger "${phrase}"`);
  }
});

test('SKILL.md is at most 185 lines, frontmatter included', () => {
  const lines = skillText().trimEnd().split('\n').length;
  assert.ok(lines <= 185, `SKILL.md has ${lines} lines`);
});

// The SKILL.md section that starts with `heading` (a "## …" line), up to the next "## " heading.
const skillSection = (heading) => {
  const text = skillText();
  const start = text.indexOf(`\n## ${heading}`);
  assert.ok(start >= 0, `SKILL.md has a "## ${heading}" section`);
  const next = text.indexOf('\n## ', start + 1);
  return text.slice(start, next < 0 ? undefined : next);
};

test('SKILL.md states its three hard rules in one place, near the top', () => {
  const text = skillText();
  const rules = skillSection('Three rules');
  assert.ok(text.indexOf('\n## Three rules') < text.indexOf('\n## 0.'), 'the rules come before step 0');
  // a rule's words, with its line breaks and indentation read as single spaces
  const numbered = rules.split(/\n(?=\d\. )/).slice(1).map((r) => r.replace(/\s+/g, ' '));
  assert.equal(numbered.length, 3, 'three numbered rules');
  const [voice, figures, studio] = numbered;
  // (a) voice mode with no script
  assert.match(voice, /script\.proposed\.md/);
  assert.match(voice, /\*\*stop\*\*/i);
  assert.match(voice, /confirm/);
  assert.match(voice, /`examples\/`[^.]*never a source/);
  // (b) figures and photo licences
  assert.match(figures, /every number on screen has a `source`/i);
  assert.match(figures, /licence is `unknown`/);
  assert.match(figures, /may be copyrighted and are used at her decision/);
  // (c) Studio
  assert.match(studio, /[Nn]ever stop or restart Studio/);
  assert.match(studio, /[Nn]o OpenFilm hand-off for a draft/);
  assert.match(studio, /address[^.]*once, in the chat, and write it nowhere/);
});

test('SKILL.md "Never" agrees with photos.md on logos and says what stays on this machine', () => {
  const never = skillSection('Never').replace(/\n {2}/g, ' ');
  const logos = never.split('\n- ').find((b) => /[Ll]ogos/.test(b));
  assert.ok(logos.includes('references/photos.md'), 'the logo rule points to photos.md for photos');
  const privacy = never.split('\n- ').find((b) => /stay on this machine/.test(b));
  assert.ok(privacy, 'a bullet says what stays on this machine');
  assert.match(privacy, /voice file and the speech-to-text stay on this machine/);
  assert.match(privacy, /read the script and transcript text in this chat/);
  assert.match(privacy, /photo searches go to the web/);
});

test('SKILL.md routes her change requests and the Studio hand-off', () => {
  const text = skillText();
  for (const phrase of ['ขอเปลี่ยนรูป', 'เปิดให้แก้เอง']) assert.ok(text.includes(phrase), `SKILL.md handles "${phrase}"`);
  assert.match(text, /100 MB/, 'SKILL.md says the first Studio opening downloads about 100 MB');
});

test('the draft banner says the voice is missing, not all sound, in the engine and in brand.md', () => {
  const runtime = readFileSync(join(SKILL, 'engine', 'runtime.mjs'), 'utf8');
  const brand = readFileSync(join(SKILL, 'references', 'brand.md'), 'utf8');
  for (const [name, text] of [['runtime.mjs', runtime], ['brand.md', brand]]) {
    assert.ok(text.includes('DRAFT · ยังไม่มีเสียงพูด'), `${name} has the new banner`);
    assert.ok(!/DRAFT · ยังไม่มีเสียง(?!พูด)/.test(text), `${name} has no old banner`);
  }
});

test('the references say what to do on a refused fetch, how loud a file can end, and speak impersonally', () => {
  const photos = readFileSync(join(SKILL, 'references', 'photos.md'), 'utf8');
  assert.match(photos, /429/);
  assert.match(photos, /wait[^.]*retry once/i);
  assert.match(photos, /macOS or Linux/);
  assert.match(photos, /PAIM_USER_AGENT/);
  const story = readFileSync(join(SKILL, 'references', 'story-json.md'), 'utf8');
  const prose = story.replace(/\s+/g, ' ');
  assert.match(prose, /last kept sound of the same name/);
  assert.match(prose, /-1\.2 dBFS before AAC/);
  assert.match(prose, /true peak can end slightly higher/);
  for (const line of story.split('\n').filter((l) => /dBFS/.test(l) && !l.startsWith('|'))) {
    assert.ok(line.length <= 110, `story-json.md: the loudness lines are wrapped: ${line.slice(0, 60)}`);
  }
  const openfilm = readFileSync(join(SKILL, 'references', 'openfilm.md'), 'utf8');
  assert.doesNotMatch(openfilm, /\bI\b|\b[Mm]y\b/, 'openfilm.md has no first person');
  assert.doesNotMatch(openfilm, /byte for byte/);
  assert.match(openfilm, /the same picture/);
});

test('every scripts/ and references/ path SKILL.md mentions exists', () => {
  const paths = [...skillText().matchAll(/\b(?:scripts|references)\/[A-Za-z0-9_\-./]*[A-Za-z0-9_\-]/g)].map((m) => m[0]);
  assert.ok(paths.length >= 10, `SKILL.md names its commands (${paths.length} paths found)`);
  for (const p of new Set(paths)) assert.ok(existsSync(join(SKILL, p)), `${p} exists in the skill folder`);
});

test('no absolute /Users/ path and no QuantCorner anywhere under skills/', () => {
  for (const file of textFiles(SKILLS)) {
    const text = readFileSync(file, 'utf8');
    assert.ok(!text.includes('/Users/'), `${file} has no /Users/ path`);
    assert.ok(!/quantcorner/i.test(text), `${file} does not mention QuantCorner`);
  }
});

test('the example uses the schema in full', () => {
  const s = story();
  assert.ok(s.scenes.length >= 4, `${s.scenes.length} scenes`);
  assert.equal(s.scenes[0].layout, 'versus', 'the example opens on a versus scene');
  const bgs = new Set(s.scenes.map((sc) => sc.bg ?? 'cream'));
  assert.deepEqual([...bgs].sort(), ['charcoal', 'cream']);
  const items = allItems(s);
  assert.ok(items.filter((i) => i.type === 'sprite').length >= 4, 'at least 4 sprite items');
  assert.ok(items.some((i) => i.type === 'number' && typeof i.source === 'string' && i.source.trim() !== ''), 'a sourced number');
  assert.ok(Array.isArray(s.highlight) && s.highlight.length > 0, 'highlight is used');
});

test('every sprite the example names is a committed RGBA PNG under 400 KB', () => {
  const dir = join(EXAMPLE, 'gen', 'sprites');
  const names = new Set(allItems(story()).filter((i) => i.type === 'sprite').map((i) => i.sprite));
  for (const name of names) {
    const file = join(dir, `${name}.png`);
    assert.ok(existsSync(file), `${name}.png exists`);
    assert.ok(statSync(file).size < 400 * 1024, `${name}.png is under 400 KB`);
    const bytes = readFileSync(file);
    assert.equal(bytes.subarray(1, 4).toString('latin1'), 'PNG', `${name}.png is a PNG`);
    assert.equal(bytes[25], 6, `${name}.png has colour type 6 (RGBA)`);
  }
  const files = readdirSync(dir);
  assert.deepEqual(files.filter((f) => !f.endsWith('.png') || f.endsWith('-raw.png')), [], 'only keyed PNGs are kept');
});

test('the example estimates, builds and passes check.mjs with zero findings', SLOW, async (t) => {
  process.env.PAIM_CONFIG_DIR = tempDir(t, 'paim-config');
  const project = join(tempDir(t), 'etf-vs-stock');
  cpSync(EXAMPLE, project, { recursive: true });
  const r = spawnSync(PYTHON, [join(SKILL, 'scripts', 'timing.py'), 'estimate', project], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const timing = JSON.parse(readFileSync(join(project, 'timing.json'), 'utf8'));
  assert.ok(timing.lines.length >= 10 && timing.lines.length <= 12, `${timing.lines.length} lines`);
  assert.ok(timing.duration >= 30 && timing.duration <= 40, `about 35 s, got ${timing.duration}`);
  const { resolved } = await buildProject(project);
  assert.equal(resolved.slug, story().slug);
  const c = await checkProject(project);
  assert.deepEqual([c.text, c.deadBeats, c.overlaps, c.credits], [[], [], [], []]);
  assert.equal(c.pass, true);
});

test('the example has one public-domain or CC0 photo, committed with its credits entry', () => {
  const photos = allItems(story()).filter((i) => i.type === 'photo');
  assert.equal(new Set(photos.map((i) => i.photo)).size, 1, 'exactly one photo');
  const name = photos[0].photo;
  const dir = join(EXAMPLE, 'gen', 'photos');
  assert.deepEqual(readdirSync(dir).sort(), ['credits.json', `${name}.jpg`], 'only the photo and its record');
  const bytes = readFileSync(join(dir, `${name}.jpg`));
  assert.deepEqual([...bytes.subarray(0, 3)], [0xff, 0xd8, 0xff], 'a JPEG');
  assert.ok(bytes.length < 400 * 1024, `${name}.jpg is under 400 KB`);
  const entries = JSON.parse(readFileSync(join(dir, 'credits.json'), 'utf8'));
  assert.equal(entries.length, 1);
  const [entry] = entries;
  assert.equal(entry.name, name);
  assert.notEqual(entry.license.trim().toLowerCase(), 'unknown');
  assert.match(entry.license, /CC0|[Pp]ublic domain/, 'public domain or CC0');
  assert.match(entry.page_url, /^https:\/\//);
  assert.match(entry.image_url, /^https:\/\//);
  assert.ok(entry.credit.trim() !== '', 'a credit line');
  assert.equal(entry.sha256, createHash('sha256').update(bytes).digest('hex'), 'the record is of this file');
});

test('photos.md makes the unknown-licence delivery note impossible to miss, and SKILL.md points at it', () => {
  const photos = readFileSync(join(SKILL, 'references', 'photos.md'), 'utf8');
  assert.match(photos, /\*\*Attach the credits file\. List every photo whose licence is `unknown`, each with its page URL,/);
  assert.match(photos, /may be copyrighted and are used at P\.AIM's own decision/);
  for (const rule of [/watermark/, /other creators' videos/, /private people/, /company logo/, /Never copy|copied nowhere/, /Read every fetched photo/i]) {
    assert.match(photos, rule);
  }
  const text = skillText();
  for (const mention of ['references/photos.md', 'scripts/fetch_photo.py', 'scripts/credits.py', '`unknown`']) {
    assert.ok(text.includes(mention), `SKILL.md mentions ${mention}`);
  }
});
