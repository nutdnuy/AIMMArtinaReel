# Known issues and untested ground

This is the honest backlog of version 1. Every line below is either something found while building the skill and
left as it is, or something nobody has tried. Things that were found and then fixed are not listed, and none of the items
below has been worked on since it was written down. The README's status section says what was tested.

## Not tested

- The first-run setup (the guided Thai conversation) has not been run with a real user or a simulated one.
  The text and the profile commands behind it are covered by tests; the conversation itself is not.
- No real human voice recording has been used. Every test recording is synthetic (generated sound), so how
  speech-to-text, pause shortening and caption timing behave on a real Thai voice is not measured.
- The six sound effects have never been listened to by anyone. They are measured (length, level, peak), not heard.
- The default speech model, `large-v3`, has not been run in the tests: they used the `small` and `tiny` models.
- The Codex install has not been tried end to end. The link into `~/.codex/skills` is tested under a temporary
  home folder; Codex itself was not started to see whether it lists the skill.
- Windows has not been tried. macOS is the only tested system, and `fetch_photo.py` needs macOS or Linux.
- Choosing Codex as the picture tool during setup, running setup under Codex, a picture tool that fails during
  setup, and changing only the channel handle later were not run by a fresh agent.
- Several parts of OpenFilm Studio were only opened and not tried: trimming by dragging a clip edge, Studio's own
  Export button, undo, muting a track, adding your own pictures or music, captions made in Studio, and its
  Motion and Effects tabs. Studio may also have changed since version 0.3.2, which is the one that was used.

## Timing and alignment (`timing.py`)

- The test that checks caption start times stay in order does not check that end times do too, and the code does
  not force end times to stay in order.
- A damaged `words.json` ends in a raw Python error message instead of one plain sentence.
- The "does the voice match the script" gate compares the rounded match value with 0.60, so a true value just
  under 0.60 can be rounded up and pass.
- Times are rounded one by one to three decimals, so the test that line gaps are exact passes only for the values
  it happens to use.
- A recording shorter than 0.04 s could produce a negative start time.
- `timing.py align` records the sha256 of `voice/voice.wav` in `timing.json` (`voice_sha256`), and `render.mjs` and
  `export_openfilm.mjs` refuse a voice file that no longer matches it. A `timing.json` written before that field
  existed is compared by length only (a difference over 0.05 s is refused), so a new take of nearly the same length
  passes until `timing.py align` is run again. `build.mjs` and `check.mjs` do not make this check.

## Voice preparation and transcription (`prep_voice.py`, `transcribe.py`)

- The test meant to show the peak limiter working uses audio that never reaches the limiter.
- A missing ffmpeg or ffprobe shows a raw "file not found" error instead of a plain sentence.
- A wrong `PAIM_WHISPER_MODEL` name, or a failure inside the recogniser, shows a raw Python error.
- Trimming silence from the end by reversing the audio can alter the last half millisecond of speech, which could
  in theory cause a tiny click.
- The test for the 0.5 s pause case accepts the untouched value as well as the shortened one.
- A long pause comes out at about 0.47 s, not exactly 0.45 s.

## Story checks (`lib/story.mjs`)

- One scene listed out of order produces extra "outside its scene" messages after the real one.
- The story validator is one very long function, and the colour check is written out three times.
- A misspelled item key (for example `exitt`) is silently ignored.
- A `slot` on an item that has its own position is ignored, and a free item whose centre is off the canvas is not
  rejected.
- A number item with `prefix: null` is treated as an empty prefix.

## Drawing sprites (`gen_sprites.py`, `image_cli.py`)

- A badly written `PAIM_IMAGE_CMD`, a command that is not executable, or a bad `PAIM_IMAGE_WAIT` shows a raw
  Python error.
- The time limit is applied to the command and again to the wait, so the worst case is twice as long, and a slow
  but working real drawing can be cut short.
- The choice between a custom command and a named provider is written in two places.
- The test for "too many requests" does not check that exactly three attempts are made.
- Comparing a sprite with the palette uses about 60 MB of memory on a 1024-pixel picture.
- A drawn sprite prints its `OK` line and its `OFF-PALETTE` line separately, so they can be separated by another
  sprite's line when several are drawn at once.
- If the log file cannot be written, the last-resort error handler can fail too.
- The hint about the Gemini trust setting is now rarely reached.
- The Google routes run an auto-approving agent without a sandbox. The Gemini CLI command uses `--yolo` and the
  Antigravity route `--dangerously-skip-permissions`, so the drawing tool approves its own shell and file actions
  with the user's full rights, and its prompt contains the sprite description the assistant wrote. Codex runs with
  `-s workspace-write` and is the sandboxed and recommended route. No flag was changed. A sprite description must
  only ever be a plain description of an object, never a command, an instruction or text copied from elsewhere.
- A timed-out image command is stopped together with everything it started (its process group is killed). A helper
  that deliberately leaves that group (a daemon that starts a session of its own) is not reached. The command now
  runs in a group of its own, so a Ctrl-C in the terminal is handled by `image_cli.py` (it stops the group) instead of
  reaching the command directly; that path has no test.

## Page engine (layout and drawing)

- A very long item label shrinks the picture to almost nothing without being flagged as clipped.
- The page's start-up promise can fail before anything is waiting for it, which can print an "unhandled rejection"
  warning.
