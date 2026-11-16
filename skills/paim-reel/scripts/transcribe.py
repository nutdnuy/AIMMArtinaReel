"""Transcribe <project>/voice/voice.wav into voice/words.json, locally.

  transcribe.py <project>

Writes voice/words.json ({duration, words:[{w, t0, t1}]}). When script.md does not
exist yet, also writes script.draft.md with one `lNN:` line per recognised segment.
Model: env PAIM_WHISPER_MODEL, default large-v3 (CPU, int8, Thai).

The audio is cut at silences into chunks and each chunk is transcribed on its own: one
long call can fall into a repetition loop on a Thai take, and a short chunk cannot loop for long.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

import numpy as np

SR = 16000
FRAME = 0.02
SILENCE_RMS = 0.02      # about -34 dBFS
MIN_SILENCE = 0.25
MAX_CHUNK = 30.0        # a whisper window; past this a cut is forced at the quietest frame
DEFAULT_MODEL = "large-v3"


def chunk_bounds(samples: np.ndarray, sr: int = SR, min_chunk: float = 12.0) -> list[float]:
    """Chunk boundaries in seconds, from 0.0 to the end of the audio.

    Each chunk is at least `min_chunk` long and ends in the middle of a silence. If no
    silence turns up within MAX_CHUNK, the cut goes at the quietest frame instead. A last
    chunk shorter than half of `min_chunk` is folded into the previous one.
    """
    total = len(samples) / sr
    hop = max(1, int(FRAME * sr))
    n = len(samples) // hop
    if n == 0:
        return [0.0, round(total, 3)]
    frames = samples[: n * hop].astype("float64").reshape(n, hop)
    rms = np.sqrt((frames ** 2).mean(axis=1))
    quiet = rms < SILENCE_RMS

    # silent runs as (start_s, end_s)
    runs, start = [], None
    for i, q in enumerate(quiet):
        if q and start is None:
            start = i
        elif not q and start is not None:
            runs.append((start * hop / sr, i * hop / sr))
            start = None
    if start is not None:
        runs.append((start * hop / sr, n * hop / sr))
    runs = [r for r in runs if r[1] - r[0] >= MIN_SILENCE]

    bounds = [0.0]
    min_tail = min_chunk / 2
    while total - bounds[-1] > min_chunk + min_tail:
        last = bounds[-1]
        cut = next((m for m in ((a + b) / 2 for a, b in runs)
                    if m >= last + min_chunk and m - last <= MAX_CHUNK), None)
        if cut is None:
            if total - last <= MAX_CHUNK:
                break
            lo, hi = int((last + min_chunk) / FRAME), int((last + MAX_CHUNK) / FRAME)
            cut = (lo + int(np.argmin(rms[lo:hi]))) * FRAME
        if total - cut < min_tail:
            break
        bounds.append(round(cut, 3))
    bounds.append(round(total, 3))
    return bounds


def decode(path: Path) -> np.ndarray:
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-vn", "-ac", "1", "-ar", str(SR),
                        "-f", "f32le", "-"], capture_output=True)
    if r.returncode != 0:
        raise RuntimeError(f"ffmpeg could not decode {path}: {r.stderr.decode(errors='replace').strip()}")
    return np.frombuffer(r.stdout, dtype="<f4").copy()


def transcribe(samples: np.ndarray, model_name: str):
    """Return (words, segments): words [{w,t0,t1}], segments [text], times in seconds."""
    from faster_whisper import WhisperModel   # imported late: loading it is slow and tests of chunk_bounds do not need it

    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    bounds = chunk_bounds(samples)
    duration = len(samples) / SR
    words, segments, floor = [], [], 0.0
    for a, b in zip(bounds, bounds[1:]):
        seg_iter, _ = model.transcribe(
            samples[int(a * SR):int(b * SR)], language="th", word_timestamps=True,
            vad_filter=True, condition_on_previous_text=False,
            temperature=[0.0, 0.2, 0.4], no_repeat_ngram_size=4)
        for seg in seg_iter:
            text = " ".join(seg.text.split())
            if text:
                segments.append(text)
            for w in seg.words or []:
                token = w.word.strip()
                if not token:
                    continue
                t0 = min(max(a + w.start, floor), duration)
                t1 = min(max(a + w.end, t0), duration)
                words.append({"w": token, "t0": round(t0, 3), "t1": round(t1, 3)})
                floor = t0
    return words, segments, duration


def main(argv) -> int:
    if len(argv) != 2:
        print("usage: transcribe.py <project>", file=sys.stderr)
        return 1
    project = Path(argv[1])
    wav = project / "voice" / "voice.wav"
    if not wav.is_file():
        print(f"missing {wav}; run prep_voice.py first", file=sys.stderr)
        return 1
    try:
        samples = decode(wav)
    except RuntimeError as e:
        print(str(e), file=sys.stderr)
        return 2
    words, segments, duration = transcribe(samples, os.environ.get("PAIM_WHISPER_MODEL", DEFAULT_MODEL))
    if not words:
        print("no speech recognised in the recording", file=sys.stderr)
        return 2
    (project / "voice" / "words.json").write_text(
        json.dumps({"duration": round(duration, 3), "words": words}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8")
    if not (project / "script.md").exists():
        (project / "script.draft.md").write_text(
            "".join(f"l{i:02d}: {s}\n" for i, s in enumerate(segments, 1)), encoding="utf-8")
    print(f"{len(words)} words, {len(segments)} segments, {duration:.1f} s")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
