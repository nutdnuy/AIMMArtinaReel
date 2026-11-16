// Handmade-paper look: seeded shapes (pure, loaded by Node tests and the browser) and the painters that
// draw them once onto a canvas. Nothing here reads the clock or Math.random: the same seed always gives
// the same paper, so the texture is identical between frames and between page loads.

const TAU = Math.PI * 2;

// Mulberry32: a small seeded generator, uniform in [0, 1).
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a over the UTF-16 code units of `text`: a 32-bit unsigned seed.
export function hashSeed(text) {
  let h = 0x811C9DC5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Each generator draws from its own stream, so adding fibres never moves the flecks.
const stream = (seed, salt) => rng((seed ^ salt) >>> 0);
const between = (r, lo, hi) => lo + (hi - lo) * r();
const fixed = (v) => Math.round(v * 10) / 10;

// A torn edge around a w x h box: a closed SVG path whose points wander between the box edge and `rough`
// px inside it. The depth drifts slowly (the tear's long waves) and jumps a little at every step (its
// teeth); steps are 3 to 9 px.
export function tornPath(w, h, seed, rough = 14) {
  const r = stream(seed, 0x7EA2);
  const per = 2 * (w + h);
  const at = (s, d) => {
    if (s < w) return [s, d];
    if (s < w + h) return [w - d, s - w];
    if (s < 2 * w + h) return [w - (s - w - h), h - d];
    return [d, h - (s - 2 * w - h)];
  };
  let d = rough / 2;
  let target = rough / 2;
  const parts = [];
  for (let s = 0; s < per; s += between(r, 3, 9)) {
    if (r() < 0.08) target = between(r, rough * 0.15, rough * 0.9); // a new long wave
    d += (target - d) * 0.25 + (r() - 0.5) * rough * 0.45;
    d = Math.min(Math.max(d, 0), rough);
    const [x, y] = at(s, d);
    parts.push(`${parts.length ? 'L' : 'M'} ${fixed(Math.min(Math.max(x, 0), w))} ${fixed(Math.min(Math.max(y, 0), h))}`);
  }
  return `${parts.join(' ')} Z`;
}

export const FLECK_COUNT = 46;
export const FIBRE_COUNT = 260;
const FLECK_COLORS = ['orange', 'green', 'charcoal'];
const FLECK_GAP = 110; // px kept between fleck centres, so two never crowd one patch of paper

// Bits of petal and leaf pressed into the paper: 6 to 26 px long (mostly small), each with its own
// outline seed. Spread out at least FLECK_GAP apart where the canvas allows it.
export function flecks(seed, w, h) {
  const r = stream(seed, 0xF1EC);
  const list = [];
  for (let i = 0; i < FLECK_COUNT; i += 1) {
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 40; tries += 1) {
      x = between(r, 0, w);
      y = between(r, 0, h);
      if (list.every((f) => Math.hypot(f.x - x, f.y - y) >= FLECK_GAP)) break;
    }
    const len = 6 + 20 * r() ** 1.2;
    list.push({
      x: fixed(x),
      y: fixed(y),
      len: fixed(len),
      wid: fixed(len * between(r, 0.28, 0.6)),
      rot: fixed(between(r, 0, 360)),
      color: FLECK_COLORS[i % FLECK_COLORS.length],
      shape: Math.floor(r() * 2 ** 31),
    });
  }
  return list;
}

// Long pulp fibres: 40 to 220 px, 1 to 2 px wide, curved by `bend` (control-point offset as a share of
// the length), a little lighter (tone 1) or darker (tone -1) than the paper.
export function fibres(seed, w, h) {
  const r = stream(seed, 0xF1B2);
  return Array.from({ length: FIBRE_COUNT }, () => ({
    x: fixed(between(r, 0, w)),
    y: fixed(between(r, 0, h)),
    len: fixed(40 + 180 * r() ** 1.5),
    rot: fixed(between(r, 0, 360)),
    bend: Math.round(between(r, -0.25, 0.25) * 100) / 100,
    width: r() < 0.5 ? 1 : 2,
    tone: r() < 0.5 ? 1 : -1,
  }));
}

