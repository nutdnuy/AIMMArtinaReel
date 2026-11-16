// Story schema: validation, anchor resolution and the Resolved structure the engine renders.
// Node only (icons are read from disk). Every problem is collected, then thrown once.
import { iconSvg, IconError } from './icons.mjs';
import { W, H, FPS, END_CARD, CAPACITY, slotRect } from '../engine/layout.mjs';
import { parseAnchor, buildCaptions } from '../engine/captions.mjs';

export class StoryError extends Error {
  constructor(problems) {
    super(`story has ${problems.length} problem${problems.length === 1 ? '' : 's'}:\n- ${problems.join('\n- ')}`);
    this.name = 'StoryError';
    this.problems = problems;
  }
}

const SLUG = /^[a-z0-9-]+$/;
const LINE_ID = /^l\d+$/;
const EPS = 1e-9;
const FREE_SIZE = 240;

const LAYOUTS = Object.keys(CAPACITY);
const SCENE_BGS = ['cream', 'charcoal'];
const FRAMES = ['orange', 'green', 'charcoal'];
const ITEM_TYPES = ['sprite', 'icon', 'photo', 'pill', 'number', 'bar'];
const ENTERS = ['pop', 'drop', 'slide-l', 'slide-r', 'rise', 'fade'];
const IDLES = ['none', 'bob', 'sway', 'pulse'];
const MARK_TYPES = ['arrow', 'ring', 'cross'];
const ICON_WEIGHTS = ['fill', 'duotone'];
const PILL_BGS = ['orange', 'green', 'charcoal'];
const TREATMENTS = ['mono', 'color'];

const round6 = (x) => Math.round(x * 1e6) / 1e6;
const round3 = (x) => Math.round(x * 1e3) / 1e3;
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isText = (v) => typeof v === 'string' && v.trim() !== '';
const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const list = (values) => values.join(', ');

// Seconds at which `anchor` points: "l05", "l05@2" or either with "+0.2" / "-0.1".
export function resolveAnchor(anchor, timing) {
  const a = parseAnchor(anchor);
  if (!a) {
    throw new Error(`invalid anchor ${JSON.stringify(anchor)}: expected l05, l05@2, optionally followed by +0.2 or -0.1 seconds`);
  }
  const line = timing.lines.find((l) => l.id === a.line);
  if (!line) throw new Error(`anchor ${anchor}: timing.json has no line ${a.line}`);
  let t = line.t0;
  if (a.phrase !== null) {
    const token = line.tokens[a.phrase];
    if (!token) {
      throw new Error(`anchor ${anchor}: line ${a.line} has ${line.tokens.length} phrases (0 to ${line.tokens.length - 1})`);
    }
    t = token.t0;
  }
  return round6(t + a.offset);
}

