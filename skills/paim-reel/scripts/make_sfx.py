"""Synthesise the six sound effects in assets/sfx/ from nothing but arithmetic.

  make_sfx.py [--out <dir>] [--check]

Writes pop, whoosh, tick, thud, paper and chime as mono, 48 kHz, 16-bit WAV files (peak -3 dBFS, 5 ms
fades). No recording, sample or library is used: every sample comes from sines, a seeded noise source
and FFT filtering, so the files carry this project's licence and are byte-for-byte reproducible.
The default folder is the one committed in the repository; this is a maintainer tool, the skill itself
never runs it.
--check writes nothing: it exits 1 and names each file that is missing or differs from a fresh synthesis.
"""
import argparse
import io
import sys
import wave
from pathlib import Path

import numpy as np

SR = 48000
PEAK_DB = -3.0
FADE_S = 0.005
DEFAULT_OUT = Path(__file__).resolve().parents[1] / "assets" / "sfx"
SEED = 20261116  # one seed for the whole set; each sound offsets it

_MASK64 = np.uint64(0xFFFFFFFFFFFFFFFF)


def noise(n, seed):
    """n values in [-1, 1) from a counter-based splitmix64 generator.

    Plain integer arithmetic, so the stream does not depend on the numpy version or the platform.
    """
    base = np.uint64((seed * 0xD1B54A32D192ED03) & 0xFFFFFFFFFFFFFFFF)  # Python ints: no overflow warning
    x = base + np.arange(n, dtype=np.uint64) * np.uint64(0x9E3779B97F4A7C15)
    x ^= x >> np.uint64(30)
    x = (x * np.uint64(0xBF58476D1CE4E5B9)) & _MASK64
    x ^= x >> np.uint64(27)
    x = (x * np.uint64(0x94D049BB133111EB)) & _MASK64
    x ^= x >> np.uint64(31)
    return (x >> np.uint64(11)).astype(np.float64) / float(1 << 52) - 1.0


def times(seconds):
    return np.arange(round(seconds * SR)) / SR


def band_limit(x, lo, hi, edge=0.3):
    """x through a smooth band-pass lo..hi Hz (raised-cosine edges, `edge` octaves wide), via the FFT."""
    spec = np.fft.rfft(x)
    f = np.maximum(np.fft.rfftfreq(len(x), 1 / SR), 1e-9)
    rise = np.clip((np.log2(f / lo) + edge / 2) / edge, 0, 1)
    fall = np.clip((np.log2(hi / f) + edge / 2) / edge, 0, 1)
    gain = (0.5 - 0.5 * np.cos(np.pi * rise)) * (0.5 - 0.5 * np.cos(np.pi * fall))
    return np.fft.irfft(spec * gain, len(x))


def low_pass(x, cutoff):
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(spec * np.exp(-((f / cutoff) ** 2)), len(x))


def pop():
    """A short pitched blip that slides down a little and dies fast."""
    t = times(0.12)
    freq = 560 + 440 * np.exp(-t / 0.018)
    phase = 2 * np.pi * np.cumsum(freq) / SR
    tone = np.sin(phase) + 0.18 * np.sin(2 * phase)
    return tone * (1 - np.exp(-t / 0.002)) * np.exp(-t / 0.028)


def whoosh():
    """Noise whose band sweeps up and back down, loudest in the middle."""
    n = round(0.35 * SR)
    frame, hop = 2048, 256
    window = np.hanning(frame)
    src = np.concatenate([np.zeros(frame), noise(n, SEED + 2), np.zeros(frame)])
    out = np.zeros_like(src)
    f = np.maximum(np.fft.rfftfreq(frame, 1 / SR), 1.0)
    for start in range(0, len(src) - frame, hop):
        centre = (start + frame / 2 - frame) / n  # 0..1 across the sound
        fc = 400 * np.exp(np.log(4.5) * np.sin(np.pi * min(max(centre, 0), 1)))
        gain = np.exp(-0.5 * (np.log2(f / fc) / 0.7) ** 2)
        out[start:start + frame] += np.fft.irfft(np.fft.rfft(src[start:start + frame] * window) * gain, frame) * window
    x = out[frame:frame + n]
    return x * np.sin(np.pi * np.arange(n) / n) ** 1.6


