import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROFILE_KEYS } from '../../skills/paim-reel/lib/profile.mjs';

const SKILL = fileURLToPath(new URL('../../skills/paim-reel/', import.meta.url));
const read = (rel) => readFileSync(join(SKILL, rel), 'utf8');
const onboarding = () => read('references/onboarding.md');
const cheatsheet = () => read('references/cheatsheet-th.md');

const SECTIONS = [
  'Rules', 'Welcome', 'Machine check', 'Picture helper', 'Brand details', 'First clip',
  'Recording guide and cheat sheet', 'Set up again',
];

test('onboarding.md names every profile key the user can set', () => {
  const text = onboarding();
  for (const key of PROFILE_KEYS.filter((k) => k !== 'version' && k !== 'onboarded_at')) {
    assert.ok(text.includes(`\`${key}\``) || text.includes(`set ${key} `), `names ${key}`);
  }
});

test('onboarding.md has the install, sign-in, test and done commands, and the never-a-password rule', () => {
  const text = onboarding();
  for (const s of [
    'npm install -g @openai/codex', 'npm install -g @google/gemini-cli', 'codex login',
    'image_cli.py test', 'profile.mjs done', 'agy --dangerously-skip-permissions',
  ]) {
    assert.ok(text.includes(s), `contains "${s}"`);
  }
  assert.match(text, /never .*(password|key)/i);
});

test('onboarding.md has its eight sections in order', () => {
  const text = onboarding();
  let last = -1;
  SECTIONS.forEach((name, i) => {
    const m = new RegExp(`^## ${i + 1}\\. ${name}\\b`, 'm').exec(text);
    assert.ok(m, `section "## ${i + 1}. ${name}" exists`);
    assert.ok(m.index > last, `section "${name}" comes after the one before it`);
    last = m.index;
  });
});

test('every scripts/ path onboarding.md mentions exists', () => {
  const paths = [...onboarding().matchAll(/\bscripts\/[A-Za-z0-9_\-.]*[A-Za-z0-9_\-]/g)].map((m) => m[0]);
  assert.ok(paths.length >= 5, `${paths.length} script paths found`);
  for (const p of new Set(paths)) assert.ok(existsSync(join(SKILL, p)), `${p} exists`);
});

test('cheatsheet-th.md is Thai, has both trigger sentences and never says CLI', () => {
  const text = cheatsheet();
  const thai = (text.match(/[฀-๿]/g) ?? []).length;
  assert.ok(thai >= 300, `${thai} Thai characters`);
  assert.ok(text.includes('ทำ reel เรื่อง'), 'has "ทำ reel เรื่อง"');
  assert.ok(text.includes('ทำคลิปจากเสียงนี้'), 'has "ทำคลิปจากเสียงนี้"');
  assert.doesNotMatch(text, /CLI/i);
});

// The text of one "## N. …" section of a markdown file.
const section = (text, n) => new RegExp(`^## ${n}\\.[\\s\\S]*?(?=^## ${n + 1}\\.|(?![\\s\\S]))`, 'm').exec(text)[0];

test('a damaged profile is moved aside, never reset; reset --yes is only in "Set up again"', () => {
  const text = onboarding();
  const rules = section(text, 1);
  const damaged = rules.split('\n- ').find((item) => item.includes('is not valid JSON'));
  assert.ok(damaged, 'section 1 handles a damaged profile');
  assert.ok(damaged.includes('profile.json.bak'), 'the damaged profile is backed up to profile.json.bak');
  for (let n = 1; n <= 7; n++) {
    assert.ok(!section(text, n).includes('reset --yes'), `section ${n} never runs reset --yes`);
  }
  assert.ok(section(text, 8).includes('reset --yes'), 'section 8 keeps reset --yes for her explicit request');
  assert.ok(!text.includes('ตั้งแต่ต้อง'), 'no "ตั้งแต่ต้อง" typo');
});

test('privacy is described accurately: nothing claims "sent nowhere"', () => {
  const sheet = cheatsheet();
  assert.doesNotMatch(sheet, /ไม่ถูกส่งไปที่ไหน|สิ่งเดียวที่ส่ง/, 'no "sent nowhere" or "the only thing sent" claim');
  assert.match(sheet, /ไฟล์เสียง[^\n]*เครื่องนี้/, 'the voice file stays on this machine');
  assert.match(sheet, /ผู้ช่วย[^\n]*อ่าน[^\n]*บท/, 'the assistant reads the script');
  assert.match(sheet, /ค้น[^\n]*(เว็บ|อินเทอร์เน็ต)/, 'fact-check searches go to the web');
  const skill = read('SKILL.md');
  assert.doesNotMatch(skill, /script to any service; only/, 'SKILL.md no longer says the script goes to no service');
  assert.match(skill, /stays? on this machine/, 'SKILL.md says what stays on this machine');
});

