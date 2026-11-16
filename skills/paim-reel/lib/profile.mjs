// User profile: ${PAIM_CONFIG_DIR:-$HOME/.config/paim-reel}/profile.json
import { readFileSync, writeFileSync, renameSync, mkdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

export class ProfileError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProfileError';
  }
}

export const IMAGE_CLIS = Object.freeze(['codex', 'gemini']);

const DEFAULTS = Object.freeze({
  version: 1,
  onboarded_at: null,
  display_name: 'พี่เอม',
  handle: '',
  logo: '',
  disclaimer: '',
  audience: '',
  tone: '',
  image_cli: null,
  image_cmd: null,
  projects_dir: '',
});

export const PROFILE_KEYS = Object.freeze(Object.keys(DEFAULTS));
// Keys that may hold null as well as a string.
export const NULLABLE_KEYS = Object.freeze(['onboarded_at', 'image_cmd', 'image_cli']);

export function profilePath() {
  const dir = process.env.PAIM_CONFIG_DIR || join(homedir(), '.config', 'paim-reel');
  return join(dir, 'profile.json');
}

export function defaultProfile() {
  return { ...DEFAULTS };
}

export function loadProfile() {
  let raw;
  try {
    raw = readFileSync(profilePath(), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw new ProfileError(`cannot read ${profilePath()}: ${err.message}`);
  }
  let stored;
  try {
    stored = JSON.parse(raw);
  } catch (err) {
    throw new ProfileError(`${profilePath()} is not valid JSON: ${err.message}`);
  }
  if (stored === null || typeof stored !== 'object' || Array.isArray(stored)) {
    throw new ProfileError(`${profilePath()} must hold a JSON object`);
  }
  return { ...DEFAULTS, ...stored };
}

function checkPatch(patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (!PROFILE_KEYS.includes(key)) throw new ProfileError(`unknown profile key: ${key}`);
    if (key === 'version') throw new ProfileError('version is read-only');
    if (key === 'image_cli') {
      if (value !== null && !IMAGE_CLIS.includes(value)) {
        throw new ProfileError(`image_cli must be one of ${IMAGE_CLIS.join(', ')} or null`);
      }
    } else if (value === null ? !NULLABLE_KEYS.includes(key) : typeof value !== 'string') {
      throw new ProfileError(`${key} must be a string${NULLABLE_KEYS.includes(key) ? ' or null' : ''}`);
    }
  }
}

export function saveProfile(patch) {
  checkPatch(patch);
  const merged = { ...(loadProfile() ?? DEFAULTS), ...patch };
  const file = profilePath();
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(merged, null, 2)}\n`);
  renameSync(tmp, file);
  return merged;
}

export function deleteProfile() {
  rmSync(profilePath(), { force: true });
}

// The profile's non-empty handle, logo and disclaimer replace the brand's.
export function effectiveBrand(brand, profile) {
  const result = { ...brand };
  if (!profile) return result;
  for (const key of ['handle', 'logo', 'disclaimer']) {
    if (typeof profile[key] === 'string' && profile[key] !== '') result[key] = profile[key];
  }
  return result;
}