// ---------- mottling: soft lightness changes, as a share of full scale, clamped to +-MOTTLE

export const MOTTLE = 0.03;
// Broad clouds: [cell px, amplitude]. They move the mean of a patch, so they stay faint.
const CLOUDS = [[220, 0.007], [60, 0.004]];
// Pulp: [cell px, amplitude] of height fields drawn as relief (lit from the upper left). A slope
// averages out over a few cells, so the pulp shows clearly without moving the mean of a patch.
const PULP = [[14, 0.012], [5, 0.010], [2.2, 0.006]];

// One octave of smoothly interpolated value noise, w x h, in [-1, 1].
function octave(r, cell, w, h) {
  const cols = Math.ceil(w / cell) + 2;
  const g = new Float32Array(cols * (Math.ceil(h / cell) + 2));
  for (let i = 0; i < g.length; i += 1) g[i] = r() * 2 - 1;
  const ix = new Int32Array(w);
  const fx = new Float32Array(w);
  for (let x = 0; x < w; x += 1) {
    const u = x / cell;
    ix[x] = Math.floor(u);
    fx[x] = smooth(u - ix[x]);
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    const v = y / cell;
    const iy = Math.floor(v);
    const fy = smooth(v - iy);
    const row0 = iy * cols;
    const row1 = row0 + cols;
    for (let x = 0, o = y * w; x < w; x += 1, o += 1) {
      const i = ix[x];
      const a = g[row0 + i] + (g[row0 + i + 1] - g[row0 + i]) * fx[x];
      const b = g[row1 + i] + (g[row1 + i + 1] - g[row1 + i]) * fx[x];
      out[o] = a + (b - a) * fy;
    }
  }
  return out;
}

const smooth = (t) => t * t * (3 - 2 * t);

// One lightness offset per pixel (row by row), in [-MOTTLE, MOTTLE]: faint clouds plus pulp relief.
export function mottle(seed, w, h) {
  const r = stream(seed, 0x3077);
  const out = new Float32Array(w * h);
  for (const [cell, amp] of CLOUDS) {
    const n = octave(r, cell, w, h);
    for (let i = 0; i < n.length; i += 1) out[i] += amp * n[i];
  }
  for (const [cell, amp] of PULP) {
    const n = octave(r, cell, w, h);
    const gain = (amp * cell) / 3; // a slope of 1/cell per px, taken over 2 px, gives about amp
    for (let y = 2; y < h; y += 1) {
      for (let x = 2, o = y * w + 2; x < w; x += 1, o += 1) out[o] += gain * (n[o] - n[o - 2 * w - 2]);
    }
  }
  for (let i = 0; i < out.length; i += 1) out[i] = Math.min(MOTTLE, Math.max(-MOTTLE, out[i]));
  return out;
}

// ---------- painters (browser): they draw only on the context they are given

export const FIBRE_TONE = 0.06; // lightness change of a fibre, share of full scale
export const FLECK_ALPHA = 0.55;
const FLECK_MUTE = 0.15; // flecks are their ink mixed at least this far towards the paper: pressed petals
// The most a fleck may move the mean of a 40 x 40 patch, in levels: a big fleck is muted further, so a
// patch of paper stays within 10 levels of its colour with the mottling and fibres added.
const FLECK_PATCH_SHIFT = 5.5;
const PATCH_AREA = 40 * 40;

// How far a fleck's ink is mixed towards the paper so that the fleck keeps within FLECK_PATCH_SHIFT.
function fleckMute(f, ink, paper) {
  // The outline reaches 1.15 x the oval; the vein and up to two specks add a little.
  const area = (Math.PI / 4) * f.len * f.wid * 1.15 ** 2 + 0.7 * f.len + SPECKS * Math.PI * SPECK_R ** 2;
  const diff = Math.max(...ink.map((c, i) => Math.abs(c - paper[i])));
  const keep = (FLECK_PATCH_SHIFT * PATCH_AREA) / (area * FLECK_ALPHA * Math.max(diff, 1));
  return Math.max(FLECK_MUTE, 1 - keep);
}

