# Third-party notices

The code of this repository is MIT-licensed (see `LICENSE`). It builds on the software and assets below.
Nothing here is vendored: the packages are installed from npm and PyPI by `./install.sh`, and the speech
model is downloaded on first use.

## Installed by `./install.sh`

| Component | Licence | Used for |
|---|---|---|
| Phosphor Icons (`@phosphor-icons/core`) | MIT | the icons, drawn from its SVG files |
| IBM Plex Sans Thai (`@fontsource/ibm-plex-sans-thai`) | OFL-1.1 | the fallback typeface when Sukhumvit Set is absent |
| Playwright (`playwright`) | Apache-2.0 | a headless Chromium that draws each frame |
| faster-whisper | MIT | speech-to-text on the user's machine |
| Pillow | MIT-CMU | decoding, keying and re-encoding pictures |
| numpy | BSD-3-Clause | sound synthesis, picture maths |

Chromium itself is downloaded by Playwright under its own licences. The speech-to-text model weights
(Whisper `large-v3`, MIT) are downloaded by faster-whisper from the Hugging Face Hub the first time a
recording is transcribed.

## Not bundled, run when the user asks

- OpenFilm (MIT, github.com/openfilm/openfilm): not part of this repository. When the user opens a finished
  reel for editing by hand, `npx` fetches it and runs it as OpenFilm Studio on the user's own computer.
- ffmpeg and ffprobe: a system requirement, not bundled.
- Codex CLI, Antigravity CLI, Gemini CLI: the image tool the user chooses; each is installed and signed in
  by the user under its own terms. None is bundled.

## Not included

- **Sukhumvit Set** is not included and is never copied. It ships with macOS and is used from the
  system when present. Without it the skill uses IBM Plex Sans Thai and says so.
- No third-party logo, brand mark, texture file or sound recording is in this repository.

## Assets in this repository

| Asset | Where | Origin and licence |
|---|---|---|
| Example sprites | `skills/paim-reel/examples/etf-vs-stock/gen/sprites/*.png` | drawn with an image model for this project; MIT |
| Example photo "Wicker Basket Containing Clay Coins" | `skills/paim-reel/examples/etf-vs-stock/gen/photos/woven-basket.jpg` | Gary Todd, via Wikimedia Commons, CC0 1.0 Universal Public Domain Dedication. Page: https://commons.wikimedia.org/wiki/File:Wicker_Basket_Containing_Clay_Coins_(10112682876).jpg . The file was scaled and re-encoded by `scripts/fetch_photo.py`. Its record is `gen/photos/credits.json` in the same folder |
| Sound effects | `skills/paim-reel/assets/sfx/*.wav` | synthesised by `skills/paim-reel/scripts/make_sfx.py` from sine waves and seeded noise; part of this project, MIT |
| Paper texture and torn edges | not a file | generated at render time by `skills/paim-reel/engine/paper.mjs`; part of this project, MIT |

## Photos found by the agent

A photo the agent fetches for a reel is saved only in that reel's project folder, never in this repository,
with its source, licence text (or `unknown`) and credit in `gen/photos/credits.json`. The licence of such a
photo is the licence its source page states; a photo whose page states none may be copyrighted.
