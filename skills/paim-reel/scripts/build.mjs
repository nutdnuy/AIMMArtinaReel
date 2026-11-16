#!/usr/bin/env node
// build.mjs <project>: turns a project folder into <project>/build/, the folder the render page is served from.
import {
  readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, copyFileSync, readdirSync, realpathSync,
} from 'node:fs';
import { join, resolve, isAbsolute, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadBrand } from '../lib/brand.mjs';
import { loadProfile, effectiveBrand } from '../lib/profile.mjs';
import { iconSvg } from '../lib/icons.mjs';
import { validateStory, StoryError } from '../lib/story.mjs';

export class BuildError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BuildError';
  }
}

const SKILL = fileURLToPath(new URL('..', import.meta.url));
const ENGINE = join(SKILL, 'engine');
const FONT_FILES = join(SKILL, 'node_modules', '@fontsource', 'ibm-plex-sans-thai', 'files');
const FALLBACK_FONTS = Object.freeze({
  400: 'ibm-plex-sans-thai-thai-400-normal.woff2',
  700: 'ibm-plex-sans-thai-thai-700-normal.woff2',
});

function readJson(file, hint) {
  if (!existsSync(file)) throw new BuildError(`${file} not found${hint ? `: ${hint}` : ''}`);
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new BuildError(`${file} is not valid JSON: ${err.message}`);
  }
}

// A path from the story or the brand: absolute, or relative to the project folder.
const inProject = (projectDir, p) => (isAbsolute(p) ? p : resolve(projectDir, p));

// Names of the finished sprites (gen/sprites/<name>.png, not the -raw drafts).
function spriteNames(projectDir) {
  const dir = join(projectDir, 'gen', 'sprites');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.png') && !f.endsWith('-raw.png'))
    .map((f) => f.slice(0, -'.png'.length));
}

// Icon SVGs by name, the way runtime.mjs looks them up (item.icon).
function iconTable(resolved) {
  const icons = {};
  const weights = {};
  for (const scene of resolved.scenes) {
    for (const item of scene.items) {
      if (item.type !== 'icon') continue;
      if (weights[item.icon] && weights[item.icon] !== item.weight) {
        throw new BuildError(`icon "${item.icon}" is used with both weights (${weights[item.icon]} and ${item.weight}): the page keeps one drawing per icon name, so use one weight for it`);
      }
      weights[item.icon] = item.weight;
      icons[item.icon] = iconSvg(item.icon, item.weight);
    }
  }
  return icons;
}

export async function buildProject(projectDir, opts = {}) {
  projectDir = resolve(projectDir);
  const story = readJson(join(projectDir, 'story.json'));
  const timing = readJson(join(projectDir, 'timing.json'), 'run scripts/timing.py first');
  const brand = effectiveBrand(loadBrand(), loadProfile());

  const resolved = validateStory(story, timing, brand, { sprites: spriteNames(projectDir) });

  if (resolved.music) {
    const music = inProject(projectDir, resolved.music);
    if (!existsSync(music)) throw new BuildError(`story.music: file not found: ${music}`);
  }
  const logoSource = brand.logo ? inProject(projectDir, brand.logo) : null;
  if (logoSource && !existsSync(logoSource)) throw new BuildError(`logo: file not found: ${logoSource}`);

  const buildDir = join(projectDir, 'build');
  rmSync(buildDir, { recursive: true, force: true });
  mkdirSync(join(buildDir, 'engine'), { recursive: true });
  mkdirSync(join(buildDir, 'assets', 'sprites'), { recursive: true });

  copyFileSync(join(ENGINE, 'page.html'), join(buildDir, 'index.html'));
  copyFileSync(join(ENGINE, 'style.css'), join(buildDir, 'style.css'));
  for (const f of readdirSync(ENGINE).filter((name) => name.endsWith('.mjs'))) {
    copyFileSync(join(ENGINE, f), join(buildDir, 'engine', f));
  }

  const fallbackFontUrls = {};
  for (const [weight, file] of Object.entries(FALLBACK_FONTS)) {
    if (!existsSync(join(FONT_FILES, file))) {
      throw new BuildError(`fallback font ${file} is missing: run \`npm install\` in the skill folder`);
    }
    copyFileSync(join(FONT_FILES, file), join(buildDir, 'assets', file));
    fallbackFontUrls[weight] = `assets/${file}`;
  }

  const used = new Set(resolved.scenes.flatMap((s) => s.items).filter((i) => i.type === 'sprite').map((i) => i.sprite));
  for (const name of used) {
    copyFileSync(join(projectDir, 'gen', 'sprites', `${name}.png`), join(buildDir, 'assets', 'sprites', `${name}.png`));
  }

  if (logoSource) {
    const name = `logo${extname(logoSource).toLowerCase()}`;
    copyFileSync(logoSource, join(buildDir, 'assets', name));
    resolved.endCard.logo = `assets/${name}`;
  } else {
    resolved.endCard.logo = null;
  }

  const data = {
    resolved,
    brand: { colors: brand.colors },
    icons: iconTable(resolved),
    fallbackFontUrls,
    forceFallback: opts.forceFallback === true,
  };
  writeFileSync(join(buildDir, 'data.js'), `window.__PAIM_DATA = ${JSON.stringify(data)};\n`);
  writeFileSync(join(buildDir, 'resolved.json'), `${JSON.stringify(resolved, null, 2)}\n`);
  return { resolved, buildDir };
}

// Shared by the CLIs: a StoryError prints one problem per line, a BuildError its message; both exit 2.
export function exitWithError(err) {
  if (err instanceof StoryError) {
    console.error(err.problems.join('\n'));
    process.exit(2);
  }
  if (err instanceof BuildError) {
    console.error(err.message);
    process.exit(2);
  }
  console.error(err?.stack ?? String(err));
  process.exit(1);
}

export function isMain(metaUrl) {
  return process.argv[1] !== undefined && metaUrl === pathToFileURL(realpathSync(process.argv[1])).href;
}

if (isMain(import.meta.url)) {
  const [project, ...extra] = process.argv.slice(2);
  if (!project || extra.length) {
    console.error('usage: build.mjs <project>');
    process.exit(2);
  }
  buildProject(project)
    .then(({resolved, buildDir}) => console.log(`built ${resolved.slug} (${resolved.duration} s) -> ${buildDir}`))
    .catch(exitWithError);
}
