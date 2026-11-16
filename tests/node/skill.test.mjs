import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { buildProject } from '../../skills/paim-reel/scripts/build.mjs';
import { checkProject } from '../../skills/paim-reel/scripts/check.mjs';
import { tempDir, HOME_PREFIX } from '../helpers.mjs';

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
  assert.doesNotMatch(openfilm, /\bI\b|\b[Mm]y\b|\b[Oo]ur\b|\b[Ww]e\b/, 'openfilm.md has no first person');
  assert.doesNotMatch(openfilm, /byte for byte/);
  assert.match(openfilm, /the same picture/);
});

// ---- revision 1: rules restored after the compaction, and what the acceptance run showed was missing ----

const flat = (text) => text.replace(/\s+/g, ' ');
const stepText = (n) => flat(skillSection(`${n}.`));
const refText = (name) => flat(readFileSync(join(SKILL, 'references', name), 'utf8'));

test('step 6.2: a drawing tool that keeps failing sends her to section 4 of onboarding.md in plain Thai', () => {
  const step6 = stepText(6);
  assert.match(step6, /scripts\/image_cli\.py test` \(same `--agent`\) says why: tell her that sentence in plain Thai and do section 4 of `references\/onboarding\.md`/);
});

test('step 4.3 and script-style.md: the proposal keeps the lNN: line format; only [?] stands for an unreadable word', () => {
  const step4 = stepText(4);
  assert.match(step4, /`<project>\/script\.proposed\.md` \(never `script\.md`\) as `lNN:` lines \(`timing\.py` reads only those\)/, 'SKILL.md: lNN: lines like script.md');
  assert.match(step4, /write `\[\?\]` and nothing else \(your best guesses go in your message to her, labelled as guesses, never in the file\)/i, 'SKILL.md: guesses go in the message');
  const style = refText('script-style.md');
  assert.match(style, /It keeps the `lNN:` line format of `script\.draft\.md` and `script\.md`; `timing\.py` reads only those lines/);
  assert.match(style, /holds only `\[\?\]` for a word you cannot read[^.]*best guesses go in your message to her, labelled as guesses, never in the file/i);
});

test('step 4 reads the normal fresh recording first, then the two special cases', () => {
  const [normal, ...rest] = skillSection('4.').trim().split('\n\n').slice(1).map(flat);
  assert.match(normal, /4\.1/);
  assert.doesNotMatch(normal, /script\.proposed\.md/, 'the first paragraph is the fresh case');
  const special = rest.join(' ');
  assert.match(special, /no audio file/i, 'the skip applies only when no audio file came');
  assert.match(special, /remove `script\.proposed\.md`[^.]*old proposal is dropped/, 'a new audio file drops the old proposal');
  assert.match(special, /with no audio|no audio/i);
  assert.match(special, /apply it as in 4\.3/);
});

test('step 9: no hand-off after WARN openfilm, a Studio address is read from the output and never saved, 100 MB is asked once', () => {
  const deliver = stepText(9);
  assert.match(deliver, /If `doctor\.sh` printed `WARN openfilm`, skip the hand-off and tell her why/);
  assert.doesNotMatch(deliver, /after `WARN openfilm` say there is none/);
  assert.match(deliver, /directly: read the address from its output, never redirect or save that output/i);
  assert.match(deliver, /Before the first Studio opening of a conversation[^.]*about 100 MB[^.]*not been used on this machine[^.]*ask/);
  const ref = refText('openfilm.md');
  assert.match(ref, /Run `open_studio\.sh` directly and read the address from its output; never redirect or save that output/);
  assert.match(ref, /Before the first `open_studio\.sh` of a conversation[^.]*about 100 MB[^.]*not been used on this machine[^.]*ask/);
  assert.doesNotMatch(ref, /_npx|npm config get cache/, 'the npx-cache test is gone');
});

test('step 8: how to know a final has effects', () => {
  assert.match(stepText(8), /a final has them when `<project>\/build\/sfx\.wav` exists and `story\.sfx` is not `false`/);
});

test('steps 3.3 and 4.1 say the estimate is a floor and where prep_voice.py is described', () => {
  assert.match(stepText(3), /\(the estimate is a floor; real speech runs longer\)/);
  assert.match(stepText(4), /prep_voice\.py[\s\S]*?\(what it does to the take: `references\/script-style\.md`\)/);
});

test('script-style.md: ๆ stays attached, the spoken form she used, digits as read aloud, a low ratio with no LOW line', () => {
  const style = refText('script-style.md');
  assert.match(style, /`ๆ` stays attached to its word \(`แบบง่ายๆ`\)[^.]*never a phrase by itself/);
  assert.match(style, /keep the spoken form she used[^.]*`นึง`[^.]*`ง่ายๆ`/i);
  assert.match(style, /digits in the draft[^.]*written as the words that were read aloud/i);
  assert.match(style, /lowest ratio under 0\.75 with no `LOW` line, look at that line in `script\.draft\.md`/i);
  assert.ok(/^## A low ratio without a LOW line$/m.test(readFileSync(join(SKILL, 'references', 'script-style.md'), 'utf8')), 'the heading step 4.4 points to exists');
  assert.match(style, /recogniser noise[^.]*keep her confirmed text[^.]*delivery note[^.]*could not be checked by ear/i);
});

test('story-json.md and step 9: your own headlines add no claim or figure, and are listed so she can change them', () => {
  const story = refText('story-json.md');
  assert.match(story, /own words[^.]*add no claim and no figure/i);
  assert.match(story, /listed in the delivery note[^.]*change/i);
  assert.match(story, /figure she spoke without naming its source[^.]*once a source is found/i);
  assert.match(stepText(9), /headline[^.;]*you (?:worded|wrote)[^.;]*(change|listed)/i);
  assert.match(stepText(9), /could not be checked by ear/i, 'the delivery note says when a line was not checked by ear');
});

test('the example photo\'s label adds something to the headline above it', () => {
  for (const sc of story().scenes) {
    const headline = sc.headline?.text.replace(/\s/g, '');
    for (const item of sc.items.filter((i) => i.type === 'photo' && i.label)) {
      const label = item.label.replace(/\s/g, '');
      assert.ok(!headline || !headline.includes(label), `${sc.id}: the photo label "${item.label}" repeats the headline`);
    }
  }
});

test('every scripts/ and references/ path SKILL.md mentions exists', () => {
  const paths = [...skillText().matchAll(/\b(?:scripts|references)\/[A-Za-z0-9_\-./]*[A-Za-z0-9_\-]/g)].map((m) => m[0]);
  assert.ok(paths.length >= 10, `SKILL.md names its commands (${paths.length} paths found)`);
  for (const p of new Set(paths)) assert.ok(existsSync(join(SKILL, p)), `${p} exists in the skill folder`);
});

test('no absolute home path and no other project\'s name anywhere under skills/', () => {
  for (const file of textFiles(SKILLS)) {
    const text = readFileSync(file, 'utf8');
    assert.ok(!text.includes(HOME_PREFIX), `${file} has no absolute home path`);
    assert.ok(!/quant ?corner/i.test(text), `${file} names no other project`);
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
