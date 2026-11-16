import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildProject } from '../../skills/paim-reel/scripts/build.mjs';
import { openPage } from '../../skills/paim-reel/lib/serve.mjs';
import { copyFixture, tempDir } from '../helpers.mjs';

const SLOW = { timeout: 120_000 };
const STROKE_HALF = 8; // the widest mark stroke is 16 px; a <g>'s client rect leaves the stroke out

// mini in `layout`, both icons with labels, a ring and a cross on the first and an arrow to the second.
export function markedProject(t, layout) {
  process.env.PAIM_CONFIG_DIR = tempDir(t, 'paim-config');
  const dir = copyFixture(t, 'mini', `marks-${layout}`);
  const file = join(dir, 'story.json');
  const story = JSON.parse(readFileSync(file, 'utf8'));
  const scene = story.scenes[0];
  scene.layout = layout;
  scene.items[0].label = 'หุ้นตัวเดียว';
  scene.items[1].label = 'ETF ทั้งตะกร้า';
  scene.items[1].at = 'l01@1';
  scene.marks = [
    { type: 'ring', on: 'stock', at: 'l02' },
    { type: 'cross', on: 'etf', at: 'l02' },
    { type: 'arrow', from: 'stock', to: 'etf', at: 'l02' },
  ];
  writeFileSync(file, JSON.stringify(story));
  return dir;
}

const intersects = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// Each drawn mark's box (stroke included) and each item label's box, at time `t`.
async function boxesAt(page, t) {
  return page.evaluate(([s, pad]) => {
    window.__paim.seek(s);
    const stage = document.getElementById('stage').getBoundingClientRect();
    const marks = [...document.querySelectorAll('svg.marks > g')]
      .filter((g) => g.style.display !== 'none')
      .map((g) => {
        const r = g.getBoundingClientRect();
        return { x: r.left - stage.left - pad, y: r.top - stage.top - pad, w: r.width + 2 * pad, h: r.height + 2 * pad };
      });
    const labels = window.__paim.textBoxes().filter((b) => b.kind === 'label');
    return { marks, labels };
  }, [t, STROKE_HALF]);
}

for (const layout of ['row', 'stack', 'versus']) {
  test(`marks stay clear of item labels in a ${layout}, and draw the same on every seek`, SLOW, async (t) => {
    const dir = markedProject(t, layout);
    const { resolved } = await buildProject(dir);
    const settled = resolved.scenes[0].marks[0].t + 0.5;
    const { page, close } = await openPage(dir);
    try {
      const { marks, labels } = await boxesAt(page, settled);
      assert.equal(marks.length, 3, 'ring, cross and arrow are drawn');
      assert.equal(labels.length, 2, 'both labels are shown');
      for (const [i, m] of marks.entries()) {
        for (const l of labels) {
          assert.ok(!intersects(m, l.rect), `${resolved.scenes[0].marks[i].type} covers label "${l.text}": ${JSON.stringify([m, l.rect])}`);
        }
      }
      await boxesAt(page, 0.1); // seek away and back: geometry comes from t alone
      assert.deepEqual((await boxesAt(page, settled)).marks, marks);
    } finally {
      await close();
    }
  });
}
