#!/usr/bin/env node
// build.mjs <project>: turns a project folder into <project>/build/, the folder the render page is served from.
import {
  readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, copyFileSync, readdirSync, realpathSync,
} from 'node:fs';
import { join, resolve, isAbsolute, extname, basename } from 'node:path';
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
const FONT_PACKAGE = join(SKILL, 'node_modules', '@fontsource', 'ibm-plex-sans-thai');
const FONT_FILES = join(FONT_PACKAGE, 'files');
const FONT_SUBSETS = Object.freeze(['thai', 'latin']);
const FONT_WEIGHTS = Object.freeze(['400', '700']);

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

// The extension a copied file keeps: lower-cased, plain letters and digits only. It ends up in file names and in
// attribute values of the page, so a name such as song.m'"><img ...> must never get through.
function plainExtension(source, what) {
  const ext = extname(source).toLowerCase();
  if (!/^\.[a-z0-9]{1,5}$/.test(ext)) {
    throw new BuildError(`${what}: the file name ${JSON.stringify(basename(source))} needs a plain extension (1 to 5 letters or digits, like .mp3 or .png)`);
  }
  return ext;
}

// Names of the finished sprites (gen/sprites/<name>.png, not the -raw drafts).
function spriteNames(projectDir) {
  const dir = join(projectDir, 'gen', 'sprites');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.png') && !f.endsWith('-raw.png'))
    .map((f) => f.slice(0, -'.png'.length));
}

// Entries of gen/photos/credits.json, a list written by fetch_photo.py (none while the file does not exist).
function creditEntries(projectDir) {
  const file = join(projectDir, 'gen', 'photos', 'credits.json');
  if (!existsSync(file)) return [];
  const entries = readJson(file);
  if (!Array.isArray(entries)) throw new BuildError(`${file} must be a list of photo entries: fetch the photos again with scripts/fetch_photo.py`);
  return entries;
}

// The names that have an entry in credits.json.
export const creditedPhotos = (projectDir) => new Set(creditEntries(projectDir).map((e) => e?.name));

// Names of the photos the story may use: gen/photos/<name>.jpg exists and (unless `credited` is false) the
// photo has a credits entry, so a photo whose source was not recorded never reaches a reel.
function photoNames(projectDir, credited) {
  const dir = join(projectDir, 'gen', 'photos');
  if (!existsSync(dir)) return [];
  const have = readdirSync(dir).filter((f) => f.endsWith('.jpg')).map((f) => f.slice(0, -'.jpg'.length));
  if (!credited) return have;
  const named = creditedPhotos(projectDir);
  return have.filter((name) => named.has(name));
}

// Icon SVGs keyed "<name>:<weight>", the way runtime.mjs looks them up.
function iconTable(resolved) {
  const icons = {};
  for (const scene of resolved.scenes) {
    for (const item of scene.items) {
      if (item.type === 'icon') icons[`${item.icon}:${item.weight}`] = iconSvg(item.icon, item.weight);
    }
  }
  return icons;
}

// The fallback font faces of one weight, from the package's own CSS: [{url, unicodeRange}] for the thai
// and latin subsets. The files are copied into build/assets and the urls are build-relative.
function fallbackFaces(weight, buildDir) {
  const css = readFileSync(join(FONT_PACKAGE, `${weight}.css`), 'utf8');
  return FONT_SUBSETS.map((subset) => {
    const name = `ibm-plex-sans-thai-${subset}-${weight}-normal`;
    const block = new RegExp(`/\\* ${name} \\*/\\s*@font-face\\s*\\{[^}]*?unicode-range:\\s*([^;]+);`).exec(css);
    if (!block) throw new BuildError(`${weight}.css of @fontsource/ibm-plex-sans-thai has no ${subset} block: run \`npm install\` in the skill folder`);
    const file = `${name}.woff2`;
    if (!existsSync(join(FONT_FILES, file))) {
      throw new BuildError(`fallback font ${file} is missing: run \`npm install\` in the skill folder`);
    }
    copyFileSync(join(FONT_FILES, file), join(buildDir, 'assets', file));
    return { url: `assets/${file}`, unicodeRange: block[1].trim() };
  });
}

export async function buildProject(projectDir, opts = {}) {
  projectDir = resolve(projectDir);
  const story = readJson(join(projectDir, 'story.json'));
  const timing = readJson(join(projectDir, 'timing.json'), 'run scripts/timing.py first');
  const brand = effectiveBrand(loadBrand(), loadProfile());

  // check.mjs sets allowUncredited so that it can report a missing credits entry on its own line; every
  // other caller (build, still, render) refuses a photo whose source was not recorded.
  const photos = photoNames(projectDir, opts.allowUncredited !== true);
  const resolved = validateStory(story, timing, brand, { sprites: spriteNames(projectDir), photos });

  const musicSource = resolved.music ? inProject(projectDir, resolved.music) : null;
  if (musicSource && !existsSync(musicSource)) throw new BuildError(`story.music: file not found: ${musicSource}`);
  const logoSource = brand.logo ? inProject(projectDir, brand.logo) : null;
  if (logoSource && !existsSync(logoSource)) throw new BuildError(`logo: file not found: ${logoSource}`);

  const musicExt = musicSource ? plainExtension(musicSource, 'story.music') : null;
  const logoExt = logoSource ? plainExtension(logoSource, 'logo') : null;

  const buildDir = join(projectDir, 'build');
  rmSync(buildDir, { recursive: true, force: true });
  mkdirSync(join(buildDir, 'engine'), { recursive: true });
  mkdirSync(join(buildDir, 'assets', 'sprites'), { recursive: true });
  mkdirSync(join(buildDir, 'assets', 'photos'), { recursive: true });

  copyFileSync(join(ENGINE, 'page.html'), join(buildDir, 'index.html'));
  copyFileSync(join(ENGINE, 'style.css'), join(buildDir, 'style.css'));
  for (const f of readdirSync(ENGINE).filter((name) => name.endsWith('.mjs'))) {
    copyFileSync(join(ENGINE, f), join(buildDir, 'engine', f));
  }

  const fallbackFontUrls = {};
  for (const weight of FONT_WEIGHTS) fallbackFontUrls[weight] = fallbackFaces(weight, buildDir);

  const used = new Set(resolved.scenes.flatMap((s) => s.items).filter((i) => i.type === 'sprite').map((i) => i.sprite));
  for (const name of used) {
    copyFileSync(join(projectDir, 'gen', 'sprites', `${name}.png`), join(buildDir, 'assets', 'sprites', `${name}.png`));
  }

  const usedPhotos = new Set(resolved.scenes.flatMap((s) => s.items).filter((i) => i.type === 'photo').map((i) => i.photo));
  for (const name of usedPhotos) {
    copyFileSync(join(projectDir, 'gen', 'photos', `${name}.jpg`), join(buildDir, 'assets', 'photos', `${name}.jpg`));
  }

  // The music is copied too, so the build never names a path outside it.
  if (musicSource) {
    const name = `music${musicExt}`;
    copyFileSync(musicSource, join(buildDir, 'assets', name));
    resolved.music = `assets/${name}`;
  }

  if (logoSource) {
    const name = `logo${logoExt}`;
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
