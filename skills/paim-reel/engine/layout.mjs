// Canvas constants and slot geometry. Plain ES module: loaded by Node and by the browser page.
export const W = 1080;
export const H = 1920;
export const FPS = 30;
export const END_CARD = 2.0;

// Keep clear of the platform UI: SAFE is where text may sit, RIGHT_UI is the like/share column.
export const SAFE = Object.freeze({ x0: 70, y0: 220, x1: 1010, y1: 1500 });
export const RIGHT_UI = Object.freeze({ x0: 930, y0: 1000, x1: 1080, y1: 1920 });

export const HEADLINE = Object.freeze({ x: 90, y: 240, w: 900, h: 170 });
export const CONTENT = Object.freeze({ x: 90, y: 440, w: 900, h: 720 });
export const CAPTION = Object.freeze({ x: 180, y: 1250, w: 720, h: 230 });

// How many slotted items each layout holds.
export const CAPACITY = Object.freeze({ center: 1, row: 3, stack: 3, versus: 2, grid: 6 });

const MID_X = CONTENT.x + CONTENT.w / 2; // 540
const MID_Y = CONTENT.y + CONTENT.h / 2; // 800

// Centre a run of `total` px of the given length inside [start, start + span].
const centred = (start, span, total) => start + (span - total) / 2;

function rowRect(count, slot) {
  const gap = 30;
  const w = Math.min(400, (CONTENT.w - gap * (count - 1)) / count);
  const h = 460;
  const x0 = centred(CONTENT.x, CONTENT.w, count * w + gap * (count - 1));
  return { x: x0 + slot * (w + gap), y: MID_Y - h / 2, w, h };
}

function stackRect(count, slot) {
  const gap = 24;
  const w = 800;
  const h = Math.min(240, (CONTENT.h - gap * (count - 1)) / count);
  const y0 = centred(CONTENT.y, CONTENT.h, count * h + gap * (count - 1));
  return { x: MID_X - w / 2, y: y0 + slot * (h + gap), w, h };
}

function versusRect(slot) {
  const gap = 40;
  const w = 800;
  const h = (CONTENT.h - gap) / 2;
  return { x: MID_X - w / 2, y: CONTENT.y + slot * (h + gap), w, h };
}

// Two columns, filled left to right then downwards. Cell size is fixed, so a grid
// holding fewer items keeps its look; a lone item on the last row is centred.
function gridRect(count, slot) {
  const gap = 30;
  const w = (CONTENT.w - gap) / 2;
  const h = (CONTENT.h - 2 * gap) / 3;
  const rows = Math.ceil(count / 2);
  const y0 = centred(CONTENT.y, CONTENT.h, rows * h + (rows - 1) * gap);
  const col = slot % 2;
  const row = Math.floor(slot / 2);
  const lone = count % 2 === 1 && slot === count - 1;
  const x = lone ? centred(CONTENT.x, CONTENT.w, w) : CONTENT.x + col * (w + gap);
  return { x, y: y0 + row * (h + gap), w, h };
}

export function slotRect(layout, count, slot) {
  if (!Object.hasOwn(CAPACITY, layout)) throw new RangeError(`unknown layout "${layout}"`);
  if (!Number.isInteger(count) || count < 1 || count > CAPACITY[layout]) {
    throw new RangeError(`layout ${layout} holds 1 to ${CAPACITY[layout]} items, got ${count}`);
  }
  if (!Number.isInteger(slot) || slot < 0 || slot >= count) {
    throw new RangeError(`slot ${slot} is outside 0..${count - 1} for layout ${layout}`);
  }
  switch (layout) {
    case 'center': return { x: MID_X - 300, y: MID_Y - 300, w: 600, h: 600 };
    case 'row': return rowRect(count, slot);
    case 'stack': return stackRect(count, slot);
    case 'versus': return versusRect(slot);
    default: return gridRect(count, slot);
  }
}
