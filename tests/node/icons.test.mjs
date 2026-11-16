import { test } from 'node:test';
import assert from 'node:assert/strict';
import { iconSvg, suggestIcons, IconError } from '../../skills/paim-reel/lib/icons.mjs';

test('known icon', () => assert.match(iconSvg('piggy-bank'), /^<svg/));

test('duotone', () => assert.match(iconSvg('coins', 'duotone'), /<svg/));

test('fill and duotone are different drawings', () => {
  assert.notEqual(iconSvg('coins', 'fill'), iconSvg('coins', 'duotone'));
});

test('unknown icon suggests names', () =>
  assert.throws(() => iconSvg('pigy-bank'),
    (e) => e instanceof IconError && /piggy-bank/.test(e.message)));

test('brand logos are refused', () => {
  for (const name of ['amazon-logo', 'google-logo']) {
    assert.throws(() => iconSvg(name), (e) => e instanceof IconError && /brand/i.test(e.message));
  }
});

test('unsupported weight is refused', () => {
  assert.throws(() => iconSvg('coins', 'bold'), (e) => e instanceof IconError && /weight/.test(e.message));
});

test('names that could escape the icon folder are refused', () => {
  for (const name of ['../brand', 'a/b', '', 'Coins', 'coins.svg']) {
    assert.throws(() => iconSvg(name), IconError, name);
  }
});

test('suggestIcons ranks the nearest first and honours n', () => {
  const s = suggestIcons('pigy-bank', 3);
  assert.equal(s.length, 3);
  assert.equal(s[0], 'piggy-bank');
  assert.ok(!s.some((n) => n.endsWith('-logo')), 'never suggests a brand logo');
});
