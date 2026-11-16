---
name: paim-reel
description: Makes a 9:16 P.AIM-branded finance explainer reel (MP4 with Thai captions, sticker sprites and icon motion) from a finance topic or from P.AIM's own voice recording. Use when asked "ทำ reel เรื่อง…", "ทำคลิปจากเสียงนี้" (with an audio file), "make a P.AIM short about…", or for any P.AIM short video, clip or reel about investing or personal finance. From a topic it writes the script, renders a silent draft and asks for the recording; from a voice recording it times the captions to the voice and renders the finished video.
---

# paim-reel

Turn a finance topic, or P.AIM's recorded voice, into a 1080×1920 explainer reel in the P.AIM
brand: a few large stickers that pop and regroup on a faint grid, one bold caption phrase at a
time, a green end card.

`<skill>` below is this skill's folder; run every script by its path. Python scripts run with
`<skill>/.venv/bin/python`, Node scripts with `node`. `<project>` is the reel's folder. Every
script writes only into `<project>`.

Read before you start: `references/script-style.md` (writing the script),
`references/story-json.md` (writing the story, fixing `check.mjs` findings),
`references/brand.md` (colours, type, zones, what never goes on screen).

## 0. Check the machine

Run `<skill>/scripts/doctor.sh --agent claude` under Claude Code, or `--agent codex` under Codex.

- Exit 0: go on. Note the `font:` line for the delivery report.
- A `MISSING …` line: stop, tell P.AIM what is missing and the line that fixes it, and wait.
  `node` → install Node 20 or newer; `ffmpeg`/`ffprobe` → `brew install ffmpeg`;
  `playwright` or `python packages` → run the repository's `install.sh`
  (`<skill>/../../install.sh`); `chromium` → `npx playwright install chromium` in `<skill>`;
  `image-cli` → re-run setup (the image CLI must be chosen and on `PATH`).
- `onboarding: needed`: stop and tell P.AIM that setup has not been finished yet.

## 1. Make the project folder

`<skill>/scripts/profile.mjs get projects_dir` (run with `node`) names where reels are kept; if
it is empty, use the folder beside the audio file, or the working directory. Create
`<project>` = that folder + `/<slug>` (lower-case letters, digits and `-`, from the topic).
Never put a project inside `<skill>`. Copy the audio file into `<project>` when there is one.

## 2. Route

An audio or video file was given → voice mode (step 4). Otherwise → topic mode (step 3). A
project that already has `script.md` and `story.json` from an earlier draft, plus a new
recording → voice mode, keeping both files.

## 3. Topic mode

1. Write `<project>/brief.md`: the topic, the one thing the viewer should remember, the target
   length (30–60 s), and the audience and tone from `profile.mjs get audience` / `get tone`.
2. Write `<project>/script.md` following `references/script-style.md`.
3. Fact-check every figure on the web. Keep only figures you verified; note each source (URL and
   access date) for the story. Drop any claim you cannot verify.
4. `<skill>/.venv/bin/python <skill>/scripts/timing.py estimate <project>` → `timing.json`.
   Exit 2 `tokens over 14 characters, add spaces to split them:` lists the long phrases: split
   them in `script.md` and run it again. Exit 1 `missing …/script.md`: the path is wrong.
5. Sprites and story: step 6. Build and check: step 7.
6. `node <skill>/scripts/render.mjs <project> --preview` → `renders/<slug>-draft.mp4` and
   `renders/<slug>-draft-preview.mp4` (silent, stamped DRAFT).
7. Write `<project>/read-aloud.md` (format in `references/script-style.md`).
8. Deliver the draft preview and the read-aloud sheet. Say plainly that the timing is estimated
   and the voice is still needed: ask P.AIM to record the sheet and send the file. Stop here.
   When the recording arrives, continue at step 4 in the same `<project>`.

## 4. Voice mode

1. `<skill>/.venv/bin/python <skill>/scripts/prep_voice.py <audio> <project>` →
   `voice/voice.wav` (mono 48 kHz, 0.25 s lead-in, pauses over 0.45 s cut to 0.45 s, end trimmed
   to 0.15 s, −14 LUFS). Prints `voice N s -> …`. `WARN longer than 90 s`: tell P.AIM the reel
   will be long and ask whether to go on. Exit 2 prints why (`no audio stream in …`, `no speech
   found in …`, `ffmpeg failed to …`): tell her and ask for another file.
2. `<skill>/.venv/bin/python <skill>/scripts/transcribe.py <project>` → `voice/words.json`, all
   on this machine (the first run downloads a speech model of about 3 GB; tell her it can take
   several minutes). Prints `N words, M segments, D s`. Exit 2 `no speech recognised in the
   recording`: ask for another take. Exit 1 `missing …voice.wav`: run step 4.1 first.
3. No `script.md` yet: `transcribe.py` also wrote `script.draft.md`, whose lines have **no
   spaces between phrases**. Copy it to `script.md` and correct spelling, add the phrase spaces
   (every phrase 14 base characters or fewer) and split lines into one idea each, never changing
   what was said (`references/script-style.md`, "Voice mode").
