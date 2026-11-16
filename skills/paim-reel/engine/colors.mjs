// Brand text-colour rules. Plain ES module: loaded by Node (via lib/brand.mjs) and by the browser page.

export class BrandError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BrandError';
  }
}

// Text colour on background: the only four text pairs the brand allows.
export const ALLOWED_PAIRS = Object.freeze([
  ['charcoal', 'cream'],
  ['charcoal', 'orange'],
  ['cream', 'charcoal'],
  ['cream', 'green'],
].map((pair) => Object.freeze(pair)));

export function textColorOn(bg) {
  const pair = ALLOWED_PAIRS.find(([, background]) => background === bg);
  if (!pair) throw new BrandError(`no allowed text colour on ${bg}`);
  return pair[0];
}
