import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, symlinkSync, lstatSync, realpathSync,
  existsSync, readFileSync, chmodSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SKILL = join(ROOT, 'skills', 'paim-reel');
const INSTALL = join(ROOT, 'install.sh');
const DOCTOR = join(SKILL, 'scripts', 'doctor.sh');

const tmp = (prefix) => mkdtempSync(join(tmpdir(), `paim-${prefix}-`));

function install(args, extraEnv = {}) {
  const r = spawnSync(INSTALL, args, {
    env: { ...process.env, PAIM_SKIP_DEPS: '1', PAIM_CONFIG_DIR: tmp('cfg'), ...extraEnv },
    encoding: 'utf8',
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

const isLinkToSkill = (path) =>
  lstatSync(path).isSymbolicLink() && realpathSync(path) === realpathSync(SKILL);

test('install links the skill into both agents', () => {
  const home = tmp('home');
  const r = install(['--home', home]);
  assert.equal(r.code, 0, r.err);
  assert.ok(isLinkToSkill(join(home, '.claude', 'skills', 'paim-reel')));
  assert.ok(isLinkToSkill(join(home, '.codex', 'skills', 'paim-reel')));
});

test('install --claude leaves the Codex link absent', () => {
  const home = tmp('home');
  assert.equal(install(['--home', home, '--claude']).code, 0);
  assert.ok(isLinkToSkill(join(home, '.claude', 'skills', 'paim-reel')));
  assert.equal(existsSync(join(home, '.codex')), false);
});

test('install --codex leaves the Claude link absent', () => {
  const home = tmp('home');
  assert.equal(install(['--home', home, '--codex']).code, 0);
  assert.ok(isLinkToSkill(join(home, '.codex', 'skills', 'paim-reel')));
  assert.equal(existsSync(join(home, '.claude')), false);
});

test('running install twice exits 0', () => {
  const home = tmp('home');
  assert.equal(install(['--home', home]).code, 0);
  assert.equal(install(['--home', home]).code, 0);
  assert.ok(isLinkToSkill(join(home, '.claude', 'skills', 'paim-reel')));
});

test('install refuses to touch a target that is not our symlink', () => {
  const home = tmp('home');
  const target = join(home, '.claude', 'skills', 'paim-reel');
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, 'keep.txt'), 'mine');
  const r = install(['--home', home]);
  assert.equal(r.code, 1);
  assert.equal(readFileSync(join(target, 'keep.txt'), 'utf8'), 'mine');
  assert.equal(lstatSync(target).isSymbolicLink(), false);
  assert.equal(existsSync(join(home, '.codex')), false);
});

test('install refuses a symlink that points somewhere else', () => {
  const home = tmp('home');
  const elsewhere = tmp('elsewhere');
  mkdirSync(join(home, '.codex', 'skills'), { recursive: true });
  const target = join(home, '.codex', 'skills', 'paim-reel');
  symlinkSync(elsewhere, target);
  assert.equal(install(['--home', home, '--codex']).code, 1);
  assert.equal(realpathSync(target), realpathSync(elsewhere));
});

// ---- doctor ---------------------------------------------------------------

// PATH holds only a temp folder (node plus the fake executables) and the system
// folders, so a real codex or gemini on the developer machine is never seen.
function doctor({ profile, agent, bins = [], env = {} }) {
  const bin = tmp('bin');
  symlinkSync(process.execPath, join(bin, 'node'));
  for (const name of bins) {
    writeFileSync(join(bin, name), '#!/bin/sh\nexit 0\n');
    chmodSync(join(bin, name), 0o755);
  }
  const cfg = tmp('cfg');
  if (profile) writeFileSync(join(cfg, 'profile.json'), JSON.stringify(profile));
  const args = agent ? ['--agent', agent] : [];
  const r = spawnSync(DOCTOR, args, {
    env: { PATH: `${bin}:/usr/bin:/bin`, HOME: tmp('home'), PAIM_CONFIG_DIR: cfg, ...env },
    encoding: 'utf8',
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

test('doctor: codex chosen and found', () => {
  const r = doctor({ profile: { image_cli: 'codex' }, bins: ['codex'] });
  assert.match(r.out, /^image-cli: ok codex$/m);
});

test('doctor: gemini chosen but not installed', () => {
  const r = doctor({ profile: { image_cli: 'gemini' } });
  assert.match(r.out, /^MISSING image-cli \(gemini not found\)$/m);
  assert.notEqual(r.code, 0);
});

test('doctor: no profile under claude', () => {
  const r = doctor({ agent: 'claude', bins: ['codex'] });
  assert.match(r.out, /^MISSING image-cli \(not chosen\)$/m);
  assert.match(r.out, /^onboarding: needed$/m);
  assert.notEqual(r.code, 0);
});

test('doctor: no profile under codex needs no choice', () => {
  const r = doctor({ agent: 'codex', bins: ['codex'] });
  assert.match(r.out, /^image-cli: ok codex$/m);
  assert.match(r.out, /^onboarding: needed$/m);
});

test('doctor: image_cmd in the profile is honoured', () => {
  const r = doctor({ profile: { image_cli: 'gemini', image_cmd: 'my-image-tool --flag' }, bins: ['my-image-tool'] });
  assert.match(r.out, /^image-cli: ok gemini$/m);
});

test('doctor: PAIM_IMAGE_CMD is honoured', () => {
  const r = doctor({
    profile: { image_cli: 'gemini' }, bins: ['fake-image'], env: { PAIM_IMAGE_CMD: 'fake-image' },
  });
  assert.match(r.out, /^image-cli: ok gemini$/m);
});

test('doctor reports onboarding done once the profile is stamped', () => {
  const r = doctor({
    profile: { image_cli: 'codex', onboarded_at: '2026-01-01T00:00:00.000Z' }, bins: ['codex'],
  });
  assert.match(r.out, /^onboarding: done$/m);
});

test('doctor prints a font line', () => {
  const r = doctor({ profile: { image_cli: 'codex' }, bins: ['codex'] });
  assert.match(r.out, /^font: (Sukhumvit Set|IBM Plex Sans Thai \(fallback\))$/m);
});

test('doctor rejects an unknown agent', () => {
  assert.equal(doctor({ agent: 'bard' }).code, 2);
});
