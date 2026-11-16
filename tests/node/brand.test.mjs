import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadBrand, contrast, ALLOWED_PAIRS, textColorOn, BrandError,
} from '../../skills/paim-reel/lib/brand.mjs';

const BRAND_JSON = fileURLToPath(new URL('../../skills/paim-reel/brand.json', import.meta.url));

test('exact brand colours', () => {
  assert.deepEqual(loadBrand().colors,
    { orange: '#F5820B', green: '#14856D', charcoal: '#252B31', cream: '#FFFAF0' });
});

test('contrast', () => {
  assert.ok(contrast('#252B31', '#FFFAF0') > 13);
  assert.ok(contrast('#F5820B', '#FFFAF0') < 3);
});

test('allowed text pairs are exactly the four and each is >= 4.0', () => {
  assert.deepEqual([...ALLOWED_PAIRS].sort(), [
    ['charcoal', 'cream'], ['charcoal', 'orange'], ['cream', 'charcoal'], ['cream', 'green']].sort());
  const c = loadBrand().colors;
  for (const [fg, bg] of ALLOWED_PAIRS) assert.ok(contrast(c[fg], c[bg]) >= 4.0);
});

test('textColorOn', () => {
  assert.equal(textColorOn('cream'), 'charcoal');
  assert.equal(textColorOn('orange'), 'charcoal');
  assert.equal(textColorOn('charcoal'), 'cream');
  assert.equal(textColorOn('green'), 'cream');
});

test('brand.json with a missing colour throws BrandError', () => {
  const brand = JSON.parse(readFileSync(BRAND_JSON, 'utf8'));
  delete brand.colors.green;
  const dir = mkdtempSync(join(tmpdir(), 'paim-brand-'));
  const file = join(dir, 'brand.json');
  writeFileSync(file, JSON.stringify(brand));
  assert.throws(() => loadBrand(file), BrandError);
});
