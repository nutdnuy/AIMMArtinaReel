---
name: paim-reel
description: Makes a 9:16 P.AIM-branded finance explainer reel (MP4 with Thai captions, sticker sprites and icon motion) from a finance topic or from P.AIM's own voice recording. Use when asked "ทำ reel เรื่อง…", "ทำคลิปจากเสียงนี้" (with an audio file), "make a P.AIM short about…", or for any P.AIM short video, clip or reel about investing or personal finance. From a topic it writes the script, renders a draft (sound effects, no voice yet) and asks for the recording; from a voice recording it times the captions to the voice and renders the finished video. Also runs P.AIM's first-time setup (ตั้งค่า) and changes a setting when she says "ตั้งค่าใหม่" or "set up again".
---

# paim-reel

Turn a finance topic, or P.AIM's recorded voice, into a 1080×1920 explainer reel in the P.AIM
brand: a few large stickers that pop and regroup on handmade paper, one bold caption phrase at a
time, a green end card.

`<skill>` is this skill's folder; run every script by its path (Python with
`<skill>/.venv/bin/python`, Node with `node`). `<project>` is the reel's folder. Scripts never
write into the skill folder (`image_cli.py test` writes under the user's config folder).

Read: `references/script-style.md` (script, facts, read-aloud sheet), `references/story-json.md`
(story, `check.mjs` findings, dead beats), `references/brand.md` (colours, type, zones, never on
screen). The bundled `examples/` show the format only: they are never a source for what P.AIM
said or for facts.

## 0. Check the machine

`<skill>/scripts/doctor.sh --agent claude` under Claude Code, `--agent codex` under Codex.

- Exit 0: go on. Note the `font:` line for the delivery note.
- `onboarding: needed` or `MISSING image-cli …`: read `references/onboarding.md` and do that
  setup with her before any reel work (it resumes an interrupted setup and fixes the other
  `MISSING` lines too).
- Any other `MISSING …`: stop, tell P.AIM what is missing and how it is fixed, and wait. `node` →
  Node 20 or newer; `ffmpeg`/`ffprobe` → `brew install ffmpeg`; `playwright` or `python packages`
  → the repository's `install.sh` (`<skill>/../../install.sh`); `chromium` → `npx playwright
  install chromium` in `<skill>`.
- She says "ตั้งค่าใหม่" / "set up again", or asks to change a setting: `references/onboarding.md`
  section 8.

## 1. Project folder and slug

Parent: `node <skill>/scripts/profile.mjs get projects_dir`; if empty, the folder beside the
audio file, or the working directory; never inside `<skill>`. Folder name: lower-case ASCII,
digits and `-`; translate a Thai topic to two or three English words (`compound-interest`). In
voice mode with no topic yet use `reel-YYYYMMDD`, and pick `story.slug` once the transcript shows
the topic. The slug names the output files; it need not equal the folder name. Copy the audio
file into `<project>`.

Profile values: `get audience` empty → write for beginners; `get tone` empty → friendly, plain
speech. Empty `handle` / `disclaimer` → the end card shows neither (say so when delivering).

## 2. Route

Audio or video file given → voice mode (step 4). Otherwise → topic mode (step 3). A project with
a draft's `script.md` and `story.json` plus a new recording → voice mode, keeping both files. A
project with `script.proposed.md` and no `script.md` → voice mode (step 4), with or without a file.

## 3. Topic mode, in this order

1. `<project>/brief.md`: topic, the one thing to remember, target length, audience, tone.
2. `<project>/script.md` (`references/script-style.md`). Fact-check every figure on the web
   (rules in that file); keep only what you verified.
3. `<skill>/.venv/bin/python <skill>/scripts/timing.py estimate <project>` → prints
   `estimated 34.0 s, 12 lines`. Aim for 30–50 s: the estimate is a floor, real speech runs
   longer. Exit 2 `tokens over 14 characters, add spaces to split them:` → split those phrases
   and run it again.
4. Sprites and story (step 6), then build, check and stills (step 7), then render (step 8).
5. `<project>/read-aloud.md` (format in `references/script-style.md`).
6. Hand over the draft MP4, its preview and the read-aloud sheet. Say plainly that the timing is
   estimated and her voice is still needed; ask her to record the sheet and send the file.
   **Stop.** When the recording arrives, continue at step 4 in the same `<project>`.

## 4. Voice mode

First: `script.proposed.md` exists, `script.md` does not, and no new audio file came with this
message → skip 4.1–4.2 (the voice is already prepared and transcribed). Her answer is a message
with no audio that confirms or edits lines: apply it as in 4.3 and continue at 4.4. Anything else:
go straight to the pending-confirmation stop in 4.3. A new audio file is a new take: remove
`script.proposed.md`, tell her the old proposal is dropped, and run 4.1–4.2 on the new file.

1. `<skill>/.venv/bin/python <skill>/scripts/prep_voice.py <audio> <project>` →
   `voice/voice.wav` (mono 48 kHz, 0.25 s lead-in, pauses over 0.45 s cut to 0.45 s, end
   trimmed to 0.15 s, −14 LUFS); prints `voice N s -> …`. `WARN longer than 90 s`: ask whether
   to go on. Exit 2 prints why (`no audio stream`, `no speech found`, `ffmpeg failed to …`):
   tell her and ask for another file.
2. `<skill>/.venv/bin/python <skill>/scripts/transcribe.py <project>` → `voice/words.json`, on
   this machine (the first run downloads a 3 GB speech model: say it takes minutes). Prints
   `N words, M segments, D s`. Exit 2 `no speech recognised`: ask for another take. Exit 1
   `missing …voice.wav`: run 4.1 first.
3. Which script? Look in `<project>`; exactly one of these holds, also when you come back to the
   project in a later session:
   - **`script.md` exists** → P.AIM supplied it (she read from the sheet) or confirmed it: go to 4.4.
   - **`script.proposed.md` exists, `script.md` does not** → her confirmation is still pending.
     Show her `script.proposed.md` line by line and **STOP**. Do nothing else until she answers.
   - **Neither** → `transcribe.py` wrote `script.draft.md`: no spaces between phrases, often
     misheard Thai. Write your corrected text to `<project>/script.proposed.md` (same `lNN:`
     format; never to `script.md`): fix spelling, add phrase spaces (≤ 14 base characters each),
     spell numbers the way they are read, split lines into one idea each (lines need not match
     the draft's segments one to one). Never guess a word you cannot read: write `[?]`.
     Then **STOP**: you cannot hear the recording. Show her the proposal line by line and ask
     her to confirm it or fix any line. Do not run `timing.py align`, draw sprites or write a
     story until she answers.
   When she answers: apply her fixes and only then write `script.md`, with every `[?]` filled
   in (`timing.py` exits 2 naming the lines while any `[?]` remains).
4. `<skill>/.venv/bin/python <skill>/scripts/timing.py align <project>` → `timing.json`;
   prints `aligned 65.7 s, match 0.86, lowest l07 0.75`. Exit 2 `tokens over 14 characters` →
   split those phrases; exit 2 `still has [?]` → ask her for those words; then run it again.
   **Any `LOW` line → go to step 5**, even though the exit code is 0. No `LOW` line: a lowest
   ratio under 0.75 deserves a second look at that line's wording; fact-check every figure she
   says that will go on screen (same rules as topic mode); continue at step 6.

## 5. When the script and the voice disagree

`align` prints `LOW lNN <ratio> <text>` for a line the voice does not match, and exits 2 with
`script and voice do not match (match … < 0.60)` when most of it differs. Do not render. Show
P.AIM those lines; ask whether to change `script.md` to what she said or to record again. Then
run `timing.py align` again.

## 6. Sprites, then the story

1. `<project>/sprites.tsv`, one `name<TAB>subject` line per object the script names: a generic
   object in plain words, never a brand, logo, text or real person. 4–8 per reel; reuse one in
   several scenes.
2. `<skill>/.venv/bin/python <skill>/scripts/gen_sprites.py <project> --agent claude` (or
   `codex`: the agent running this skill, not the drawing tool). Writes `gen/sprites/<name>.png`
   (the story uses this), plus `<name>-raw.png` and `<name>.log`. One line per sprite: `OK`,
   `SKIP` (already drawn), `FAIL <name> (<log>)`, `OFF-PALETTE <name> <share>`, `QUOTA …`.
   - Exit 0: all drawn. Exit 1: on each `FAIL`, read the last lines of that log before deciding
     what went wrong; then run again with `--only <name>` (drawn sprites are skipped).
   - Exit 2: a bad `sprites.tsv` line (the message names it: fix it), or `No image CLI is chosen
     yet` / `The image command … is not installed`: do section 4 of `references/onboarding.md`.
     If drawing keeps failing, run `<skill>/.venv/bin/python <skill>/scripts/image_cli.py test`
     (same `--agent`); its exit 2 sentence says why the tool cannot draw: tell P.AIM that
     sentence in plain Thai and do section 4 of `references/onboarding.md`.
   - Exit 3 `QUOTA`: stop; the drawing quota is used up, try later. Use `icon` items instead only
     if P.AIM says so.
3. Open every `gen/sprites/<name>.png`. Redraw (`rm` it, then `--only <name>`; at most twice) one
   with text, a logo, a wrong colour, more than one object, or an `OFF-PALETTE` line.
4. Photos, only for a real, nameable thing a line mentions (a building, a banknote, a place):
   `references/photos.md` (search the web, `scripts/fetch_photo.py`, read every photo, credits).
5. `<project>/story.json` (`references/story-json.md`): one scene per idea; the sprite is the
   thing the line names, entering on the phrase that names it; something new at least every 3 s;
   orange for the subject of each line, green for growth or the safer option; one highlighted
   phrase per line; every `number` has a `source`; end on a takeaway scene.

## 7. Build, check, look

1. `node <skill>/scripts/build.mjs <project>` prints `built <slug> (<duration> s)`. Exit 2 lists
   every story problem, one per line: fix them all and build again.
2. `node <skill>/scripts/check.mjs <project>`: exit 0 when `text:`, `dead beats:`, `overlap:` and
   `credits:` all say `PASS`. Exit 1: fix each finding (`references/story-json.md`) and run it
   again. Never render on a FAIL.
3. `node <skill>/scripts/still.mjs <project> --scenes <project>/sheet.png`: one frame per scene,
   once everything in it has settled. Open the sheet and fix a covered, crowded or empty scene or
   a badly wrapped label; then build, check and look again. A still taken at any other time can
   catch a counter mid-count or miss late items.

## 8. Render

`node <skill>/scripts/render.mjs <project> --preview` prints `N frames -> <file>` and
`preview -> <file>`: `renders/<slug>.mp4` and `-preview.mp4`, or the `-draft` pair on estimated
timing. Exit 2: a build problem; exit 1: read the ffmpeg message. Check the file with
`ffprobe -v error -show_entries stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate -of compact <file>`:
video `h264`, `1080`×`1920`, `30/1`. Sound effects are placed from the story on their own and
are quiet under the voice; `story.sfx: false` turns them off. A draft carries only the effects,
so it has one `aac` stream (none when `sfx` is false). A final must also have audio `aac` at
`48000`; if not, `voice/voice.wav` is missing: run step 4.1 and render again. Never deliver a
file without her voice as a final.

## 9. Deliver

Send the MP4 and its preview (topic mode: also the read-aloud sheet) and report:

- the font that drew the text (`font:` from `check.mjs`; IBM Plex Sans Thai means Sukhumvit Set
  is not on this machine);
- what drew the sprites: `codex` or `gemini`, or "custom command" when `PAIM_IMAGE_CMD` or the
  profile's `image_cmd` is set;
- what was checked: `check.mjs` all PASS, the `--scenes` sheet looked at, `ffprobe`, and every
  on-screen figure with its source;
- with web photos: `<skill>/.venv/bin/python <skill>/scripts/credits.py <project>`, attach the
  `renders/<slug>-credits.md` it writes, and list every photo whose licence is `unknown` with its
  page URL, saying plainly that those may be copyrighted and are used at her decision;
- any claim left off screen because it could not be verified; any empty profile value (no
  handle or disclaimer on the end card);
- that you cannot listen to the mix, so she should play it once before posting.

## Never

- Logos, brand marks or real people anywhere, sprites included.
- A number on screen without a source, or a made-up figure not called hypothetical.
- Guessing words the recogniser could not read, or taking them from `examples/`.
- Text-to-speech, a cloned voice, or any voice but P.AIM's own recording.
- Writing into the skill folder.
- Sending the recording or its transcript to any service: the voice file and the speech-to-text
  stay on this machine. You read the script text in this chat; only the short sprite descriptions
  go to the image tool; fact-check searches go to the web.
- Typing a password, API key or login code for the user, or storing one. She signs in herself.
