# P.AIM Reel Skill — Design Spec

Date: 2026-11-16 · Status: implemented as version 1; section 13 lists what changed while building it

## 1. What it is

A public GitHub repository holding one agent skill, `paim-reel`, that turns a
finance topic or P.AIM's own recorded voice into a finished 9:16 short
explainer video in the P.AIM brand. It installs into Claude Code and Codex
from the same `SKILL.md`.

Working names (change freely before publishing): repository
`paim-reel-skill`, skill `paim-reel`.

## 2. Decisions taken with the owner (2026-11-16)

| Question | Decision |
|---|---|
| Entry points | Both: start from a topic, or start from a voice recording |
| Narration | P.AIM records the voice. No TTS, no API key |
| Visual style | Icon motion (reference B) |
| Agents | Claude Code and Codex |
| Illustrations | Sticker-style sprites drawn by a companion image CLI; Phosphor icons stay as the simple fallback (later also: web photos, section 13) |
| Companion CLI | Mandatory under Claude Code: Codex CLI (recommended), or the Google route (section 11), the user chooses. Its only job is drawing illustrations |
| Onboarding | The skill walks P.AIM through a first-run setup, in Thai |

## 3. References

- A — The Economist, "How do banks actually create money?" (60 s, 1080×1920):
  cut-out collage on off-white, one accent circle, sentence captions.
  `https://www.youtube.com/shorts/5HszJ9VqI8g`. Used for pacing and tone only.
- B — Stock Market Simplified, "ETFs vs. Stocks EXPLAINED In 30 Seconds"
  (27 s, 1080×1920): faint grid background, a few large icons that pop, slide
  and regroup, one or two bold caption words at a time, a top/bottom "versus"
  split. `https://www.youtube.com/shorts/AOM2zGm30hU`. This is the visual model.

Reference B shows real company logos and Apple emoji. The skill does not:
both are third-party marks. It uses generated sprites of generic objects and
open-licence icons.

## 4. Brand

| Token | Value | Role |
|---|---|---|
| orange | `#F5820B` | main brand energy: key subject, highlight pill, headline pill |
| green | `#14856D` | growth, follow, trust: positive values, end card |
| charcoal | `#252B31` | main text |
| cream | `#FFFAF0` | soft background |

Fonts: Sukhumvit Set Bold for headlines and captions; Sukhumvit Set Regular
(the face macOS names "Text", weight 400) for body text.

Measured contrast (WCAG): charcoal/cream 13.7, charcoal/orange 5.5,
cream/green 4.4, green/charcoal 3.1, orange/cream 2.5. So text may only use
these pairs (text colour on background): charcoal on cream, charcoal on
orange, cream on charcoal, cream on green. Orange text on cream is not
allowed; an orange highlight is an orange pill behind charcoal text. Icons and
shapes are graphics and may use any brand colour on cream or charcoal.

Sukhumvit Set ships with macOS (`/System/Library/Fonts/Supplemental/SukhumvitSet.ttc`)
and is not redistributable. The repository never contains its files. On a
machine without it the skill uses IBM Plex Sans Thai (OFL-1.1, installed from
npm) and says so in its report.

No logo or channel handle was supplied. `brand.json` carries `handle` and
`logo` (both empty by default); the end card shows them when set.

## 5. Workflow

One project folder per reel, never inside the skill folder.

**Topic mode** (no audio yet)
1. Agent writes `brief.md` and `script.md` (8–14 spoken lines, 30–60 s).
2. Estimated timing → story → draft MP4 with sound effects and no voice, stamped `DRAFT · ยังไม่มีเสียงพูด`.
3. Agent hands P.AIM the read-aloud script and the draft. P.AIM records.
4. Continues in voice mode with the same `script.md` and `story.json`.

**Voice mode** (audio file given)
1. Clean the take: mono 48 kHz, 0.25 s lead-in, any pause longer than 0.45 s
   shortened to 0.45 s, trailing silence trimmed to 0.15 s, −14 LUFS, true peak
   ≤ −1 dBFS.
2. Transcribe locally (faster-whisper) for word times.
3. If no `script.md` exists, the agent corrects the draft transcript into
   `script.proposed.md` (spelling and phrase spacing only; never changes what
   was said; a word it cannot read is written `[?]`, never guessed), shows it
   to the user and stops. `script.md` is written only after the user confirms
   or fixes it, and the timing step refuses a script that still holds `[?]`.
