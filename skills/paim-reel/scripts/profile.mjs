#!/usr/bin/env node
// CLI for the user profile: show | get <key> | set <key> <value> | done [--agent claude|codex] | reset --yes
import {
  loadProfile, saveProfile, deleteProfile, defaultProfile, profilePath,
  PROFILE_KEYS, NULLABLE_KEYS, ProfileError,
} from '../lib/profile.mjs';

const USAGE = `usage: profile.mjs show
       profile.mjs get <key>
       profile.mjs set <key> <value>
       profile.mjs done [--agent claude|codex]
       profile.mjs reset --yes`;

function usage(message) {
  if (message) console.error(message);
  console.error(USAGE);
  process.exit(2);
}

function show(value) {
  return value === null || value === undefined ? '' : String(value);
}

function run(argv) {
  const [command, ...rest] = argv;
  const current = () => loadProfile() ?? defaultProfile();

  switch (command) {
    case 'show':
      console.log(JSON.stringify(current(), null, 2));
      return 0;

    case 'get': {
      const [key] = rest;
      if (!key) usage('get needs a key');
      if (!PROFILE_KEYS.includes(key)) {
        console.error(`unknown profile key: ${key}`);
        return 1;
      }
      console.log(show(current()[key]));
      return 0;
    }

    case 'set': {
      const [key, value] = rest;
      if (!key || value === undefined) usage('set needs a key and a value');
      const nullable = NULLABLE_KEYS.includes(key) && (value === '' || value === 'null');
      saveProfile({ [key]: nullable ? null : value });
      return 0;
    }

    case 'done': {
      let agent = 'claude';
      const i = rest.indexOf('--agent');
      if (i !== -1) agent = rest[i + 1];
      if (!['claude', 'codex'].includes(agent)) usage('--agent must be claude or codex');
      const profile = current();
      const missing = [];
      if (!profile.display_name) missing.push('display_name');
      if (!profile.projects_dir) missing.push('projects_dir');
      if (agent === 'claude' && !profile.image_cli) missing.push('image_cli');
      if (missing.length > 0) {
        console.error(`onboarding incomplete, missing: ${missing.join(', ')}`);
        return 1;
      }
      saveProfile({ onboarded_at: new Date().toISOString() });
      console.log(`onboarding done (${profilePath()})`);
      return 0;
    }

    case 'reset':
      if (!rest.includes('--yes')) {
        console.error('reset deletes the profile; run it again with --yes to confirm');
        return 1;
      }
      deleteProfile();
      return 0;

    default:
      return usage(command ? `unknown command: ${command}` : undefined);
  }
}

try {
  process.exitCode = run(process.argv.slice(2));
} catch (err) {
  if (!(err instanceof ProfileError)) throw err;
  console.error(err.message);
  process.exitCode = 1;
}
