---
name: paim-reel
description: Makes a 9:16 P.AIM-branded finance explainer reel (MP4 with Thai captions, sticker sprites and icon motion) from a finance topic or from P.AIM's own voice recording. Use when asked "ทำ reel เรื่อง…", "ทำคลิปจากเสียงนี้" (with an audio file), "make a P.AIM short about…", or for any P.AIM short video, clip or reel about investing or personal finance. From a topic it writes the script, renders a draft (sound effects, no voice yet) and asks for the recording; from a voice recording it times the captions to the voice and renders the finished video. Also runs P.AIM's first-time setup (ตั้งค่า) and changes a setting when she says "ตั้งค่าใหม่" or "set up again".
---

# paim-reel

Turn a finance topic, or P.AIM's recorded voice, into a 1080×1920 P.AIM explainer reel: large stickers and
torn-paper photos, soft sound effects, one bold caption phrase at a time, a green end card.

`<skill>` is this skill's folder; run every script by its path (Python with `<skill>/.venv/bin/python`, Node
with `node`). `<project>` is the reel's folder. Scripts never write into the skill folder
(`image_cli.py test` writes under the user's config folder).

Read: `references/script-style.md` (script, facts, voice), `references/story-json.md` (story, effects,
`check.mjs`), `references/brand.md` (colours, zones), `references/photos.md`, `references/openfilm.md`.

## Three rules that always hold

1. **Voice mode with no script:** you cannot hear the recording. Your corrected transcript goes to
   `script.proposed.md`, never `script.md`, and you **stop** until she confirms or fixes it (4.3). The
   bundled `examples/` show the format only: never a source for what she said or facts.
2. **Every number on screen has a `source`** (a made-up one only if the line calls it hypothetical). The
   delivery note lists every photo whose licence is `unknown`, with its page URL, and says those may be
   copyrighted and are used at her decision (step 9).
3. **Studio is hers:** never stop or restart Studio or use its online services. No OpenFilm hand-off for a
   draft. Its address holds a session key: give it to her once, in the chat, and write it nowhere (no file,
   note, log, commit message or delivery note).

## 0. Check the machine

`<skill>/scripts/doctor.sh --agent claude` under Claude Code, `--agent codex` under Codex.

- Exit 0: go on; note `font:` (for the delivery note) and any `WARN openfilm` (for step 9).
- `onboarding: needed` or `MISSING image-cli …`: first set up with her (`references/onboarding.md`).
- Any other `MISSING …`: stop, tell her what is missing and the fix (`references/onboarding.md` section 3;
  `chromium` → `npx playwright install chromium` in `<skill>`); wait for her yes.
- "ตั้งค่าใหม่" / "set up again", or a setting to change: `references/onboarding.md` section 8.

## 1. Project folder and slug

Parent: `node <skill>/scripts/profile.mjs get projects_dir`, else the folder beside the audio, else the
working directory; never inside `<skill>`. Folder name: lower-case ASCII, digits, `-` (a Thai topic in two
or three English words, `compound-interest`; voice mode with no topic yet, `reel-YYYYMMDD`, and `story.slug`
once the transcript shows it). The slug names the output files; it need not equal the folder name. Copy the
audio into `<project>`. Empty profile values: `audience` → beginners; `tone` → friendly, plain speech;
`handle` / `disclaimer` → left off the end card.

## 2. Route

Audio or video file given → voice mode (step 4); otherwise topic mode (step 3). A draft's `script.md` and
`story.json` plus a new recording → voice mode, keeping both files. `script.proposed.md` and no `script.md`
→ voice mode, with or without a file. A change to a reel already made ("ขอเปลี่ยนรูป", "เปลี่ยนภาพฉากที่ 3",
"แก้คำในบรรทัดที่ 2"): change only that (a sprite: step 6.3; a photo: `references/photos.md`; words:
`script.md`, then `timing.py` again), then steps 7–9. "เปิดให้แก้เอง": the Studio hand-off at the end of
step 9.

## 3. Topic mode, in this order

1. `<project>/brief.md`: topic, the one thing to remember, target length, audience, tone.
2. `<project>/script.md` (`references/script-style.md`). Fact-check every figure on the web (rules in that
   file); keep only what you verified.
3. `<skill>/.venv/bin/python <skill>/scripts/timing.py estimate <project>` prints `estimated 34.0 s, 12
   lines`; aim for 30–50 s (the estimate is a floor; real speech runs longer). Exit 2 `tokens over 14
   characters, add spaces to split them:`: split them, run it again.
4. Sprites, photos and story (step 6), then build, check and stills (step 7), then render (step 8).
5. Write `<project>/read-aloud.md` (`references/script-style.md`); hand over the draft MP4, its preview and
   that sheet, saying plainly that the timing is estimated and her voice is still needed; ask her to record
   the sheet and send it. **Stop.** The recording arrives: step 4, same `<project>`.

## 4. Voice mode

A recording: 4.1–4.4 in order. Two exceptions:

- `script.proposed.md` exists, `script.md` does not, and no audio file came with this message: skip 4.1–4.2
  (the voice is already prepared and transcribed). Her message with no audio that confirms or edits lines is
  her answer: apply it as in 4.3, continue at 4.4. Any other message: the pending-confirmation stop in 4.3.
- A new audio file while `script.proposed.md` exists is a new take: remove `script.proposed.md`, tell her
  the old proposal is dropped, and run 4.1–4.2 on the new file.

1. `<skill>/.venv/bin/python <skill>/scripts/prep_voice.py <audio> <project>` → `voice/voice.wav` (what it
   does to the take: `references/script-style.md`); prints `voice N s -> …`. `WARN longer than 90 s`: ask
   whether to go on. Exit 2 prints why (`no audio stream`, `no speech found`, `ffmpeg failed to …`): tell
   her, ask for another file.
2. `<skill>/.venv/bin/python <skill>/scripts/transcribe.py <project>` → `voice/words.json` and
   `script.draft.md`, on this machine (the first run downloads a 3 GB model: say it takes minutes); prints
   `N words, M segments, D s`. Exit 2 `no speech recognised`: ask for another take. Exit 1
   `missing …voice.wav`: run 4.1 first.
3. Which script? Look in `<project>`; exactly one of these holds, also when you come back to the project in
   a later session:
   - **`script.md` exists** → P.AIM supplied it (she read from the sheet) or confirmed it: go to 4.4.
   - **`script.proposed.md` exists, `script.md` does not** → her confirmation is still pending. Show her
     `script.proposed.md` line by line and **STOP**. Do nothing else until she answers.
   - **Neither** → `transcribe.py` wrote `script.draft.md` (no phrase spaces, often misheard Thai). Write
     your corrected text to `<project>/script.proposed.md` (never `script.md`) as `lNN:` lines (`timing.py`
     reads only those); what to correct: `references/script-style.md`, "Voice mode". Never guess a word you
     cannot read: write `[?]` and nothing else (your best guesses go in your message to her, labelled as
     guesses, never in the file). Then **STOP**: you cannot hear the recording. Show her the proposal line
     by line and ask her to confirm it or fix any line. Do not run `timing.py align`, draw sprites or write
     a story until she answers.
   When she answers: apply her fixes and only then write `script.md`, with every `[?]` filled in
   (`timing.py` exits 2 naming the lines while any `[?]` remains).
4. `<skill>/.venv/bin/python <skill>/scripts/timing.py align <project>` → `timing.json`; prints
   `aligned 65.7 s, match 0.86, lowest l07 0.75`. Exit 2 `tokens over 14 characters` or `still has [?]`:
   split those phrases or ask her for those words, then run it again. **Any `LOW` line → go to step 5**,
   even with exit 0. No `LOW` line: fact-check every figure she says that goes on screen (as in topic
   mode); first look at a lowest ratio under 0.75 (`references/script-style.md`, "A low ratio without a
   LOW line"); then step 6.

## 5. When the script and the voice disagree

`align` prints `LOW lNN <ratio> <text>` per line the voice does not match; exit 2 `script and voice do not
match (match … < 0.60)` when most of it differs. Do not render. Show P.AIM those lines, ask whether to
change `script.md` to what she said or to record again, then run `timing.py align` again.

## 6. Sprites, photos, then the story

1. `<project>/sprites.tsv`: one `name<TAB>subject` line per object the script names, a generic object in
   plain words (never a brand, logo, text or real person); 4–8, reused across scenes.
2. `<skill>/.venv/bin/python <skill>/scripts/gen_sprites.py <project> --agent claude` (or `codex`: the agent
   running this skill) writes `gen/sprites/<name>.png` and prints per sprite `OK`, `SKIP`, `FAIL <name>
   (<log>)`, `OFF-PALETTE <name> <share>` or `QUOTA …`. Exit 1: read the end of each `FAIL` log, then run
   again with `--only <name>`. Exit 2: a bad `sprites.tsv` line (named: fix it); or no image tool is chosen
   or installed, or drawing keeps failing: `<skill>/.venv/bin/python <skill>/scripts/image_cli.py test`
   (same `--agent`) says why: tell her that sentence in plain Thai and do section 4 of
   `references/onboarding.md`. Exit 3 `QUOTA`: stop, try later; `icon` items instead only if she says so.
3. Open every `gen/sprites/<name>.png`. Redraw (`rm` it, then `--only <name>`; at most twice) one with text,
   a logo, a wrong colour, more than one object, or an `OFF-PALETTE` line.
4. Photos, only for a real, nameable thing a line mentions (a building, a banknote, a place):
   `references/photos.md` (search the web, `scripts/fetch_photo.py`, read every photo, credits).
5. `<project>/story.json` (`references/story-json.md`, "Writing a good story"): one scene per idea, the
   picture enters on the phrase that names it, every `number` has a `source`.

## 7. Build, check, look

1. `node <skill>/scripts/build.mjs <project>` prints `built <slug> (<duration> s) -> <build dir>`. Exit 2
   lists every story problem, one per line: fix them all and build again.
2. `node <skill>/scripts/check.mjs <project>`: exit 0 when `text:`, `dead beats:`, `overlap:` and `credits:`
   all say `PASS`. Exit 1: fix each finding (`references/story-json.md`), run it again; never render on a FAIL.
3. `node <skill>/scripts/still.mjs <project> --scenes <project>/sheet.png` (one settled frame per scene):
   open it; fix a covered, crowded or empty scene or a badly wrapped label, then 7.1–7.3 again.

## 8. Render

`node <skill>/scripts/render.mjs <project> --preview` prints `N frames -> <file>` and `preview -> <file>`:
`renders/<slug>.mp4` and `-preview.mp4`, or the `-draft` pair on estimated timing. Exit 2: a build problem;
exit 1: read the ffmpeg message. Check the file with
`ffprobe -v error -show_entries stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate -of compact <file>`:
video `h264`, `1080`×`1920`, `30/1`. Effects come from the story (`story.sfx: false` turns them off); a
final has them when `<project>/build/sfx.wav` exists and `story.sfx` is not `false`. A draft has only them:
one `aac` stream (none without effects). A final needs audio `aac` at `48000` with her voice; none means
`voice/voice.wav` is missing: run 4.1 and render again. Never deliver a file without her voice as a final.

## 9. Deliver

Send the MP4 and its preview (topic mode: also the read-aloud sheet) and report:

- the font (`font:` from `check.mjs`; IBM Plex Sans Thai = no Sukhumvit Set here) and what drew the sprites
  (`codex`, `gemini`, or "custom command" when `PAIM_IMAGE_CMD` or `image_cmd` is set);
- what was checked: `check.mjs` all PASS, the `--scenes` sheet looked at, `ffprobe`, and every on-screen
  figure with its source;
- with web photos: `<skill>/.venv/bin/python <skill>/scripts/credits.py <project>`, attach the
  `renders/<slug>-credits.md` it writes, and list the `unknown`-licence photos as rule 2 says;
- any claim left off screen because it could not be verified; any empty profile value; every headline you
  worded yourself, so she can change it; any line whose caption timing could not be checked by ear;
- that you cannot listen to the mix, so she should play it once before posting.

Then, for a final only (never a draft), the hand-off for hand edits (`references/openfilm.md`). If
`doctor.sh` printed `WARN openfilm`, skip the hand-off and tell her why. Otherwise
`node <skill>/scripts/export_openfilm.mjs <project>` prints `openfilm -> <folder> (<n> clips)`. Before the
first Studio opening of a conversation, tell her Studio may download about 100 MB if it has not been used on this
machine, and ask. Then run `bash <skill>/scripts/open_studio.sh <folder>` with the folder it printed,
directly: read the address from its output, never redirect or save that output. Last, tell her what
`references/openfilm.md` lists under "What to tell her, plainly".

## Never

- Logos, brand marks or real people in sprites, icons, labels or captions. For photos,
  `references/photos.md` decides (a company's logo only when the line names that company).
- Guessing words the recogniser could not read, or taking them from `examples/`.
- Text-to-speech, a cloned voice, or any voice but P.AIM's own recording; writing into the skill folder.
- Sending the recording anywhere: the voice file and the speech-to-text stay on this machine. You read the
  script and transcript text in this chat; only the short sprite descriptions go to the image tool; fact and
  photo searches go to the web.
- Typing a password, API key or login code for the user, or storing one. She signs in herself.