4. `<skill>/.venv/bin/python <skill>/scripts/timing.py align <project>` → `timing.json` timed to
   her voice. Exit 2 with `tokens over 14 characters` → split those phrases and run it again.

## 5. When the script and the voice disagree

`align` prints `LOW lNN <ratio> <text>` for a line the voice does not match, and exits 2 with
`script and voice do not match (match … < 0.60)` when most of it differs. Either way: do not
render. Show P.AIM those lines and ask whether to change `script.md` to what she said, or to
record again. Then run `timing.py align` again.

## 6. Sprites, then the story

Read `references/story-json.md`.

1. List the objects the script names in `<project>/sprites.tsv`, one `name<TAB>subject` line
   each: a generic object in plain words ("a shopping basket full of coins"), never a brand,
   logo, text or real person. 4–8 sprites per reel; reuse one sprite in several scenes.
2. `<skill>/.venv/bin/python <skill>/scripts/gen_sprites.py <project> --agent claude` (or
   `--agent codex`) → `gen/sprites/<name>.png`. One line per sprite: `OK`, `SKIP` (already
   drawn), `FAIL <name> (<log>)`, `OFF-PALETTE <name> <share>`, `QUOTA …`.
   - Exit 0: every sprite is drawn. Exit 1: some `FAIL`; read the end of each log, then run again
     with `--only <name>` (drawn sprites are skipped).
   - Exit 2 `No image CLI is chosen yet` or `The image command … is not installed`: re-run setup.
     If sprites keep failing, run `<skill>/.venv/bin/python <skill>/scripts/image_cli.py test`
     (same `--agent`); exit 2 prints one sentence saying why the tool cannot draw: tell P.AIM that
     sentence and re-run setup.
   - Exit 3 `QUOTA`: stop. Tell P.AIM the drawing service's quota is used up and to try again
     later. Use `icon` items instead only if she says so.
3. Look at every `gen/sprites/<name>.png` (open the image). Delete and redraw one
   (`rm gen/sprites/<name>.png`, then `--only <name>`) that has text, a logo, a wrong colour,
   more than one object, or an `OFF-PALETTE` line. Redraw each sprite at most twice.
4. Write `<project>/story.json`: one scene per idea; the sprite is the thing the line names; bring
   each item in on the phrase that names it; something new at least every 3 s; orange for the
   subject of each line, green for growth or the safer option; highlight the one phrase per line
   that carries the point; every `number` has a `source`; end on a takeaway scene.

## 7. Build, check, look

1. `node <skill>/scripts/build.mjs <project>` → `build/`. Prints `built <slug> (<duration> s)`.
   Exit 2 lists every story problem, one per line: fix them all and build again.
2. `node <skill>/scripts/check.mjs <project>`. Exit 0 when the `text:`, `dead beats:` and
   `overlap:` lines all say `PASS`. Exit 1: fix each finding (table in
   `references/story-json.md`) and run it again until all three pass. Never render on a FAIL.
3. `node <skill>/scripts/still.mjs <project> <t1,t2,…> <project>/sheet.png` with the middle of
   every scene (`(t0 + t1) / 2` of each scene in `build/resolved.json`). Look at the sheet: fix
   a picture covered by a mark or a caption, a crowded or empty scene, a label that wraps badly.
   Build, check and look again after a change.

## 8. Render

`node <skill>/scripts/render.mjs <project> --preview`. Prints `N frames -> <file>` and
`preview -> <file>`. Voice mode writes `renders/<slug>.mp4` and `renders/<slug>-preview.mp4`;
estimated timing writes the `-draft` pair. Exit 2: a build problem, fix it; exit 1: read the
ffmpeg message.

Confirm the file:
`ffprobe -v error -show_entries stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate -of compact renders/<slug>.mp4`
must show a video stream `h264`, `1080`×`1920`, `30/1` and, for a final, an audio stream `aac`
at `48000`. A final with no audio stream means `voice/voice.wav` is missing: run step 4.1, then
render again. Never deliver a silent file as a final.

## 9. Deliver

Send P.AIM the MP4 and its preview, and report:

- the font that drew the text (`font:` from `check.mjs`; IBM Plex Sans Thai means Sukhumvit Set
  is not on this machine);
- which image CLI drew the sprites (`codex`, `gemini` or the profile's `image_cmd`);
- what was checked: `check.mjs` all PASS, the contact sheet looked at, `ffprobe` results, and
  every on-screen figure with its source;
- any claim left off screen because it could not be verified;
- that you cannot listen to the mix, so she should play it once before posting.

## Never

- Logos, brand marks or real people anywhere, sprites included.
- A number on screen without a verified source.
- Text-to-speech, a cloned voice, or any voice but P.AIM's own recording.
- Writing into the skill folder.
- Sending the recording or the script to any service. Only the short sprite descriptions go to
  the image CLI.
- Typing a password, API key or login code for the user, or storing one. She signs in herself.