4. Align script text to word times. Captions use the script's spelling and
   the recogniser's timing.
5. Sprites: the agent lists the objects the story needs; the image CLI draws
   them; they are keyed to transparency.
6. Story → build → check → stills → render → deliver MP4 and a 720p preview.

A story is anchored to script lines and phrases (`l05@2`), not to seconds, so
the story written for the draft is re-timed, unchanged, when the voice arrives.

## 6. Output

- `renders/<slug>.mp4`: 1080×1920, 30 fps, H.264 yuv420p, AAC 48 kHz.
- `renders/<slug>-preview.mp4`: 720×1280.
- Draft (estimated timing, no voice): `renders/<slug>-draft.mp4`.
- Length: voice duration + 2.0 s end card.

## 7. Picture rules

- Handmade-paper background, in cream or charcoal, with an optional torn-paper frame; `charcoal` scenes for contrast beats.
- Layouts: `center`, `row`, `stack`, `versus` (top/bottom split), `grid`.
- Items: `sprite`, `photo`, `icon`, `pill`, `number`, `bar`. Marks: `arrow`, `ring`, `cross`.
- Enter: `pop`, `drop`, `slide-l`, `slide-r`, `rise`, `fade`. Idle: `none`,
  `bob`, `sway`, `pulse`.
- Captions: one phrase at a time, Bold 84 px, at most 14 Thai base characters.
- Something new on screen at least every 3.0 s.
- All text inside x 70–1010, y 220–1500, and outside the phone-button column
  (x ≥ 930, y ≥ 1000).
- Every `number` item carries a `source`. No source, no number on screen.
- Icons: Phosphor (MIT). Names ending in `-logo` are refused.

## 8. Content rules

Educational finance content: no promise of returns, no individual investment
advice, on-screen figures fact-checked and sourced. `brand.json.disclaimer`
(empty by default) is shown on the end card when set.

## 9. Not in version 1

AI voice, AI-generated backgrounds or whole scenes, AI video, the collage look of reference A, bundled
music (a user-supplied music file is supported at a fixed low level; sound
effects were added during the build, section 13), cutting stutters or false
starts out of a take, horizontal video, a Claude Code plugin manifest, Windows
testing, an OpenFilm hand-off for a draft.

## 10. Requirements on the user's machine

Node ≥ 20 (22.2 or newer to open OpenFilm Studio), Python 3.10–3.12, ffmpeg,
about 3 GB of disk for the speech model on first transcription. Under Claude
Code: an image tool, installed and signed in by the user (Codex CLI is the
tested route). macOS is the tested platform; `fetch_photo.py` needs macOS or
Linux.

## 11. Illustrations (companion image CLI)

Claude cannot draw. Under Claude Code the skill therefore requires one image
CLI and refuses to start a reel without it; the user picks which one during
onboarding. Under Codex the provider is Codex itself and nothing is asked.

| Provider | Command (verified 2026-11-16) | Sign-in |
|---|---|---|
| Codex CLI (`npm i -g @openai/codex`) | `codex exec --skip-git-repo-check -s workspace-write -C <dir> "<ask>"` | `codex login`, ChatGPT account |
| Gemini CLI (`npm i -g @google/gemini-cli`) | `gemini -p "<ask>" --yolo --skip-trust`, run in `<dir>` | first run of `gemini`; an organisation-paid Google account or an API key (the CLI itself refuses free personal accounts) |
| Antigravity CLI (`agy`), set as `image_cmd` | `agy --dangerously-skip-permissions -p "<ask>"`, run in `<dir>` | first run of `agy`, personal Google account |

`profile.image_cmd` (or env `PAIM_IMAGE_CMD`) replaces the command with any
tool that takes `-p PROMPT`, for example `agy`. Whether a given Gemini CLI
install can draw without an extra extension is not assumed: the onboarding
image test is the gate, and it says plainly when the chosen tool cannot draw.

Sprites are flat sticker illustrations in the four brand colours plus white,
one object each, on a flat magenta `#FF00FF` background that is keyed out
(green would remove brand green). No text, logos, brand marks or real people
in a sprite. A sprite well outside the palette is flagged for a second look.

Privacy, in four parts: the voice file and its speech-to-text stay on the
user's machine; the assistant the user chats with reads the script and
transcript text; only short object descriptions go to the image provider;
fact and photo searches go to the web. Quota exhaustion stops the run with a clear message;
it does not loop, and it falls back to icons only when P.AIM agrees.