def tick():
    """A tiny, dry click: a few milliseconds of soft noise and a faint high ping."""
    t = times(0.05)
    click = band_limit(noise(len(t), SEED + 3), 1500, 5500) * np.exp(-t / 0.004)
    ping = 0.5 * np.sin(2 * np.pi * 2100 * t) * np.exp(-t / 0.006)
    return (click / np.abs(click).max() + ping) * (1 - np.exp(-t / 0.0005))


def thud():
    """A low soft knock: a sine falling from 190 to 90 Hz with a breath of low noise at the start."""
    t = times(0.25)
    freq = 90 + 100 * np.exp(-t / 0.045)
    phase = 2 * np.pi * np.cumsum(freq) / SR
    body = (np.sin(phase) + 0.3 * np.sin(2 * phase)) * np.exp(-t / 0.06)
    knock = low_pass(noise(len(t), SEED + 4), 700) * np.exp(-t / 0.012)
    return (body + 0.9 * knock / np.abs(knock).max()) * (1 - np.exp(-t / 0.002))


def paper():
    """A short rustle: band-limited noise under an envelope broken into grains."""
    n = round(0.40 * SR)
    t = times(0.40)
    hiss = band_limit(noise(n, SEED + 5), 900, 4500)
    grain = low_pass(noise(n, SEED + 6), 140) ** 2
    grain = np.clip(grain / np.percentile(grain, 99), 0, 1)
    shape = (1 - np.exp(-t / 0.02)) * np.exp(-t / 0.16)
    return hiss * shape * (0.15 + 0.85 * grain ** 0.6)


def chime():
    """Two gentle sine notes a fifth apart (660 and 990 Hz) with a long tail."""
    n = round(0.90 * SR)
    out = np.zeros(n)
    for start, freq, level in ((0.0, 660.0, 1.0), (0.14, 990.0, 0.8)):
        i0 = round(start * SR)
        t = np.arange(n - i0) / SR
        tone = np.sin(2 * np.pi * freq * t) + 0.12 * np.sin(2 * np.pi * 2 * freq * t)
        out[i0:] += level * tone * (1 - np.exp(-t / 0.004)) * np.exp(-t / 0.28)
    return out


SOUNDS = {"pop": pop, "whoosh": whoosh, "tick": tick, "thud": thud, "paper": paper, "chime": chime}


def finish(x):
    """No DC offset, 5 ms fades at both ends, peak at -3 dBFS, as 16-bit samples."""
    x = x - x.mean()
    fade = round(FADE_S * SR)
    ramp = 0.5 - 0.5 * np.cos(np.pi * np.arange(fade) / fade)
    x[:fade] *= ramp
    x[-fade:] *= ramp[::-1]
    x = x * (10 ** (PEAK_DB / 20) / np.abs(x).max())
    return np.round(x * 32767).astype("<i2")


def wav_bytes(samples):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(samples.astype("<i2").tobytes())
    return buf.getvalue()


def synthesise():
    """{file name: bytes of the WAV file} for the six sounds."""
    return {f"{name}.wav": wav_bytes(finish(make())) for name, make in SOUNDS.items()}


def main(argv=None):
    ap = argparse.ArgumentParser(description="Synthesise the sound effects.")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT, help="folder for the WAV files")
    ap.add_argument("--check", action="store_true", help="write nothing; exit 1 if the files in --out differ")
    args = ap.parse_args(argv)
    files = synthesise()
    if args.check:
        bad = [name for name, data in files.items()
               if not (args.out / name).is_file() or (args.out / name).read_bytes() != data]
        if bad:
            print(f"sfx: {', '.join(bad)} differ from a fresh synthesis (or are missing) in {args.out}", file=sys.stderr)
            return 1
        print(f"sfx: {len(files)} files match a fresh synthesis")
        return 0
    args.out.mkdir(parents=True, exist_ok=True)
    for name, data in files.items():
        (args.out / name).write_bytes(data)
        print(f"{args.out / name}  {len(data)} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