test('SKILL.md voice mode: a new recording replaces a pending proposal', () => {
  const step4 = section(read('SKILL.md'), 4);
  const first = step4.split('\n\n')[1];
  assert.match(first, /script\.proposed\.md/, 'the first paragraph is the pending-proposal rule');
  assert.match(first, /no new audio file/i, 'the skip applies only when no new audio file came');
  assert.match(first, /remove\s+`script\.proposed\.md`/, 'a new audio file drops the old proposal');
  assert.match(first, /no audio/i, 'an answer is told apart as a message with no audio');
});

test('SKILL.md routes step 0 to onboarding and its description says ตั้งค่า', () => {
  const skill = read('SKILL.md');
  const description = /^description: (.*)$/m.exec(skill)[1];
  assert.ok(description.includes('ตั้งค่า'), 'description has ตั้งค่า');
  const step0 = /^## 0\.[\s\S]*?(?=^## 1\.)/m.exec(skill)[0];
  assert.ok(step0.includes('references/onboarding.md'), 'step 0 points to references/onboarding.md');
  assert.ok(!/re-run setup/i.test(skill), 'no "re-run setup" left');
});

test('onboarding tells her about effects, web photos, unknown licences and Studio, in Thai', () => {
  // what section 7 tells her before the cheat sheet
  const thai = section(onboarding(), 7).split('\n').filter((l) => l.startsWith('> ')).join('\n');
  assert.match(thai, /เสียงเอฟเฟกต์/, 'clips have sound effects');
  assert.match(thai, /รูปถ่าย[^\n]*เว็บ/, 'real things are shown with photos from the web');
  assert.match(thai, /ไม่รู้[^\n]*สิทธิ์[^\n]*ลิขสิทธิ์[^\n]*(ตัดสินใจ|การตัดสินใจ)/, 'an unknown-licence photo may be copyrighted and is her decision');
  assert.match(thai, /รายชื่อที่มาของรูป|ที่มาของรูป/, 'a credits file comes with the clip');
  assert.match(thai, /100 MB/, 'the first Studio opening downloads about 100 MB');
  assert.match(thai, /ปิด[^\n]*เอง/, 'Studio is hers to close');
  assert.match(thai, /แก้เอง[^\n]*ส่งออก/, 'a clip changed by hand is exported from Studio');
  assert.doesNotMatch(thai, /\bCLI\b/, 'no "CLI" in what she reads');
  assert.ok((thai.match(/Studio/g) ?? []).length <= 1, 'Studio is named once, then in plain Thai');
});

test('the Google-account question has no jargon, and the sample folder is only removed when it is the sample', () => {
  const text = onboarding();
  assert.ok(text.includes('บัญชีส่วนตัว หรือบัญชีของที่ทำงาน'), 'plain question about her Google account');
  assert.doesNotMatch(section(text, 4), /จ่ายค่า Gemini/, 'no product jargon in the question');
  const first = section(text, 6);
  assert.match(first, /"slug"|slug/, 'checks the slug before removing');
  assert.ok(first.includes('etf-vs-stock'), 'names the sample slug');
  assert.ok(first.includes('example-sample'), 'falls back to example-sample');
  const table = section(text, 1);
  assert.ok(table.includes('example-sample'), 'the resume table accepts example-sample too');
});

test('cheat sheet: change a picture, open for hand edits, the Studio export and the unknown-licence note', () => {
  const text = cheatsheet();
  assert.ok(text.includes('"ขอเปลี่ยนรูป'), 'has "ขอเปลี่ยนรูป"');
  assert.ok(text.includes('"เปิดให้แก้เอง"'), 'has "เปิดให้แก้เอง"');
  assert.match(text, /แก้เอง[^\n]*ส่งออก/, 'a clip changed by hand is exported from the editor');
  assert.match(text, /100 MB/, 'the first opening downloads about 100 MB');
  assert.match(text, /ไม่รู้[^\n]*สิทธิ์[^\n]*ลิขสิทธิ์/, 'unknown-licence photos may be copyrighted');
  assert.match(text, /ค้น[^\n]*รูป[^\n]*เว็บ|รูป[^\n]*ค้น[^\n]*เว็บ/, 'photo searches go to the web');
  assert.ok((text.match(/Studio/g) ?? []).length <= 1, 'the editor is named once, then in plain Thai');
});
