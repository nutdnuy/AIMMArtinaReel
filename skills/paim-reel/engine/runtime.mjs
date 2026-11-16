// Browser runtime: draws any time t of a Resolved reel into a 1080x1920 stage.
// seek(t) sets every moving value from t alone (no CSS animation, timers, Date or
// Math.random), so frames can be drawn in any order and come out identical.
import { textColorOn } from './colors.mjs';
import { captionAt } from './captions.mjs';
import { W, H, HEADLINE, CAPTION } from './layout.mjs';
import { ENTER_DUR, enterState, itemState, progress, numberAt, barAt } from './motion.mjs';

const PRIMARY = 'Sukhumvit Set';
const FALLBACK = 'IBM Plex Sans Thai';
const SVG_NS = 'http://www.w3.org/2000/svg';
const MARK_DUR = 0.3;
const HIGHLIGHT_DUR = 0.12;
const FIT_STEP = 4; // px; text that does not fit its zone shrinks in these steps
const ARROW_GAP = 16; // px between an item's rect and the arrow
const ARROW_MIN = 90; // px; shorter arrows are lengthened around their midpoint
const ARROW_HEAD = 44;

const DATA = window.__PAIM_DATA;
const stage = document.getElementById('stage');
const images = []; // every <img>, so ready can wait for each to decode
let shown = []; // text drawn in the current frame: {kind, el, textOf?}
let view = null; // the built stage

// ---------- small DOM helpers

function el(tag, className, parent, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  parent.append(node);
  return node;
}

function svgEl(tag, attrs, parent) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.append(node);
  return node;
}

const colorVar = (name) => `var(--${name})`;
const display = (node, on) => { node.style.display = on ? '' : 'none'; };
const transformOf = (s) => `translate(${s.dx}px, ${s.dy}px) rotate(${s.rot}deg) scale(${s.scale})`;
const hasText = (v) => typeof v === 'string' && v.trim() !== '';