const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const clamp8 = (v) => Math.min(255, Math.max(0, Math.round(v)));
const css = ([r, g, b]) => `rgb(${r}, ${g}, ${b})`;

// `rgb` with its HSL lightness moved by `by` (a share of full scale), hue and saturation kept: on cream a
// darker fibre turns a warmer, deeper cream, as a real one does, rather than grey.
function shift(rgb, by) {
  const [r, g, b] = rgb.map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  l = Math.min(1, Math.max(0, l + by));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const m = l - c / 2;
  const [r1, g1, b1] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h) % 6];
  return [r1, g1, b1].map((v) => clamp8((v + m) * 255));
}
const LUT_STEP = 0.0005; // mottling is looked up in lightness steps this fine
const mix = (a, b, k) => a.map((c, i) => clamp8(c + (b[i] - c) * k));

const SPECKS = 2; // at most, beside a petal: crumbs of the same flower
const SPECK_R = 2.5;

// A petal: an uneven oval along the x axis, len x wid, tapering at one end, with a vein in the ink's
// stronger shade and up to SPECKS crumbs beside it. `fill` is the petal's colour, `vein` the vein's.
function petal(ctx, f, fill, vein) {
  const r = rng(f.shape);
  ctx.fillStyle = fill;
  const n = 9;
  ctx.beginPath();
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * TAU;
    const k = between(r, 0.7, 1.15);
    const x = Math.cos(a) * (f.len / 2) * k;
    const y = Math.sin(a) * (f.wid / 2) * k * (Math.cos(a) > 0 ? between(r, 0.6, 1) : 1); // one end tapers
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = vein;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-f.len * 0.35, between(r, -1, 1));
  ctx.quadraticCurveTo(0, between(r, -0.2, 0.2) * f.wid, f.len * 0.35, between(r, -1, 1));
  ctx.stroke();
  const specks = Math.floor(r() * (SPECKS + 1));
  for (let i = 0; i < specks; i += 1) {
    ctx.beginPath();
    ctx.arc(between(r, -1.2, 1.2) * f.len, between(r, -1.2, 1.2) * f.len, between(r, 1, SPECK_R), 0, TAU);
    ctx.fill();
  }
}

