// Pure motion functions: every value is a function of time alone, so any frame can be drawn
// in any order. Plain ES module: loaded by Node and by the browser page.

export const ENTER_DUR = 0.40;
export const EXIT_DUR = 0.20;
export const NUMBER_DUR = 0.8;
const BAR_DUR = 0.6;
const OPAQUE_AT = 0.4; // entrance progress at which opacity reaches 1
const SNAP = 1e-9; // frame times like k/30 carry float noise; snap it at the ends

const TAU = 2 * Math.PI;
const clean = (x) => (x === 0 ? 0 : x); // turns -0 into 0
const easeOutCubic = (p) => (p <= 0 ? 0 : p >= 1 ? 1 : 1 - (1 - p) ** 3);
const smoothstep = (p) => (p <= 0 ? 0 : p >= 1 ? 1 : p * p * (3 - 2 * p));

// Back-out easing: overshoots past 1 before settling.
function easeOutBack(p) {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (p - 1) ** 3 + c1 * (p - 1) ** 2;
}

// Start offsets in px for the entrances that move.
const OFFSETS = Object.freeze({
  drop: { dx: 0, dy: -420 },
  'slide-l': { dx: -520, dy: 0 },
  'slide-r': { dx: 520, dy: 0 },
  rise: { dx: 0, dy: 260 },
});

// How far t is through [t0, t0 + dur], clamped to 0..1.
export function progress(t, t0, dur) {
  if (dur <= 0) return t >= t0 ? 1 : 0;
  const p = (t - t0) / dur;
  if (p <= SNAP) return 0;
  if (p >= 1 - SNAP) return 1;
  return p;
}

// Entrance at progress p (0..1). Every kind ends at identity.
export function enterState(kind, p) {
  const opacity = Math.min(1, Math.max(0, p) / OPAQUE_AT);
  const state = { opacity, dx: 0, dy: 0, scale: 1, rot: 0 };
  if (kind === 'pop') {
    state.scale = easeOutBack(p);
  } else if (Object.hasOwn(OFFSETS, kind)) {
    const left = 1 - easeOutCubic(p);
    state.dx = clean(OFFSETS[kind].dx * left);
    state.dy = clean(OFFSETS[kind].dy * left);
  } else if (kind !== 'fade') {
    throw new RangeError(`unknown enter "${kind}"`);
  }
  return state;
}

// Idle loop, `tSince` seconds after the item appeared; `seed` shifts the phase.
export function idleState(kind, tSince, seed) {
  const state = { dx: 0, dy: 0, scale: 1, rot: 0 };
  switch (kind) {
    case 'none': break;
    case 'bob': state.dy = 10 * Math.sin(TAU * tSince / 2.4 + seed); break;
    case 'sway': state.rot = 3 * Math.sin(TAU * tSince / 3.0 + seed); break;
    case 'pulse': state.scale = 1 + 0.04 * Math.sin(TAU * tSince / 1.6 + seed); break;
    default: throw new RangeError(`unknown idle "${kind}"`);
  }
  return state;
}

// Full state of an item at time t: entrance, idle (faded in over the entrance so it
// never jumps) and exit fade. `rot` is in degrees.
export function itemState(item, t) {
  const exiting = item.exitT === undefined ? 0 : progress(t, item.exitT, EXIT_DUR);
  if (t < item.t || exiting >= 1) {
    return { visible: false, opacity: 0, dx: 0, dy: 0, scale: 1, rot: 0 };
  }
  const p = progress(t, item.t, ENTER_DUR);
  const e = enterState(item.enter, p);
  const i = idleState(item.idle, t - item.t, item.seed);
  const w = smoothstep(p);
  return {
    visible: true,
    opacity: e.opacity * (1 - exiting),
    dx: clean(e.dx + w * i.dx),
    dy: clean(e.dy + w * i.dy),
    scale: e.scale * (1 + w * (i.scale - 1)),
    rot: clean(e.rot + w * i.rot),
  };
}

// The number shown at time t: counts from `from` to `to` over 0.8 s starting at item.t.
export function numberAt(item, t) {
  const from = item.from ?? 0;
  const value = from + (item.to - from) * easeOutCubic(progress(t, item.t, NUMBER_DUR));
  let text = value.toFixed(item.decimals ?? 0);
  if (/^-0(\.0+)?$/.test(text)) text = text.slice(1);
  return `${item.prefix ?? ''}${text}${item.suffix ?? ''}`;
}

// Bar fill (0..value) at time t: grows over 0.6 s starting at item.t.
export function barAt(item, t) {
  return item.value * easeOutCubic(progress(t, item.t, BAR_DUR));
}
