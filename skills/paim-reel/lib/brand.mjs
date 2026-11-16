// Brand tokens: loading, validation and WCAG contrast helpers.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export class BrandError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BrandError';
  }
}

const DEFAULT_BRAND_PATH = fileURLToPath(new URL('../brand.json', import.meta.url));
const COLOR_NAMES = ['orange', 'green', 'charcoal', 'cream'];
const HEX = /^#[0-9A-Fa-f]{6}$/;

// Text colour on background: the only four text pairs the brand allows.
export const ALLOWED_PAIRS = Object.freeze([
  ['charcoal', 'cream'],
  ['charcoal', 'orange'],
  ['cream', 'charcoal'],
  ['cream', 'green'],
].map((pair) => Object.freeze(pair)));

const isString = (v) => typeof v === 'string';

function validate(brand, source) {
  const fail = (what) => { throw new BrandError(`${source}: ${what}`); };
  if (brand === null || typeof brand !== 'object') fail('not an object');
  if (!isString(brand.name) || !brand.name) fail('name must be a non-empty string');
  if (!isString(brand.handle)) fail('handle must be a string');
  if (brand.logo !== null && !isString(brand.logo)) fail('logo must be a string or null');
  if (!isString(brand.disclaimer)) fail('disclaimer must be a string');
  if (brand.colors === null || typeof brand.colors !== 'object') fail('colors is missing');
  for (const name of COLOR_NAMES) {
    if (!HEX.test(brand.colors[name] ?? '')) fail(`colors.${name} must be a #RRGGBB hex colour`);
  }
  const fonts = brand.fonts;
  if (fonts === null || typeof fonts !== 'object') fail('fonts is missing');
  if (!isString(fonts.family) || !fonts.family) fail('fonts.family must be a non-empty string');
  if (!isString(fonts.fallback) || !fonts.fallback) fail('fonts.fallback must be a non-empty string');
  for (const key of ['headlineWeight', 'bodyWeight']) {
    if (!Number.isInteger(fonts[key])) fail(`fonts.${key} must be an integer`);
  }
}

export function loadBrand(path = DEFAULT_BRAND_PATH) {
  let brand;
  try {
    brand = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new BrandError(`cannot read brand file ${path}: ${err.message}`);
  }
  validate(brand, path);
  return brand;
}

function channel(value) {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  if (!HEX.test(hex)) throw new BrandError(`not a #RRGGBB colour: ${hex}`);
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255)
    + 0.0722 * channel(n & 255);
}

// WCAG 2.x contrast ratio, 1 to 21.
export function contrast(hexA, hexB) {
  const [hi, lo] = [luminance(hexA), luminance(hexB)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

export function textColorOn(bg) {
  const pair = ALLOWED_PAIRS.find(([, background]) => background === bg);
  if (!pair) throw new BrandError(`no allowed text colour on ${bg}`);
  return pair[0];
}
