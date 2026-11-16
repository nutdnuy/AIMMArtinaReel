// Captions from timing.json, and the anchor grammar they share with the story.
// Plain ES module: loaded by Node and by the browser page.

// Anchor: "l05" (line start), "l05@2" (0-based phrase index), either followed by "+0.2" / "-0.1" seconds.
const ANCHOR = /^(l\d+)(?:@(\d+))?(?:([+-])(\d+(?:\.\d+)?))?$/;

// Returns {line, phrase, offset} (phrase is null for a bare line), or null when `anchor` is malformed.
export function parseAnchor(anchor) {
  const m = typeof anchor === 'string' ? ANCHOR.exec(anchor) : null;
  if (!m) return null;
  return {
    line: m[1],
    phrase: m[2] === undefined ? null : Number(m[2]),
    offset: m[3] === undefined ? 0 : Number(m[3] + m[4]),
  };
}

export const CAPTION_TAIL = 0.40; // a line's last caption lingers this long after its speech ends

const round3 = (x) => Math.round(x * 1000) / 1000;

// One caption per token. `highlight` is a list of anchors; offsets are ignored, a bare
// line highlights its first phrase. `sceneBgAt(t)` gives the background colour name at time t.
export function buildCaptions(timing, highlight, sceneBgAt) {
  const marked = new Set();
  for (const anchor of highlight ?? []) {
    const a = parseAnchor(anchor);
    if (a) marked.add(`${a.line}@${a.phrase ?? 0}`);
  }
  const captions = [];
  timing.lines.forEach((line, li) => {
    const nextStart = li + 1 < timing.lines.length ? timing.lines[li + 1].t0 : timing.duration;
    line.tokens.forEach((tok, ti) => {
      const t1 = ti + 1 < line.tokens.length
        ? line.tokens[ti + 1].t0
        : Math.min(line.t1 + CAPTION_TAIL, nextStart);
      captions.push({
        t0: round3(tok.t0),
        t1: round3(t1),
        text: tok.text,
        highlight: marked.has(`${line.id}@${ti}`),
        bg: sceneBgAt(tok.t0),
      });
    });
  });
  return captions;
}

// The caption on screen at time t, or null (t0 inclusive, t1 exclusive).
export function captionAt(captions, t) {
  return captions.find((c) => t >= c.t0 && t < c.t1) ?? null;
}
