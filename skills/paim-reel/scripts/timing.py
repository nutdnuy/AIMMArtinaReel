"""Build timing.json from script.md: estimated from text, or aligned to speech words.

  timing.py estimate <project>   script.md              -> timing.json
  timing.py align    <project>   script.md + voice/words.json -> timing.json

On success prints one line: "estimated 30.9 s, 12 lines" or
"aligned 65.7 s, match 0.86, lowest l07 0.75" (after any "LOW lNN ..." lines).
"""
import difflib
import hashlib
import json
import sys
import unicodedata
from pathlib import Path

from paim_script import ScriptError, base_len, long_tokens, parse_script

MIN_TOKEN_SEC = 0.04
MATCH_FAIL = 0.60
LOW_RATIO = 0.50
UNRESOLVED = "[?]"   # marks a word nobody has confirmed yet; never timed or shown


def _r(x: float) -> float:
    return round(x, 3)


def estimate(lines, char_sec=0.08, line_gap=0.30, lead_in=0.25) -> dict:
    """Timing from text length alone: tokens contiguous in a line, a gap between lines."""
    out = []
    t = lead_in
    for i, line in enumerate(lines):
        if i:
            t += line_gap
        tokens = []
        for tok in line["tokens"]:
            t0 = t
            t += base_len(tok) * char_sec
            tokens.append({"text": tok, "t0": _r(t0), "t1": _r(t)})
        out.append({"id": line["id"], "text": line["text"], "t0": tokens[0]["t0"],
                    "t1": tokens[-1]["t1"], "ratio": 1.0, "tokens": tokens})
    return {"estimated": True, "duration": _r(t + lead_in), "match": 1.0, "lines": out}


def _norm(s: str) -> str:
    """Lowercase; keep letters, digits and combining marks; drop whitespace and punctuation."""
    return "".join(ch for ch in s.lower() if unicodedata.category(ch)[0] in "LNM")


def _word_chars(words):
    """Normalised recogniser chars with (start, end) times spread evenly across each word."""
    chars, times = [], []
    for w in words:
        n = _norm(w["w"])
        if not n:
            continue
        t0, t1 = float(w["t0"]), float(w["t1"])
        step = (t1 - t0) / len(n)
        for k, ch in enumerate(n):
            chars.append(ch)
            times.append((t0 + k * step, t0 + (k + 1) * step))
    return "".join(chars), times


def align(lines, words, duration) -> dict:
    """Align script lines to recognised word times; see the task brief for the algorithm."""
    # S: script chars, each remembered with (line index, token index)
    s_chars, s_owner = [], []
    for li, line in enumerate(lines):
        for ti, tok in enumerate(line["tokens"]):
            for ch in _norm(tok):
                s_chars.append(ch)
                s_owner.append((li, ti))
    S = "".join(s_chars)
    R, r_times = _word_chars(words)

    n = len(S)
    span = [None] * n
    matched = [False] * n
    blocks = difflib.SequenceMatcher(None, S, R, autojunk=False).get_matching_blocks()
    for a, b, size in blocks:
        for k in range(size):
            span[a + k] = r_times[b + k]
            matched[a + k] = True

    # interpolate each run of unmatched chars between its matched neighbours
    i = 0
    while i < n:
        if matched[i]:
            i += 1
            continue
        j = i
        while j < n and not matched[j]:
            j += 1
        lo = span[i - 1][1] if i > 0 else 0.0
        hi = span[j][0] if j < n else float(duration)
        hi = max(hi, lo)
        step = (hi - lo) / (j - i)
        for k in range(i, j):
            span[k] = (lo + (k - i) * step, lo + (k - i + 1) * step)
        i = j

    # collect per-token and per-line spans and match counts
    tok_span = {}
    line_total = [0] * len(lines)
    line_hit = [0] * len(lines)
    for idx, owner in enumerate(s_owner):
        a, b = span[idx]
        lo, hi = tok_span.get(owner, (a, b))
        tok_span[owner] = (min(lo, a), max(hi, b))
        line_total[owner[0]] += 1
        line_hit[owner[0]] += matched[idx]

    dur = float(duration)
    prev_t0, prev_t1 = 0.0, 0.0
    out = []
    for li, line in enumerate(lines):
        tokens = []
        for ti, tok in enumerate(line["tokens"]):
            # a token with no letters (pure punctuation) sits where the previous one ended
            t0, t1 = tok_span.get((li, ti), (prev_t1, prev_t1))
            t0 = min(max(t0, prev_t0), dur - MIN_TOKEN_SEC)
            t1 = min(max(t1, t0 + MIN_TOKEN_SEC), dur)
            prev_t0, prev_t1 = t0, t1
            tokens.append({"text": tok, "t0": _r(t0), "t1": _r(t1)})
        ratio = line_hit[li] / line_total[li] if line_total[li] else 1.0
        out.append({"id": line["id"], "text": line["text"], "t0": tokens[0]["t0"],
                    "t1": tokens[-1]["t1"], "ratio": _r(ratio), "tokens": tokens})
    match = sum(matched) / n if n else 0.0
    return {"estimated": False, "duration": _r(dur), "match": _r(match), "lines": out}


def _fail(msg: str, code: int = 2):
    print(msg, file=sys.stderr)
    sys.exit(code)


def _load_lines(project: Path):
    script = project / "script.md"
    if not script.is_file():
        _fail(f"missing {script}", 1)
    try:
        lines = parse_script(script.read_text(encoding="utf-8"))
    except ScriptError as e:
        _fail(f"script.md: {e}")
    unresolved = [l["id"] for l in lines if any(UNRESOLVED in tok for tok in l["tokens"])]
    if unresolved:
        _fail(f"script.md still has {UNRESOLVED} in {', '.join(unresolved)}: "
              f"words the recogniser could not read. Ask the user to fill those words in, then run this again.")
    bad = long_tokens(lines)
    if bad:
        detail = "\n".join(f"  {lid}: {tok} ({base_len(tok)} chars)" for lid, tok in bad)
        _fail("tokens over 14 characters, add spaces to split them:\n" + detail)
    return lines


def main(argv) -> int:
    if len(argv) != 3 or argv[1] not in ("estimate", "align"):
        _fail("usage: timing.py estimate|align <project>", 1)
    mode, project = argv[1], Path(argv[2])
    lines = _load_lines(project)

    if mode == "estimate":
        timing = estimate(lines)
    else:
        words_path = project / "voice" / "words.json"
        if not words_path.is_file():
            _fail(f"missing {words_path}", 1)
        data = json.loads(words_path.read_text(encoding="utf-8"))
        timing = align(lines, data["words"], data["duration"])
        # Which take this timing belongs to: render.mjs refuses a voice file that has since been replaced.
        voice = project / "voice" / "voice.wav"
        if voice.is_file():
            timing["voice_sha256"] = hashlib.sha256(voice.read_bytes()).hexdigest()
        for line in timing["lines"]:
            if line["ratio"] < LOW_RATIO:
                print(f"LOW {line['id']} {line['ratio']:.2f} {line['text']}")
        if timing["match"] < MATCH_FAIL:
            _fail(f"script and voice do not match (match {timing['match']:.2f} < {MATCH_FAIL:.2f}); "
                  "check that this is the right recording")

    (project / "timing.json").write_text(
        json.dumps(timing, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if mode == "estimate":
        print(f"estimated {timing['duration']:.1f} s, {len(timing['lines'])} lines")
    else:
        low = min(timing["lines"], key=lambda line: line["ratio"])
        print(f"aligned {timing['duration']:.1f} s, match {timing['match']:.2f}, "
              f"lowest {low['id']} {low['ratio']:.2f}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
