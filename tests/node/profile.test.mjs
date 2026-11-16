import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrand } from '../../skills/paim-reel/lib/brand.mjs';
import {
  profilePath, loadProfile, saveProfile, effectiveBrand, ProfileError,
} from '../../skills/paim-reel/lib/profile.mjs';

const CLI = fileURLToPath(new URL('../../skills/paim-reel/scripts/profile.mjs', import.meta.url));

beforeEach(() => {
  process.env.PAIM_CONFIG_DIR = join(mkdtempSync(join(tmpdir(), 'paim-profile-')), 'cfg');
});

function cli(...args) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    env: { ...process.env }, encoding: 'utf8',
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

test('no profile yet', () => assert.equal(loadProfile(), null));

test('save merges', () => {
  saveProfile({ handle: '@paim' });
  const p = saveProfile({ image_cli: 'gemini' });
  assert.deepEqual(
    [p.handle, p.image_cli, p.version, p.onboarded_at, p.display_name],
    ['@paim', 'gemini', 1, null, 'พี่เอม'],
  );
  assert.ok(profilePath().startsWith(process.env.PAIM_CONFIG_DIR));
  assert.deepEqual(loadProfile(), p);
});

test('save creates the folder and leaves no temporary file behind', () => {
  saveProfile({ handle: '@paim' });
  assert.deepEqual(readdirSync(dirname(profilePath())), ['profile.json']);
});

test('rejects a bad provider and an unknown key', () => {
  assert.throws(() => saveProfile({ image_cli: 'dalle' }), ProfileError);
  assert.throws(() => saveProfile({ password: 'x' }), ProfileError);
  assert.equal(loadProfile(), null);
});

test('accepts codex and null as image_cli', () => {
  assert.equal(saveProfile({ image_cli: 'codex' }).image_cli, 'codex');
  assert.equal(saveProfile({ image_cli: null }).image_cli, null);
});

test('a corrupt profile file throws ProfileError', () => {
  mkdirSync(dirname(profilePath()), { recursive: true });
  writeFileSync(profilePath(), '{not json');
  assert.throws(() => loadProfile(), ProfileError);
});

test('effectiveBrand overrides only non-empty handle, logo, disclaimer', () => {
  const b = effectiveBrand(loadBrand(), { handle: '@paim', logo: '', disclaimer: '' });
  assert.equal(b.handle, '@paim');
  assert.equal(b.logo, null);
  assert.deepEqual(b.colors, loadBrand().colors);
});

test('effectiveBrand with no profile returns the brand unchanged', () => {
  assert.deepEqual(effectiveBrand(loadBrand(), null), loadBrand());
});

test('CLI show, get and set', () => {
  assert.equal(cli('set', 'handle', '@paim').code, 0);
  assert.equal(cli('get', 'handle').out.trim(), '@paim');
  assert.equal(JSON.parse(cli('show').out).handle, '@paim');
  assert.equal(cli('set', 'image_cli', 'dalle').code, 1);
  assert.equal(cli('get', 'nope').code, 1);
});

test('CLI done', () => {
  // exits 1 naming image_cli with --agent claude
  assert.equal(cli('set', 'projects_dir', '/tmp/reels').code, 0);
  const missing = cli('done', '--agent', 'claude');
  assert.equal(missing.code, 1);
  assert.match(missing.err, /image_cli/);
  assert.equal(loadProfile().onboarded_at, null);
  // exits 0 with --agent codex once display_name and projects_dir are set
  const ok = cli('done', '--agent', 'codex');
  assert.equal(ok.code, 0);
  assert.match(loadProfile().onboarded_at, /^\d{4}-\d{2}-\d{2}T/);
});

test('CLI done names projects_dir when it is not set', () => {
  const r = cli('done', '--agent', 'codex');
  assert.equal(r.code, 1);
  assert.match(r.err, /projects_dir/);
  assert.doesNotMatch(r.err, /image_cli/);
});

test('CLI reset needs --yes', () => {
  cli('set', 'handle', '@paim');
  const refused = cli('reset');
  assert.equal(refused.code, 1);
  assert.ok(existsSync(profilePath()));
  assert.equal(cli('reset', '--yes').code, 0);
  assert.equal(loadProfile(), null);
});