// Paints a whole sheet of handmade paper of colour `base` (hex) onto ctx at 0,0: the mottling `field`
// (from mottle()), then fibres, then flecks in `inks` ({orange, green, charcoal} -> hex; pass a
// different hex for an ink that would vanish on this paper).
export function paintPaper(ctx, { w, h, seed, base, inks, field }) {
  const paper = rgbOf(base);
  const steps = Math.round(MOTTLE / LUT_STEP);
  const lut = Array.from({ length: 2 * steps + 1 }, (_, k) => shift(paper, (k - steps) * LUT_STEP));
  const img = ctx.createImageData(w, h);
  const px = img.data;
  for (let i = 0, p = 0; i < field.length; i += 1, p += 4) {
    const c = lut[Math.round(field[i] / LUT_STEP) + steps];
    px[p] = c[0];
    px[p + 1] = c[1];
    px[p + 2] = c[2];
    px[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  ctx.save();
  ctx.lineCap = 'round';
  for (const f of fibres(seed, w, h)) {
    const a = (f.rot * Math.PI) / 180;
    const [ux, uy] = [Math.cos(a), Math.sin(a)];
    const [ex, ey] = [f.x + ux * f.len, f.y + uy * f.len];
    const [cx, cy] = [(f.x + ex) / 2 - uy * f.bend * f.len, (f.y + ey) / 2 + ux * f.bend * f.len];
    // A raised fibre: its own tone, with a 1 px line of the other tone beside it (the light comes from
    // the upper left), so it reads as pressed into the paper rather than drawn on it.
    const line = (dx, dy, tone, width) => {
      ctx.strokeStyle = css(shift(paper, tone * FIBRE_TONE));
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(f.x + dx, f.y + dy);
      ctx.quadraticCurveTo(cx + dx, cy + dy, ex + dx, ey + dy);
      ctx.stroke();
    };
    const side = f.tone === 1 ? 1 : -1; // a light fibre's shadow falls below right, a dark one's light above left
    line(side, side, -f.tone, 1);
    line(0, 0, f.tone, f.width);
  }
  ctx.globalAlpha = FLECK_ALPHA;
  for (const f of flecks(seed, w, h)) {
    ctx.setTransform(1, 0, 0, 1, f.x, f.y);
    ctx.rotate((f.rot * Math.PI) / 180);
    const ink = rgbOf(inks[f.color]);
    const mute = fleckMute(f, ink, paper);
    petal(ctx, f, css(mix(ink, paper, mute)), css(mix(ink, paper, mute / 2)));
  }
  ctx.restore();
}

const FEATHER = 4; // px: how far the thinned margin of the tear reaches past the sheet's box

// The path of a tear around the box (x, y, bw, bh), in canvas px.
function tearAt(x, y, bw, bh, seed) {
  const p = new Path2D();
  p.addPath(new Path2D(tornPath(bw, bh, seed)), new DOMMatrix([1, 0, 0, 1, x, y]));
  return p;
}

// Paints `sheet` (a canvas of paper) torn to tornPath(w - 2 inset, h - 2 inset) over `backdrop` (another
// canvas): a soft shadow under the tear, a thinned, see-through margin where the paper was pulled apart
// (a second tear up to FEATHER px further out), and a few loose fibres standing out of it.
export function paintSheet(ctx, { w, h, seed, inset, backdrop, sheet, sheetColor }) {
  const iw = w - 2 * inset;
  const ih = h - 2 * inset;
  const edge = tearAt(inset, inset, iw, ih, seed);
  const margin = tearAt(inset - FEATHER, inset - FEATHER, iw + 2 * FEATHER, ih + 2 * FEATHER, seed ^ 0x5A5A);
  ctx.drawImage(backdrop, 0, 0);
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = sheetColor;
  ctx.fill(edge);
  ctx.restore();

  ctx.save();
  ctx.clip(margin);
  ctx.globalAlpha = 0.45;
  ctx.drawImage(sheet, 0, 0);
  ctx.restore();

  // Loose fibres at the tear: one point in four sends out a strand of paper, 3 to 10 px, at a slant.
  const r = stream(seed, 0xED6E);
  const pts = tornPath(iw, ih, seed).replace(/[MLZ]/g, ' ').trim().split(/\s+/).map(Number);
  ctx.save();
  ctx.strokeStyle = sheetColor;
  ctx.lineCap = 'round';
  for (let i = 0; i < pts.length; i += 2) {
    if (r() < 0.75) continue;
    const [x, y] = [pts[i] + inset, pts[i + 1] + inset];
    const out = [[-1, 0, x - inset], [1, 0, inset + iw - x], [0, -1, y - inset], [0, 1, inset + ih - y]]
      .reduce((a, b) => (b[2] < a[2] ? b : a)); // towards the nearest side of the sheet
    const a = Math.atan2(out[1], out[0]) + between(r, -1, 1);
    const len = between(r, 3, 10);
    ctx.globalAlpha = between(r, 0.3, 0.7);
    ctx.lineWidth = between(r, 0.7, 1.4);
    ctx.beginPath();
    ctx.moveTo(x - out[0] * 2, y - out[1] * 2);
    ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + between(r, -2, 2), y + Math.sin(a) * len * 0.5 + between(r, -2, 2),
      x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.clip(edge);
  ctx.drawImage(sheet, 0, 0);
  ctx.restore();
}