## 12. Onboarding

The first time the skill runs (no finished profile), and whenever P.AIM asks
to set up again, the agent runs a guided setup before any reel work:

1. Welcome: what the skill makes, how long setup takes, what is needed.
2. Machine check, with each missing piece explained in plain Thai and
   installed only after a yes.
3. Under Claude Code: choose the picture helper (Codex or Gemini), install
   it, sign in (the user does this herself), and draw one test sticker.
4. Brand details: channel handle, logo file, disclaimer line, audience,
   tone, and where reels are kept.
5. A first clip: the bundled example rendered as a draft so she sees a result.
6. How to record the voice, and a one-page Thai cheat sheet.

Rules: Thai throughout, addressed to "พี่เอม" (changeable); one question at
a time; no jargon; every answer is saved as it is given, so an interrupted
setup resumes where it stopped; the agent never types or stores a password,
key or login code. Answers live in a profile file in the user's config
folder, outside the repository, and override the handle, logo and disclaimer
defaults in `brand.json`. Colours and fonts are not changed by onboarding.

## 13. Changes during implementation

Sections 1 to 12 were written before the build. This section records what the build changed; where a
statement above was simply wrong, it has been corrected in place.

**Corrections**

- Privacy: "voice recordings and scripts never leave the machine" was wrong as written, because the assistant
  reads the script text. The accurate statement is in section 11.
- Pauses: any pause longer than 0.45 s is shortened to 0.45 s (the spec said: over 0.60 s). One ffmpeg
  filter cannot express the two-threshold rule and the audible difference is at most 0.15 s per pause.
  Trailing silence is trimmed to 0.15 s.
- Voice mode with no script: the proposal file `script.proposed.md`, a confirmation stop, and `[?]` for any
  word that cannot be read. `timing.py` exits 2 while a `[?]` remains. A fresh agent had rewritten a script from the
  bundled example because it cannot hear the recording, which is why the stop exists.
- Image tools: the Gemini command carries `--skip-trust` (without it YOLO mode is switched off in a folder the
  CLI does not trust, and the image cannot be saved). Free and paid personal Google accounts are served by the
  Antigravity CLI, set as `image_cmd`; the plain Gemini CLI only for an organisation-paid account or an API key.
  Codex is the recommended route.
- Fonts and icons: the page receives `fallbackFontUrls` per weight, each with its Thai and Latin subsets (a single
  file made weight-400 text bold, and finance reels are full of digits and Latin tickers). Icons are keyed
  `name:weight` because the schema lets each item choose its weight.
- Drafts carry sound effects, and the on-frame banner reads `DRAFT · ยังไม่มีเสียงพูด`.

**Additions** (asked for while the plan was running)

- A handmade-paper look, painted at render time by `engine/paper.mjs`: mottling, fibres and flecks, with an
  optional torn-paper frame per scene. No texture file is used.
- Web photos: found by general web search (the owner's choice, made knowing that most web images are
  copyrighted), fetched by `fetch_photo.py` (HTTPS only, JPEG/PNG/WebP, re-encoded, never executed), shown as torn
  paper cards, every one recorded in `credits.json`. A photo with an unknown licence may be copyrighted; the
  delivery note lists it and it is used at the user's own decision.
- Generated sound effects: six sounds made by `scripts/make_sfx.py` and placed from the story, kept below the
  voice, with the final measured at about -14 LUFS and a true-peak limit.
- An OpenFilm hand-off: a finished reel (never a draft) is exported as an OpenFilm project and opened in OpenFilm
  Studio so it can be changed by hand. The skill's own renderer still makes the MP4.
- Larger layout geometry (pictures about 280-460 px), thousands separators on numbers (`group: false` to
  turn off), single-line pills, and `still.mjs --scenes` (one settled frame per scene).

**Acceptance actually run**

- Automated tests: Node and Python suites (counts in the README's status section).
- Fresh agents, given only the skill, made a reel end to end from a synthetic voice recording, including the
  confirmation stop; the latest such run also covered the sound effects and the OpenFilm hand-off. A topic-mode run
  was done up to the draft and the read-aloud sheet, before photos and the Studio hand-off existed.
- Not tested: the first-run setup with a real or simulated user, a real human voice recording, how the sound
  effects sound, the default `large-v3` speech model, the Codex install end to end, Windows. See
  `docs/known-issues.md`.