export function validateStory(story, timing, brand, assets = { sprites: [], photos: [] }) {
  const problems = [];
  const add = (where, message) => problems.push(where ? `${where}: ${message}` : message);
  if (!isObject(story)) throw new StoryError(['story must be a JSON object']);

  const colors = Object.keys(brand.colors);
  const voiceEnd = timing.duration;
  const sprites = new Set(assets.sprites ?? []);
  const photos = new Set(assets.photos ?? []);

  // The value if it is allowed (or absent and defaulted); otherwise record a problem and use the default.
  function pick(value, allowed, label, where, fallback) {
    if (value === undefined) return fallback;
    if (!allowed.includes(value)) {
      add(where, `${label} "${value}" is not allowed: use ${list(allowed)}`);
      return fallback;
    }
    return value;
  }

  // Seconds for an anchor, or null after recording why it does not resolve.
  function timeOf(anchor, where) {
    try {
      return resolveAnchor(anchor, timing);
    } catch (e) {
      add(where, e.message);
      return null;
    }
  }

  // ---- story level
  if (typeof story.slug !== 'string' || !SLUG.test(story.slug)) {
    add('', `slug ${JSON.stringify(story.slug)} must be lower-case letters, digits and "-" only`);
  }
  if (!isText(story.title)) add('', 'title must be a non-empty string');
  if (story.music !== undefined && story.music !== null && typeof story.music !== 'string') {
    add('', 'music must be a file path or null');
  }
  if (story.sfx !== undefined && typeof story.sfx !== 'boolean') {
    add('', `sfx must be true or false, got ${JSON.stringify(story.sfx)}`);
  }
  const highlight = [];
  if (story.highlight !== undefined) {
    if (!Array.isArray(story.highlight)) {
      add('', 'highlight must be a list of anchors');
    } else {
      story.highlight.forEach((anchor) => {
        if (timeOf(anchor, 'highlight') !== null) highlight.push(anchor);
      });
    }
  }

  const sceneList = Array.isArray(story.scenes) ? story.scenes : [];
  if (sceneList.length === 0) add('', 'scenes must be a non-empty list');

  // ---- scene start times, so each item can be checked against its scene's span
  const sceneIds = new Set();
  const labels = sceneList.map((sc, i) => (isObject(sc) && isText(sc.id) ? `scene "${sc.id}"` : `scene #${i + 1}`));
  const fromT = sceneList.map((sc, i) => {
    if (!isObject(sc)) {
      add(labels[i], 'must be an object');
      return null;
    }
    if (!isText(sc.id)) add(labels[i], 'id must be a non-empty string');
    else if (sceneIds.has(sc.id)) add(labels[i], `duplicate scene id "${sc.id}"`);
    else sceneIds.add(sc.id);
    if (typeof sc.from !== 'string' || !LINE_ID.test(sc.from)) {
      add(labels[i], `from must be a line id such as l01, got ${JSON.stringify(sc.from)}`);
      return null;
    }
    return timeOf(sc.from, `${labels[i]} from`);
  });
  const first = timing.lines[0]?.id;
  if (isObject(sceneList[0]) && typeof sceneList[0].from === 'string' && sceneList[0].from !== first) {
    add('', `the first scene must start from the first line (${first}), not ${sceneList[0].from}`);
  }
  fromT.forEach((t, i) => {
    if (i > 0 && t !== null && fromT[i - 1] !== null && t <= fromT[i - 1]) {
      add(labels[i], `starts at ${sceneList[i].from}, which is not after ${labels[i - 1]} (${sceneList[i - 1].from}): scenes must follow the script in order`);
    }
  });
  const starts = fromT.map((t, i) => (i === 0 ? 0 : t));
  const ends = starts.map((_, i) => (i + 1 < starts.length ? fromT[i + 1] : voiceEnd));

  // ---- scenes
  let seed = 0;
  const scenes = sceneList.map((sc, si) => {
    if (!isObject(sc)) return null;
    const label = labels[si];
    const t0 = starts[si];
    const t1 = ends[si] !== null && t0 !== null && ends[si] > t0 ? ends[si] : null;
    const layout = pick(sc.layout, LAYOUTS, 'layout', label, undefined);
    if (sc.layout === undefined) add(label, `layout is required: use ${list(LAYOUTS)}`);
    const bg = pick(sc.bg, SCENE_BGS, 'bg', label, 'cream');
    const frame = pick(sc.frame, FRAMES, 'frame', label, undefined);

    // Is time `t` inside this scene? Records a problem when it is not.
    function checkInside(t, where, what) {
      if (t === null || t0 === null) return;
      if (t < t0 - EPS || (t1 !== null && t >= t1 - EPS)) {
        add(where, `${what} (${t} s) is outside its scene (${t0} to ${t1 ?? 'the end'} s)`);
      }
    }

    let headline;
    if (sc.headline !== undefined) {
      if (!isObject(sc.headline) || !isText(sc.headline.text)) {
        add(label, 'headline needs a non-empty text');
      } else {
        const t = sc.headline.at === undefined ? t0 : timeOf(sc.headline.at, `${label} headline`);
        if (sc.headline.at !== undefined) checkInside(t, `${label} headline`, `headline at ${sc.headline.at}`);
        headline = { text: sc.headline.text, t };
      }
    }

    // Items: validate each, then give the ones without x/y a slot.
    const itemList = Array.isArray(sc.items) ? sc.items : [];
    if (!Array.isArray(sc.items)) add(label, 'items must be a list');
    const ids = new Set();
    const built = itemList.map((it, ii) => {
      if (!isObject(it)) {
        add(label, `item #${ii + 1} must be an object`);
        return null;
      }
      const where = `${label} item ${isText(it.id) ? `"${it.id}"` : `#${ii + 1}`}`;
      if (!isText(it.id)) add(where, 'id must be a non-empty string');
      else if (ids.has(it.id)) add(where, `duplicate item id "${it.id}"`);
      else ids.add(it.id);

      const type = pick(it.type, ITEM_TYPES, 'type', where, undefined);
      if (it.type === undefined) add(where, `type is required: use ${list(ITEM_TYPES)}`);
      const enter = pick(it.enter, ENTERS, 'enter', where, 'pop');
      const idle = pick(it.idle, IDLES, 'idle', where, 'none');

      let t = null;
      if (it.at === undefined) add(where, 'at is required (an anchor such as l01 or l01@2)');
      else {
        t = timeOf(it.at, `${where} at`);
        checkInside(t, where, `at ${it.at}`);
      }
      let exitT;
      if (it.exit !== undefined) {
        exitT = timeOf(it.exit, `${where} exit`);
        if (exitT !== null && t !== null && exitT <= t) {
          add(where, `exit ${it.exit} (${exitT} s) must come after the item appears (${t} s)`);
        }
      }

      const hasX = it.x !== undefined;
      const hasY = it.y !== undefined;
      let free = false;
      if (hasX !== hasY) add(where, 'x and y must be given together');
      else if (hasX) {
        if (!isNumber(it.x) || !isNumber(it.y)) add(where, 'x and y must be numbers');
        else free = true;
      }
      if (it.size !== undefined && !(isNumber(it.size) && it.size > 0)) add(where, 'size must be a positive number');
      if (it.slot !== undefined && !Number.isInteger(it.slot)) add(where, 'slot must be an integer');

      const extra = {};
      switch (type) {
        case 'sprite':
          if (typeof it.sprite !== 'string' || !SLUG.test(it.sprite)) {
            add(where, `sprite ${JSON.stringify(it.sprite)} must be lower-case letters, digits and "-" only`);
          } else if (!sprites.has(it.sprite)) {
            add(where, `sprite "${it.sprite}" has not been generated: run scripts/gen_sprites.py first (expects gen/sprites/${it.sprite}.png)`);
          }
          break;
        case 'photo':
          if (typeof it.photo !== 'string' || !SLUG.test(it.photo)) {
            add(where, `photo ${JSON.stringify(it.photo)} must be lower-case letters, digits and "-" only`);
          } else if (!photos.has(it.photo)) {
            add(where, `photo "${it.photo}" has not been fetched, or has no entry in gen/photos/credits.json: run scripts/fetch_photo.py first (expects gen/photos/${it.photo}.jpg)`);
          }
          extra.treatment = pick(it.treatment, TREATMENTS, 'treatment', where, 'mono');
          break;
        case 'icon': {
          extra.weight = pick(it.weight, ICON_WEIGHTS, 'weight', where, 'fill');
          try {
            iconSvg(it.icon, extra.weight);
          } catch (e) {
            if (!(e instanceof IconError)) throw e;
            add(where, e.message);
          }
          extra.color = pick(it.color, colors, 'color', where, undefined);
          if (it.color === undefined) add(where, `color is required: use ${list(colors)}`);
          break;
        }
        case 'pill':
          if (!isText(it.text)) add(where, 'pill needs a non-empty text');
          pick(it.bg, PILL_BGS, 'bg', where, undefined);
          if (it.bg === undefined) add(where, `bg is required: use ${list(PILL_BGS)}`);
          break;
        case 'number':
          if (!isNumber(it.to)) add(where, 'number needs a numeric "to"');
          extra.from = it.from === undefined ? 0 : it.from;
          if (!isNumber(extra.from)) add(where, 'from must be a number');
          extra.decimals = it.decimals === undefined ? 0 : it.decimals;
          if (!Number.isInteger(extra.decimals) || extra.decimals < 0 || extra.decimals > 6) {
            add(where, 'decimals must be an integer from 0 to 6');
          }
          extra.group = it.group === undefined ? true : it.group;
          if (typeof extra.group !== 'boolean') add(where, 'group must be true or false (thousands separators)');
          extra.prefix = it.prefix ?? '';
          extra.suffix = it.suffix ?? '';
          if (typeof extra.prefix !== 'string' || typeof extra.suffix !== 'string') {
            add(where, 'prefix and suffix must be strings');
          }
          pick(it.color, colors, 'color', where, undefined);
          if (it.color === undefined) add(where, `color is required: use ${list(colors)}`);
          if (!isText(it.source)) add(where, 'a number needs a source (where the figure comes from), none was given');
          break;
        case 'bar':
          if (!isNumber(it.value) || it.value < 0 || it.value > 1) {
            add(where, `bar value must be a number from 0 to 1, got ${JSON.stringify(it.value)}`);
          }
          pick(it.color, colors, 'color', where, undefined);
          if (it.color === undefined) add(where, `color is required: use ${list(colors)}`);
          break;
        default:
          break;
      }
      if (it.label !== undefined && typeof it.label !== 'string') add(where, 'label must be a string');

      const { at, exit, slot, x, y, size, ...rest } = it;
      const out = { ...rest, ...extra, t, enter, idle, seed: seed++ };
      if (exitT !== undefined) out.exitT = exitT;
      return { out, free, x, y, size, slot, where };
    });

    // Slots: only items without x/y count toward the layout's capacity.
    const slotted = built.filter((b) => b && !b.free);
    if (layout !== undefined) {
      if (slotted.length > CAPACITY[layout]) {
        add(label, `layout ${layout} holds at most ${CAPACITY[layout]} items, got ${slotted.length}`);
      } else {
        const owner = new Map(); // slot -> id of the item that holds it
        slotted.forEach((b, k) => {
          const s = b.slot ?? k;
          if (Number.isInteger(s) && (s < 0 || s >= slotted.length)) {
            add(b.where, `slot ${s} is outside 0..${slotted.length - 1} (${slotted.length} items in layout ${layout})`);
          } else if (Number.isInteger(s)) {
            if (owner.has(s)) add(label, `slot ${s} is used by both "${owner.get(s)}" and "${b.out.id}"`);
            else owner.set(s, b.out.id);
            b.out.rect = slotRect(layout, slotted.length, s);
          }
        });
      }
    }
    for (const b of built) {
      if (b?.free) {
        const side = isNumber(b.size) && b.size > 0 ? b.size : FREE_SIZE;
        b.out.rect = { x: b.x - side / 2, y: b.y - side / 2, w: side, h: side };
      }
    }

    // Marks
    const marks = [];
    if (sc.marks !== undefined && !Array.isArray(sc.marks)) add(label, 'marks must be a list');
    (Array.isArray(sc.marks) ? sc.marks : []).forEach((m, mi) => {
      const where = `${label} mark #${mi + 1}`;
      if (!isObject(m)) {
        add(where, 'must be an object');
        return;
      }
      const type = pick(m.type, MARK_TYPES, 'type', where, undefined);
      if (m.type === undefined) add(where, `type is required: use ${list(MARK_TYPES)}`);
      let t = null;
      if (m.at === undefined) add(where, 'at is required');
      else {
        t = timeOf(m.at, `${where} at`);
        checkInside(t, where, `at ${m.at}`);
      }
      const refs = type === 'arrow' ? ['from', 'to'] : type ? ['on'] : [];
      for (const key of refs) {
        if (!ids.has(m[key])) add(where, `${key} points at unknown item ${JSON.stringify(m[key])} (items in this scene: ${list([...ids])})`);
      }
      const out = { type, t };
      for (const key of refs) out[key] = m[key];
      marks.push(out);
    });

    const resolved = { id: sc.id, t0, t1: ends[si], layout, bg };
    if (frame) resolved.frame = frame;
    if (headline) resolved.headline = headline;
    resolved.items = built.filter(Boolean).map((b) => b.out);
    resolved.marks = marks;
    return resolved;
  });

  if (problems.length) throw new StoryError(problems);

  const bgAt = (t) => (scenes.find((s) => t >= s.t0 && t < s.t1) ?? scenes[scenes.length - 1]).bg;
  return {
    slug: story.slug,
    title: story.title,
    music: story.music ?? null,
    sfx: story.sfx ?? true,
    width: W,
    height: H,
    fps: FPS,
    duration: round3(voiceEnd + END_CARD),
    voiceEnd,
    estimated: timing.estimated,
    scenes,
    captions: buildCaptions(timing, highlight, bgAt),
    endCard: {
      t0: voiceEnd,
      t1: round3(voiceEnd + END_CARD),
      handle: brand.handle,
      logo: brand.logo,
      disclaimer: brand.disclaimer,
    },
  };
}
