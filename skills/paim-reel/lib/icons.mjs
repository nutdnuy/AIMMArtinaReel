// Phosphor icon lookup. Node only (reads the installed @phosphor-icons/core assets).
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export class IconError extends Error {
  constructor(message) {
    super(message);
    this.name = 'IconError';
  }
}

const ASSETS = fileURLToPath(new URL('../node_modules/@phosphor-icons/core/assets/', import.meta.url));
const WEIGHTS = ['fill', 'duotone'];
const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

let nameCache = null;

// Every icon name in the installed set, minus brand logos (never offered as a suggestion).
function allNames() {
  if (!nameCache) {
    if (!existsSync(`${ASSETS}fill`)) {
      throw new IconError('Phosphor icons are not installed: run `npm install` in the skill folder');
    }
    nameCache = readdirSync(`${ASSETS}fill`)
      .filter((f) => f.endsWith('-fill.svg'))
      .map((f) => f.slice(0, -'-fill.svg'.length))
      .filter((n) => !n.endsWith('-logo'));
  }
  return nameCache;
}

function distance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

export function suggestIcons(name, n = 5) {
  const q = String(name).toLowerCase();
  return allNames()
    .map((candidate) => ({ candidate, d: distance(q, candidate) - (candidate.includes(q) && q ? 2 : 0) }))
    .sort((x, y) => x.d - y.d || x.candidate.localeCompare(y.candidate))
    .slice(0, n)
    .map((x) => x.candidate);
}

export function iconSvg(name, weight = 'fill') {
  if (!WEIGHTS.includes(weight)) {
    throw new IconError(`icon weight "${weight}" is not supported: use ${WEIGHTS.join(' or ')}`);
  }
  if (typeof name !== 'string' || !NAME.test(name)) {
    throw new IconError(`"${name}" is not a Phosphor icon name (lower-case words joined by "-")`);
  }
  if (name.endsWith('-logo')) {
    throw new IconError(`"${name}" is a third-party brand logo: brand logos are not allowed, pick a generic icon`);
  }
  const file = `${ASSETS}${weight}/${name}-${weight}.svg`;
  if (!existsSync(file)) {
    throw new IconError(`unknown icon "${name}" (${weight}). Did you mean: ${suggestIcons(name).join(', ')}?`);
  }
  return readFileSync(file, 'utf8').trim();
}
