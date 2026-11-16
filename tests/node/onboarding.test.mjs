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

test('SKILL.md routes step 0 to onboarding and its description says ตั้งค่า', () => {
  const skill = read('SKILL.md');
  const description = /^description: (.*)$/m.exec(skill)[1];
  assert.ok(description.includes('ตั้งค่า'), 'description has ตั้งค่า');
  const step0 = /^## 0\.[\s\S]*?(?=^## 1\.)/m.exec(skill)[0];
  assert.ok(step0.includes('references/onboarding.md'), 'step 0 points to references/onboarding.md');
  assert.ok(!/re-run setup/i.test(skill), 'no "re-run setup" left');
});
