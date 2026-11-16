import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
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

test('SKILL.md body is at most 200 lines', () => {
  const { body } = frontmatter(skillText());
  const lines = body.trimEnd().split('\n').length;
  assert.ok(lines <= 200, `body has ${lines} lines`);
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
  assert.deepEqual([c.text, c.deadBeats, c.overlaps], [[], [], []]);
  assert.equal(c.pass, true);
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