function place(node, rect) {
  Object.assign(node.style, {
    left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px`,
  });
}

const overflows = (box) => box.scrollHeight > box.clientHeight || box.scrollWidth > box.clientWidth;

// Neither the text nor its zone overflows. Call with no transform on the text: transforms
// count towards overflow.
const fitsZone = (text, zone) => () => !overflows(text) && !overflows(zone);

// An item's pill or chip fits when it also lies inside the art area the label leaves. A flex:none
// child taller than .art overflows it on both sides without making the item box overflow, so
// compare layout sizes directly (offset/client sizes ignore the item's transform).
const fitsArt = (text, art, box) => () => !overflows(text) && !overflows(box)
  && text.offsetHeight <= art.clientHeight && text.offsetWidth <= art.clientWidth;

// Largest font size from `max` down to `min` (in FIT_STEP steps) at which `fits()` holds.
// Returns false when even `min` does not fit.
function fitFont(text, fits, max, min) {
  let size = max;
  text.style.fontSize = `${size}px`;
  while (size > min && !fits()) {
    size -= FIT_STEP;
    text.style.fontSize = `${size}px`;
  }
  return fits();
}

// ---------- build: one DOM tree for the whole reel, made once

function iconNode(item) {
  const key = `${item.icon}:${item.weight ?? 'fill'}`;
  const source = DATA.icons?.[key];
  if (typeof source !== 'string') throw new Error(`__PAIM_DATA.icons has no SVG for "${key}"`);
  const svg = new DOMParser().parseFromString(source, 'image/svg+xml').documentElement;
  if (svg.localName !== 'svg') throw new Error(`icon "${item.icon}" is not an SVG`);
  const hex = DATA.brand.colors[item.color];
  svg.setAttribute('fill', hex);
  svg.style.color = hex;
  return document.importNode(svg, true);
}

function addImage(parent, className, src) {
  const img = el('img', className, parent);
  img.alt = '';
  img.decoding = 'sync';
  img.src = src;
  images.push(img);
  return img;
}

function buildItem(item, parent, textColor, side) {
  const box = el('div', `item ${item.type}-item${side ? ' side' : ''}`, parent);
  place(box, item.rect);
  const v = { item, box, texts: [], update: null, fit: null, opacity: 0 };
  switch (item.type) {
    case 'icon':
      el('div', 'art', box).append(iconNode(item));
      break;
    case 'sprite':
      addImage(el('div', 'art', box), '', `assets/sprites/${item.sprite}.png`);
      break;
    case 'pill': {
      const art = el('div', 'art', box);
      const pill = el('div', 'pill text', art, item.text);
      pill.style.background = colorVar(item.bg);
      pill.style.color = colorVar(textColorOn(item.bg));
      const entry = { kind: 'pill', el: pill, item: item.id, unfit: false };
      v.texts.push(entry);
      v.fit = () => { entry.unfit = !fitFont(pill, fitsArt(pill, art, box), 64, 32); };
      break;
    }
    case 'number': {
      // The figure sits on a chip of its colour, so the text is always an allowed pair.
      const art = el('div', 'art', box);
      const chip = el('div', 'number text', art);
      chip.style.background = colorVar(item.color);
      chip.style.color = colorVar(textColorOn(item.color));
      el('span', 'sizer', chip, numberAt(item, item.t));
      el('span', 'sizer', chip, numberAt(item, Infinity));
      const value = el('span', '', chip);
      const entry = { kind: 'number', el: chip, item: item.id, textOf: () => value.textContent, unfit: false };
      v.texts.push(entry);
      v.update = (t) => { value.textContent = numberAt(item, t); };
      v.fit = () => { entry.unfit = !fitFont(chip, fitsArt(chip, art, box), 140, 56); };
      break;
    }
    case 'bar': {
      // Tall rects grow the bar upwards, wide ones to the right.
      const upright = item.rect.h > item.rect.w;
      const track = el('div', upright ? 'track upright' : 'track', el('div', 'art', box));
      track.style.background = `color-mix(in srgb, ${colorVar(textColor)} 12%, transparent)`;
      const fill = el('div', 'fill', track);
      fill.style.background = colorVar(item.color);
      v.update = (t) => {
        fill.style[upright ? 'height' : 'width'] = `${barAt(item, t) * 100}%`;
      };
      break;
    }
    default:
      throw new Error(`unknown item type "${item.type}"`);
  }
  if (hasText(item.label)) {
    const label = el('div', 'label text', box, item.label);
    label.style.color = colorVar(textColor);
    v.texts.push({ kind: 'label', el: label, item: item.id });
  }
  return v;
}

const centre = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

// Where a ray from the rect's centre along the unit vector (ux, uy) leaves the rect.
function edgeAlong(r, ux, uy) {
  const sx = ux === 0 ? Infinity : r.w / 2 / Math.abs(ux);
  const sy = uy === 0 ? Infinity : r.h / 2 / Math.abs(uy);
  const s = Math.min(sx, sy);
  const c = centre(r);
  return { x: c.x + ux * s, y: c.y + uy * s };
}

// Arrow from rect a's edge to rect b's edge, or null when the rects share a centre.
function arrowPath(a, b) {
  const ca = centre(a);
  const cb = centre(b);
  const len = Math.hypot(cb.x - ca.x, cb.y - ca.y);
  if (len === 0) return null;
  const ux = (cb.x - ca.x) / len;
  const uy = (cb.y - ca.y) / len;
  const ea = edgeAlong(a, ux, uy);
  const eb = edgeAlong(b, -ux, -uy);
  let p0 = { x: ea.x + ux * ARROW_GAP, y: ea.y + uy * ARROW_GAP };
  let p1 = { x: eb.x - ux * ARROW_GAP, y: eb.y - uy * ARROW_GAP };
  if ((p1.x - p0.x) * ux + (p1.y - p0.y) * uy < ARROW_MIN) {
    const mid = { x: (ea.x + eb.x) / 2, y: (ea.y + eb.y) / 2 };
    p0 = { x: mid.x - ux * ARROW_MIN / 2, y: mid.y - uy * ARROW_MIN / 2 };
    p1 = { x: mid.x + ux * ARROW_MIN / 2, y: mid.y + uy * ARROW_MIN / 2 };
  }
  const wing = (sign) => {
    const a = Math.atan2(-uy, -ux) + sign * Math.PI / 6;
    return { x: p1.x + Math.cos(a) * ARROW_HEAD, y: p1.y + Math.sin(a) * ARROW_HEAD };
  };
  const [w1, w2] = [wing(1), wing(-1)];
  return {
    shaft: `M ${p0.x} ${p0.y} L ${p1.x} ${p1.y}`,
    head: `M ${w1.x} ${w1.y} L ${p1.x} ${p1.y} L ${w2.x} ${w2.y}`,
  };
}

// Full ellipse as two arcs, starting at the upper left like a hand-drawn ring.
function ringPath(r) {
  const c = centre(r);
  const rx = r.w / 2 + 16;
  const ry = r.h / 2 + 16;
  const at = (deg) => {
    const a = deg * Math.PI / 180;
    return `${c.x + rx * Math.cos(a)} ${c.y + ry * Math.sin(a)}`;
  };
  return `M ${at(-150)} A ${rx} ${ry} 0 0 1 ${at(30)} A ${rx} ${ry} 0 0 1 ${at(-150)}`;
}

function buildMark(mark, svg, byId, textColor) {
  const g = svgEl('g', {}, svg);
  const refs = (mark.type === 'arrow' ? [mark.from, mark.to] : [mark.on]).map((id) => byId.get(id));
  const strokes = []; // each draws on over its share [from, to] of MARK_DUR
  const stroke = (d, color, width, from, to) => {
    const node = svgEl('path', { d, pathLength: 1, 'stroke-width': width, 'stroke-dasharray': '1 1' }, g);
    node.style.stroke = colorVar(color);
    strokes.push({ node, from, to });
  };
  if (mark.type === 'arrow') {
    const path = arrowPath(refs[0].item.rect, refs[1].item.rect);
    if (path) {
      stroke(path.shaft, textColor, 14, 0, 0.75);
      stroke(path.head, textColor, 14, 0.75, 1);
    }
  } else if (mark.type === 'ring') {
    stroke(ringPath(refs[0].item.rect), 'orange', 12, 0, 1);
  } else if (mark.type === 'cross') {
    const r = refs[0].item.rect;
    const c = centre(r);
    const h = Math.min(r.w, r.h) * 0.35;
    stroke(`M ${c.x - h} ${c.y - h} L ${c.x + h} ${c.y + h}`, textColor, 16, 0, 0.5);
    stroke(`M ${c.x + h} ${c.y - h} L ${c.x - h} ${c.y + h}`, textColor, 16, 0.5, 1);
  } else {
    throw new Error(`unknown mark type "${mark.type}"`);
  }
  return { mark, g, refs, strokes };
}

// In the wide slots of versus and stack, a picture's label goes beside it rather than under it, so the
// picture keeps the slot's full height.
const SIDE_LAYOUTS = ['versus', 'stack'];
const sideLabel = (scene, item) => SIDE_LAYOUTS.includes(scene.layout) && ['sprite', 'icon'].includes(item.type)
  && hasText(item.label) && item.rect.w >= 1.8 * item.rect.h;

function buildScene(scene) {
  const root = el('div', 'scene', view.scenesLayer);
  const textColor = textColorOn(scene.bg);
  const items = scene.items.map((item) => buildItem(item, root, textColor, sideLabel(scene, item)));
  const byId = new Map(items.map((v) => [v.item.id, v]));
  let headline = null;
  if (scene.headline) {
    const zone = el('div', 'headline-zone', root);
    place(zone, HEADLINE);
    headline = { t: scene.headline.t, zone, pill: el('div', 'headline text', zone, scene.headline.text) };
  }
  const svg = svgEl('svg', { class: 'marks', width: W, height: H, viewBox: `0 0 ${W} ${H}` }, root);
  const marks = scene.marks.map((m) => buildMark(m, svg, byId, textColor));
  return { scene, root, items, headline, marks };
}

function buildEndCard(card) {
  const root = el('div', 'endcard', stage);
  const body = el('div', 'endcard-body', root);
  const follow = el('div', 'follow text', body, 'ติดตาม');
  const rest = [];
  const texts = [{ kind: 'endcard', el: follow }];
  if (hasText(card.handle)) {
    rest.push(el('div', 'handle text', body, card.handle));
    texts.push({ kind: 'endcard', el: rest[rest.length - 1] });
  }
  if (hasText(card.logo)) rest.push(addImage(body, 'logo', card.logo));
  if (hasText(card.disclaimer)) {
    rest.push(el('div', 'disclaimer text', body, card.disclaimer));
    texts.push({ kind: 'endcard', el: rest[rest.length - 1] });
  }
  return { card, root, follow, rest, texts };
}

function build(R) {
  const root = document.documentElement.style;
  for (const [name, hex] of Object.entries(DATA.brand.colors)) root.setProperty(`--${name}`, hex);
  if (DATA.forceFallback) root.setProperty('--font', `"${FALLBACK}", sans-serif`);

  view = { R, bg: el('div', 'bg', stage), scenesLayer: el('div', 'scene-layer', stage) };
  view.scenes = R.scenes.map(buildScene);
  view.captionZone = el('div', 'caption-zone', stage);
  place(view.captionZone, CAPTION);
  view.caption = el('div', 'caption text', view.captionZone);
  view.endCard = buildEndCard(R.endCard);
  if (R.estimated) el('div', 'text', el('div', 'draft', stage), 'DRAFT · ยังไม่มีเสียง');
}

// ---------- draw: everything below depends on t only

function drawItem(v, t) {
  const s = itemState(v.item, t);
  v.opacity = s.visible ? s.opacity : 0;
  display(v.box, s.visible);
  if (!s.visible) return;
  v.update?.(t);
  v.fit?.();
  v.box.style.opacity = String(s.opacity);
  v.box.style.transform = transformOf(s);
  shown.push(...v.texts);
}

function drawMark(m, t) {
  const opacity = Math.min(...m.refs.map((r) => r.opacity));
  const on = t >= m.mark.t && opacity > 0;
  display(m.g, on);
  if (!on) return;
  m.g.style.opacity = String(opacity);
  const p = progress(t, m.mark.t, MARK_DUR);
  for (const s of m.strokes) {
    const q = progress(p, s.from, s.to - s.from);
    s.node.style.visibility = q > 0 ? 'visible' : 'hidden'; // a zero-length dash would still show a round cap
    s.node.style.strokeDashoffset = String(1 - q);
  }
}

function drawScene(sv, t) {
  for (const v of sv.items) drawItem(v, t);
  const h = sv.headline;
  if (h) {
    const on = t >= h.t;
    display(h.zone, on);
    if (on) {
      h.pill.style.transform = 'none';
      fitFont(h.pill, fitsZone(h.pill, h.zone), 96, 56);
      const s = enterState('pop', progress(t, h.t, ENTER_DUR));
      h.pill.style.opacity = String(s.opacity);
      h.pill.style.transform = transformOf(s);
      shown.push({ kind: 'headline', el: h.pill });
    }
  }
  for (const m of sv.marks) drawMark(m, t);
}

function drawCaption(cap, bg, t) {
  const { captionZone: zone, caption } = view;
  display(zone, cap !== null);
  if (cap === null) return;
  caption.textContent = cap.text;
  caption.classList.toggle('hl', cap.highlight);
  caption.style.color = cap.highlight ? '' : colorVar(textColorOn(bg));
  caption.style.transform = 'none';
  fitFont(caption, fitsZone(caption, zone), 84, 52);
  const scale = cap.highlight ? 0.92 + 0.08 * progress(t, cap.t0, HIGHLIGHT_DUR) : 1;
  caption.style.transform = `scale(${scale})`;
  shown.push({ kind: 'caption', el: caption });
}

function drawEndCard(on, t) {
  const e = view.endCard;
  display(e.root, on);
  if (!on) return;
  const p = progress(t, e.card.t0, ENTER_DUR);
  const s = enterState('pop', p);
  e.follow.style.opacity = String(s.opacity);
  e.follow.style.transform = transformOf(s);
  const fade = String(enterState('fade', p).opacity);
  for (const node of e.rest) node.style.opacity = fade;
  shown.push(...e.texts);
}

function seek(time) {
  if (!view) throw new Error('the reel is not built yet: await window.__paim.ready first');
  const { R } = view;
  const t = Math.min(Math.max(Number(time) || 0, 0), R.duration);
  shown = [];
  const ending = t >= R.endCard.t0;
  const current = ending
    ? null
    : view.scenes.find((sv) => t >= sv.scene.t0 && t < sv.scene.t1) ?? view.scenes[view.scenes.length - 1];
  for (const sv of view.scenes) display(sv.root, sv === current);
  view.bg.className = current ? `bg ${current.scene.bg}` : 'bg';
  if (current) drawScene(current, t);
  drawCaption(current ? captionAt(R.captions, t) : null, current?.scene.bg, t);
  drawEndCard(ending, t);
}

// ---------- page contract

function textBoxes() {
  const s = stage.getBoundingClientRect();
  return shown.map(({ kind, el: node, item, textOf, unfit }) => {
    const r = node.getBoundingClientRect();
    return {
      kind,
      item, // the id of the item the text belongs to (undefined for headline, caption and end card)
      text: textOf ? textOf() : node.textContent,
      rect: { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height },
      // `unfit`: an item's pill or chip that does not fit its art area even at the minimum size.
      clipped: node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth || unfit === true,
    };
  });
}

// Which family draws the text: a family that is present changes the width of a sample
// compared with plain monospace.
function fontUsed() {
  const ctx = document.createElement('canvas').getContext('2d');
  const sample = 'ทดสอบ ปั๊มน้ำ ผู้ถือหุ้น Wmi 0123';
  const width = (family) => {
    ctx.font = `700 64px ${family}`;
    return ctx.measureText(sample).width;
  };
  if (!DATA.forceFallback && width(`"${PRIMARY}", monospace`) !== width('monospace')) return PRIMARY;
  return FALLBACK;
}

// One FontFace per weight and subset, each from its own file with its unicode range:
// __PAIM_DATA.fallbackFontUrls {"400": [{url, unicodeRange}, ...], "700": [...]}.
async function loadFallbackFont() {
  const entries = DATA.fallbackFontUrls ?? {};
  const faces = ['400', '700'].flatMap((weight) => {
    const list = entries[weight];
    if (!Array.isArray(list) || list.length === 0) throw new Error(`__PAIM_DATA.fallbackFontUrls["${weight}"] is missing`);
    return list.map(({ url, unicodeRange }) => {
      if (!hasText(url)) throw new Error(`__PAIM_DATA.fallbackFontUrls["${weight}"] has an entry without a url`);
      const descriptors = hasText(unicodeRange) ? { weight, unicodeRange } : { weight };
      const face = new FontFace(FALLBACK, `url(${JSON.stringify(url)})`, descriptors);
      document.fonts.add(face);
      return face.load().catch(() => {
        throw new Error(`cannot load the fallback font ${url}`);
      });
    });
  });
  await Promise.all(faces);
}

async function start() {
  if (!DATA?.resolved) throw new Error('data.js did not set window.__PAIM_DATA');
  build(DATA.resolved);
  seek(0);
  await loadFallbackFont();
  await document.fonts.ready;
  await Promise.all(images.map((img) => img.decode().catch(() => {
    throw new Error(`cannot load image ${img.getAttribute('src')}`);
  })));
  seek(0);
}

window.__paim = {
  ready: start(),
  duration: DATA?.resolved?.duration ?? 0,
  seek,
  fontUsed,
  textBoxes,
};
