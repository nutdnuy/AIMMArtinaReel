# Sound effects

Six short sounds that `render.mjs` places on the reel where things happen on screen. All six are
made by this project's own code, `scripts/make_sfx.py`, from sine waves, seeded noise and FFT
filtering. No recording, sample, library or website was used, so they carry the project's own
licence (MIT, see the repository `LICENSE`).

| File | Length | What it is | Used for |
|---|---|---|---|
| `pop.wav` | 0.12 s | a short pitched blip that slides down and dies fast | an item that pops in |
| `whoosh.wav` | 0.35 s | soft noise whose band sweeps up and back down | an item that slides or rises in |
| `tick.wav` | 0.05 s | a tiny dry click | a mark (arrow, ring, cross); a number counting |
| `thud.wav` | 0.25 s | a low, soft knock | an item that drops in |
| `paper.wav` | 0.40 s | a short rustle of band-limited noise with a grainy envelope | a new scene; a photo card |
| `chime.wav` | 0.90 s | two gentle sine notes a fifth apart (660 and 990 Hz) with a long tail | the end card |

Format: mono, 48 kHz, 16-bit, peak -3 dBFS, 5 ms fades at both ends. Each file is under 90 KB.

The levels at which they sit under the voice, and when each one fires, are in `lib/sfx.mjs`
(`sfxEvents`); the rules are in `references/story-json.md`. `story.sfx: false` turns them all off.

## Making them again

```
<skill>/.venv/bin/python <skill>/scripts/make_sfx.py            # rewrites the six files here
<skill>/.venv/bin/python <skill>/scripts/make_sfx.py --check    # exit 1 if any file differs
```

The noise is a counter-based integer generator with a fixed seed, so a run gives the same bytes
every time. The test suite runs `--check`, so a changed file or a changed script fails the build
until the two agree.