- The end card's disclaimer and channel handle are not shrunk to fit if they are very long.
- An arrow or ring that points at an item that does not exist, in hand-built data, ends in a bare TypeError.
- The report of where each piece of text sits includes any animation in progress, so it must only be read at a
  settled moment (the check does this).
- If the 400-weight font fails to load, the error can surface as an unhandled rejection when the 700-weight check
  fails first.
- Fitting to whole pixels can overshoot a picture's area by less than one pixel.

## Rendering (`render.mjs`, `still.mjs`)

- A reel built from aligned timing but with no `voice/voice.wav` renders a silent file that is named like a
  finished one. The skill's own steps catch this by checking the file's audio stream, but the script does not refuse.
- The frame loop keeps drawing after ffmpeg has died, and a stuck seek has no time limit.
- A page error after start-up is swallowed, and a missing page object gives a cryptic message.
- `--from` and `--to` are checked only after the `build/` folder has been wiped.
- A few render tests are loose: one pattern is too wide, the music test would still pass if the music were
  dropped, and no test decodes a video frame to check its colour.
- `still.mjs` reads `1,,2` as 0 for the empty item, and two helper functions live in `build.mjs` where they do
  not belong.
- The music level of -30 dB is relative to the music file, not measured against the voice.
- If starting ffmpeg throws at once, the browser that was already opened can be left running.
- `renderProject` has an `onFrame` option that exists for a test and is not documented.
- One fake-ffmpeg test script relies on a JavaScript file without an extension being read as CommonJS.

## The check gate (`check.mjs`)

- A caption is tested only at its midpoint, so an item that appears later during the same caption is not tested
  against it.
- Two text boxes with the same words are reported as one finding.
- A crash inside the check exits with 1, the same code as a real FAIL.
- The check test file sets `PAIM_CONFIG_DIR` for the whole process and never puts it back.
- The rule about the headline zone has no test of its own.
- The overlap check uses where an item rests, not how far its idle movement reaches.
- A very short-lived item can be measured while it is still overshooting its entrance.

## Story writing and stills

- Row scenes leave the space between y 980 and the caption empty, and a row of three pictures stays small. The
  story reference does not warn that the `grid` layout can run into the phone's button column.
- `still.mjs --scenes` ignores an item's exit time when it picks the settled moment for a scene.
- The marks test covers icon items only, and a ring can sit about 2 px from a side label in `versus` and `stack`
  layouts.
- One assertion in `check.test.mjs` is a loose one-liner.

## First-run setup text (`references/onboarding.md`)

- The fallback for a failed `npm install -g` assumes Homebrew is installed.
- When an optional question (logo, disclaimer) is left blank, it is not clear on resume whether she skipped it or
  never reached it.
- The setup test does not pin which step a resumed setup starts from, nor the wording that skips re-transcription
  when a proposal is pending.
- Moving an unreadable `profile.json` aside with `mv` can overwrite an older `profile.json.bak`.
- No test pins the Thai question that offers the two picture tools.

## Paper (`engine/paper.mjs`)

- The guarantee that any 40 x 40 px patch of paper stays within 10 levels of the scene colour was tested for one
  story name only; across seven names the worst patch measured 7.58 levels.
- The patch scan does not cover the framed sheet canvases or the margin behind the sheet.
- A frame colour equal to the scene colour is accepted, which makes the torn edge nearly invisible, and the sheet
  and the backdrop share one mottle pattern.
- No test checks that the safe text area stays inside the frame inset plus the roughness of the tear.

## Web photos (`fetch_photo.py`, `credits.py`)

- Licence values such as "none" or "n/a" are not turned into `unknown`.
- `build`, `check` and `credits.py` disagree about what to do with a damaged `credits.json`, and the picture's
  sha256 in the record is never compared with the file.
- A web address with an international domain name is percent-encoded, `credits.py` checks the photo name with a
  prefix match instead of a full match, and `check.mjs` reads the credits file only after it has opened the browser.
- A process killed between its two file moves can leave the new record next to the old picture.
- `fetch_photo.py` uses file locking from the standard library that exists only on macOS and Linux.

## Sound effects (`make_sfx.py`, `lib/sfx.mjs`)

- The documentation says the six sounds are rebuilt byte for byte on every machine. It was only checked on one
  Mac, so a different CPU or numpy version might produce different bytes (the test would then fail).
- The test with a very loud voice does not check that effects are actually present in the render it compares.

## OpenFilm hand-off (`export_openfilm.mjs`)

- The test that compares Studio's page with the skill's page samples one time per scene and does not check the
  picture is non-blank.
- A hard kill of the export can leave a `.openfilm-staging-*` folder behind.
- The state check does not cover the shape of an arrow, ring or cross, because the test fixtures have none.
- A browser that starts after the 30-second limit is never closed.
- `open_studio.sh` runs OpenFilm 0.3.2 (`PAIM_OPENFILM_VERSION` overrides it), not the latest version; the list of
  hand edits in `references/openfilm.md` was observed with that version only.
- Every attribute in `film.html` is now HTML-escaped, so the music fade's `overrides` JSON is written as
  `overrides="[{&quot;fade&quot;:[0,2]}]"`. OpenFilm's own reader decodes it back (checked against its parser), but
  Studio was not opened on such a file in this wave.
