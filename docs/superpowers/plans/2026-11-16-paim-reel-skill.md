# P.AIM Reel Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public GitHub repository with one agent skill, `paim-reel`, that turns a finance topic or P.AIM's recorded voice into a 9:16 icon-motion explainer MP4 in the P.AIM brand, usable from Claude Code and Codex.

**Architecture:** Python scripts prepare the voice and produce `timing.json` (script lines and caption phrases with times, either estimated or aligned to the recording). The agent writes a `story.json` anchored to script lines, not seconds. A Node build validates the story and resolves it to absolute times; a deterministic browser engine draws any time `t` from that data; Playwright screenshots every frame and ffmpeg encodes it with the voice. Illustrations are sticker sprites drawn by a companion image CLI (Codex or Gemini, chosen in onboarding) and keyed to transparency; a first-run onboarding stores P.AIM's choices in a profile file outside the repository.

**Tech Stack:** Node ≥ 20 (ES modules, `node --test`), Playwright 1.65 (Chromium), `@phosphor-icons/core` 2.1 (MIT), `@fontsource/ibm-plex-sans-thai` 5.3 (OFL-1.1), Python 3.12 venv (`faster-whisper`, `numpy`, `pillow`, `pytest`), ffmpeg/ffprobe, Codex CLI or Gemini CLI for illustrations.

**Spec:** `docs/superpowers/specs/2026-11-16-paim-reel-skill-design.md`

## Global Constraints

- Repository root is `paim-reel-skill/`. Everything the installed skill needs lives under `skills/paim-reel/`; tests live in `tests/` and import from it by relative path.
- Brand colours, exact: orange `#F5820B`, green `#14856D`, charcoal `#252B31`, cream `#FFFAF0`.
- Text colour pairs allowed (text on background): charcoal on cream, charcoal on orange, cream on charcoal, cream on green. No other text pair anywhere.
- Fonts: `"Sukhumvit Set"` weight 700 for headlines and captions, weight 400 for body; fallback family `"IBM Plex Sans Thai"`. Never commit a Sukhumvit font file.
- Canvas 1080×1920, 30 fps. Output H.264 yuv420p + AAC 48 kHz.
- No third-party logos or brand marks in code, examples, tests or docs. Icon names ending `-logo` are refused.
- Public repository: no secrets, no absolute home-folder paths, no material from the owner's other projects or employers, no recording of a real person's voice. Test audio is synthesised.
- Scripts never write inside the skill folder; all output goes to the project folder passed on the command line. Tests copy fixtures to a temp directory first.
- During development never install into the real `~/.claude/skills` or `~/.codex/skills`; use `install.sh --home <temp dir>`. Registering the skill on the owner's own machine is a separate decision.
- Python runs as `skills/paim-reel/.venv/bin/python`. Python 3.10–3.12 only (faster-whisper wheels). Scripts import their sibling modules, so they are run by path, never with `-I`.
- Code comments, file names, docs and `SKILL.md` in English; README has Thai and English install sections; example script content in Thai.
- Every commit message ends with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.
- User profile: `${PAIM_CONFIG_DIR:-$HOME/.config/paim-reel}/profile.json`. Every test sets `PAIM_CONFIG_DIR` to a temp dir.
- Under Claude Code an image CLI is mandatory: `doctor.sh --agent claude` reports `MISSING image-cli` until the profile names `codex` or `gemini` and that command is on `PATH`. Under `--agent codex` the provider is `codex` and no choice is asked. No silent fallback to icons.
- Automated tests never call a real image CLI; they point `PAIM_IMAGE_CMD` at `tests/fixtures/fake_image_cli.py`. Real calls are opt-in (`PAIM_RUN_IMAGE=1`).
- The agent never types or stores a password, API key or login code; the user signs in to Codex or Gemini in her own terminal.
- Privacy, as built: the voice file and its speech-to-text stay on this machine; the assistant the user is chatting with reads the script and transcript text; only short object descriptions go to the drawing tool; fact and photo searches go to the web. (The first draft of this plan said recordings and scripts never leave the machine; that was wrong, because the assistant reads the script.)
- Chroma-key colour is magenta `#FF00FF`; a green key would remove brand green.
- Publishing to GitHub (Task 11, last step) needs the owner's explicit go-ahead at that moment.

## Review Focus

1. **The recording differs from the script** (ad-lib, skipped line, wrong file): alignment stops with a per-line report and exit code 2; it never produces captions that drift. → Task 2.
2. **Phone recordings**: stereo `.m4a` or `.mov`, 44.1 kHz, file names with spaces and Thai letters are accepted; a silent or sub-second file gives a clear error. → Task 3.
3. **Story names an unknown icon, a brand logo, a sprite that was never generated, or a line/phrase that does not exist**: the build fails once, listing every problem with name suggestions and the command that fixes it; it never renders an empty slot. → Tasks 4 and 7.
4. **The image CLI misbehaves**: not installed, not signed in, quota used up, the file arriving after the command returns, or a result with no clean magenta background. Each gives one plain message and a stop; quota never loops; nothing falls back to icons on its own. → Task 5.
5. **Text on screen**: on a machine without Sukhumvit Set the fallback font is used and named in the report (never a browser default serif); Thai stacked marks (`ที่`, `น้ำ`, `ปั๊ม`, `ผู้ถือหุ้นกู้`) are not clipped; text stays out of the phone-button column. → Task 8.

## File Structure

```
paim-reel-skill/
  install.sh                     deps + symlink into ~/.claude/skills and ~/.codex/skills
  README.md  LICENSE  THIRD_PARTY_NOTICES.md  .gitignore
  requirements-dev.txt           pytest
  docs/superpowers/{specs,plans}/…
  skills/paim-reel/
    SKILL.md                     the workflow the agent follows
    brand.json                   colours, fonts, handle, logo, disclaimer
    package.json  requirements.txt
    references/brand.md          colour roles, text pairs, type sizes, zones
    references/story-json.md     story schema, anchors, worked example
    references/script-style.md   how to write and space a script; content rules
    references/onboarding.md     the first-run setup the agent conducts
    references/cheatsheet-th.md  one page for P.AIM, in Thai
    scripts/doctor.sh            requirement check
    scripts/paim_script.py       parse script.md
    scripts/timing.py            estimate | align → timing.json
    scripts/prep_voice.py        clean the take → voice/voice.wav
    scripts/transcribe.py        faster-whisper → voice/words.json (+ script.draft.md)
    scripts/image_cli.py         provider adapter (codex | gemini), `test` command
    scripts/key_sprite.py        magenta key → transparent, trimmed PNG
    scripts/gen_sprites.py       sprites.tsv → gen/sprites/<name>.png
    scripts/profile.mjs          show | get | set | done | reset
    scripts/build.mjs            story.json + timing.json → build/
    scripts/render.mjs           build/ → renders/*.mp4
    scripts/still.mjs            contact sheet of chosen times
    scripts/check.mjs            review gate
    lib/brand.mjs  lib/profile.mjs  lib/icons.mjs  lib/story.mjs
    engine/layout.mjs  engine/motion.mjs  engine/captions.mjs
    engine/runtime.mjs  engine/page.html  engine/style.css
    examples/etf-vs-stock/{script.md,story.json,sprites.tsv,gen/sprites/*.png}
  tests/
    py/…  node/…  fixtures/mini/{script.md,story.json,timing.json}  fixtures/fake_image_cli.py
```

Shared data shapes (used across tasks):

```
Line     {id:"l01", text:str, tokens:[str]}                      # tokens = text split on spaces
Timing   {estimated:bool, duration:float, match:float,
          lines:[{id, text, t0, t1, ratio, tokens:[{text,t0,t1}]}]}
Words    {duration:float, words:[{w:str, t0:float, t1:float}]}
Rect     {x, y, w, h}                                            # canvas px
Resolved {slug, width:1080, height:1920, fps:30, duration, voiceEnd, estimated,
          scenes:[{id,t0,t1,layout,bg, headline?:{text,t},
                   items:[{id,type,…,t,exitT?,rect:Rect,enter,idle,seed:int}],
                   marks:[{type,t,…}]}],
          captions:[{t0,t1,text,highlight:bool,bg}],
          endCard:{t0,t1,handle,logo,disclaimer}}
Profile  {version:1, onboarded_at:str|null, display_name:"พี่เอม", handle, logo, disclaimer, audience, tone,
          image_cli:"codex"|"gemini"|null, image_cmd:str|null, projects_dir}
```

---

### Task 1: Repository scaffold, brand tokens, profile, doctor, installer

**Files:**
- Create: `.gitignore`, `LICENSE` (MIT, holder "P.AIM Reel Skill contributors" until the owner names one), `requirements-dev.txt`, `install.sh`
- Create: `skills/paim-reel/{package.json,requirements.txt,brand.json}`, `skills/paim-reel/lib/brand.mjs`, `skills/paim-reel/lib/profile.mjs`, `skills/paim-reel/scripts/profile.mjs`, `skills/paim-reel/scripts/doctor.sh`
- Move: the spec and this plan into `docs/superpowers/`
- Test: `tests/node/brand.test.mjs`, `tests/node/profile.test.mjs`, `tests/node/install.test.mjs`

**Interfaces:**
- Produces: `loadBrand(path?: string): Brand` where `Brand = {name, handle, logo, disclaimer, colors:{orange,green,charcoal,cream}, fonts:{family, fallback, headlineWeight:700, bodyWeight:400}}`; `contrast(hexA: string, hexB: string): number`; `ALLOWED_PAIRS: ReadonlyArray<[fg: string, bg: string]>`; `textColorOn(bg: ColorName): ColorName`; `class BrandError extends Error`.
- Produces `lib/profile.mjs`: `profilePath(): string`; `loadProfile(): Profile | null`; `saveProfile(patch: Partial<Profile>): Profile` (merges into the stored profile, creates the folder, writes atomically; rejects an `image_cli` other than `codex`, `gemini` or `null` and any unknown key with `ProfileError`); `effectiveBrand(brand: Brand, profile: Profile | null): Brand` (the profile's non-empty `handle`, `logo`, `disclaimer` replace the brand's; nothing else changes).
- Produces CLI `scripts/profile.mjs show | get <key> | set <key> <value> | done [--agent claude|codex] | reset --yes`. `done` stamps `onboarded_at` and exits 1, naming what is missing, unless `display_name` and `projects_dir` are set and (for `--agent claude`) `image_cli` is set. `reset` without `--yes` exits 1 and changes nothing.
- Produces: `install.sh [--home <dir>] [--claude] [--codex] [--check]` (no agent flag = both).
- Produces: `scripts/doctor.sh [--agent claude|codex]` (default `claude`, the stricter one). One `ok …`/`MISSING …` line per requirement, then `font: Sukhumvit Set` or `font: IBM Plex Sans Thai (fallback)`, `image-cli: ok <provider>` or `MISSING image-cli (<reason>)`, and `onboarding: done|needed`. Exit 0 only when nothing is MISSING and onboarding is done.

- [ ] **Step 1: `git init`, write `.gitignore`** (`node_modules/`, `.venv/`, `__pycache__/`, `*.mp4`, `*.wav`, `build/`, `renders/`, `frames/`, `.DS_Store`, `*.ttc`, `*.ttf`, `*.otf`).

- [ ] **Step 2: Write `brand.json`**

```json
{
  "name": "P.AIM", "handle": "", "logo": null, "disclaimer": "",
  "colors": {"orange": "#F5820B", "green": "#14856D", "charcoal": "#252B31", "cream": "#FFFAF0"},
  "fonts": {"family": "Sukhumvit Set", "fallback": "IBM Plex Sans Thai", "headlineWeight": 700, "bodyWeight": 400}
}
```

- [ ] **Step 3: Write the failing brand test** (`tests/node/brand.test.mjs`)

```js
test('exact brand colours', () => {
  assert.deepEqual(loadBrand().colors,
    {orange:'#F5820B', green:'#14856D', charcoal:'#252B31', cream:'#FFFAF0'});
});
test('contrast', () => {
  assert.ok(contrast('#252B31', '#FFFAF0') > 13);
  assert.ok(contrast('#F5820B', '#FFFAF0') < 3);
});
test('allowed text pairs are exactly the four and each is >= 4.0', () => {
  assert.deepEqual([...ALLOWED_PAIRS].sort(), [
    ['charcoal','cream'], ['charcoal','orange'], ['cream','charcoal'], ['cream','green']].sort());
  const c = loadBrand().colors;
  for (const [fg, bg] of ALLOWED_PAIRS) assert.ok(contrast(c[fg], c[bg]) >= 4.0);
});
test('textColorOn', () => {
  assert.equal(textColorOn('cream'), 'charcoal'); assert.equal(textColorOn('orange'), 'charcoal');
  assert.equal(textColorOn('charcoal'), 'cream'); assert.equal(textColorOn('green'), 'cream');
});
test('brand.json with a missing colour throws BrandError', …);
```

- [ ] **Step 4: Run `node --test tests/node/brand.test.mjs`** — Expected: FAIL, module not found.
- [ ] **Step 5: Implement `lib/brand.mjs`** (WCAG relative-luminance contrast). Run again — Expected: PASS.

- [ ] **Step 6: Write the failing profile test, then implement `lib/profile.mjs` and `scripts/profile.mjs`.** With `PAIM_CONFIG_DIR` set to a temp dir:

```js
test('no profile yet', () => assert.equal(loadProfile(), null));
test('save merges', () => {
  saveProfile({handle: '@paim'}); const p = saveProfile({image_cli: 'gemini'});
  assert.deepEqual([p.handle, p.image_cli, p.version, p.onboarded_at, p.display_name], ['@paim', 'gemini', 1, null, 'พี่เอม']);
  assert.ok(profilePath().startsWith(process.env.PAIM_CONFIG_DIR));
});
test('rejects a bad provider and an unknown key', () => {
  assert.throws(() => saveProfile({image_cli: 'dalle'}), ProfileError);
  assert.throws(() => saveProfile({password: 'x'}), ProfileError);
});
test('effectiveBrand overrides only non-empty handle, logo, disclaimer', () => {
  const b = effectiveBrand(loadBrand(), {handle: '@paim', logo: '', disclaimer: ''});
  assert.equal(b.handle, '@paim'); assert.equal(b.logo, null); assert.deepEqual(b.colors, loadBrand().colors);
});
test('CLI done', …);    // exits 1 naming image_cli with --agent claude; exits 0 with --agent codex once display_name and projects_dir are set
test('CLI reset needs --yes', …);
```

- [ ] **Step 6b: Write `package.json`** (`"type":"module"`, dependencies `playwright ^1.65.0`, `@phosphor-icons/core ^2.1.1`, `@fontsource/ibm-plex-sans-thai ^5.3.0`) and `requirements.txt` (`faster-whisper`, `numpy`, `pillow`); `requirements-dev.txt` (`pytest`).

- [ ] **Step 7: Write the failing installer test** (`tests/node/install.test.mjs`): run `./install.sh --home <tmp> ` with env `PAIM_SKIP_DEPS=1`; assert `<tmp>/.claude/skills/paim-reel` and `<tmp>/.codex/skills/paim-reel` are symlinks resolving to `skills/paim-reel`; run with `--claude` only into a second tmp and assert the Codex link is absent; running twice exits 0; if the target exists and is not our symlink, exit 1 and leave it untouched.

- [ ] **Step 8: Implement `install.sh` and `scripts/doctor.sh`.**
  `install.sh` without `PAIM_SKIP_DEPS`: `npm ci` (or `npm install` when no lockfile) in `skills/paim-reel`, `npx playwright install chromium`, create `.venv` with `uv venv --python 3.12` (fallback `python3 -m venv`, refusing Python outside 3.10–3.12), install `requirements.txt`, then link. `--check` runs `doctor.sh` only.
  `doctor.sh` checks: node ≥ 20, ffmpeg, ffprobe, `node_modules/playwright`, Chromium installed, `.venv/bin/python` importing `faster_whisper` and `PIL`, the font file `/System/Library/Fonts/Supplemental/SukhumvitSet.ttc`, the image CLI (provider from the profile, or `codex` under `--agent codex`; found with `command -v`, honouring `image_cmd`), and `onboarded_at`.
  Doctor test (in `install.test.mjs`), with a temp `PATH` folder holding empty executables: profile `image_cli: codex` + fake `codex` → output has `image-cli: ok codex`; profile `image_cli: gemini` and no `gemini` → `MISSING image-cli (gemini not found)`; no profile under `--agent claude` → `MISSING image-cli (not chosen)` and `onboarding: needed`; no profile under `--agent codex` with fake `codex` → `image-cli: ok codex`.

- [ ] **Step 9: Run** `node --test tests/node/` — Expected: PASS. Run `./install.sh --home "$(mktemp -d)"` for real once, add the test runner with `uv pip install --python skills/paim-reel/.venv/bin/python -r requirements-dev.txt`, then `skills/paim-reel/scripts/doctor.sh` — Expected: every requirement line `ok`, `font: Sukhumvit Set`, and (no profile yet) `onboarding: needed`.

- [ ] **Step 10: Commit** — `chore: scaffold repo, brand tokens, profile, installer and doctor`.

---

### Task 2: Script format and timing (estimate + align)

**Files:**
- Create: `skills/paim-reel/scripts/paim_script.py`, `skills/paim-reel/scripts/timing.py`
- Test: `tests/py/test_script.py`, `tests/py/test_timing.py`, `tests/py/conftest.py` (adds `skills/paim-reel/scripts` to `sys.path`)

**Interfaces:**
- Produces: `parse_script(text: str) -> list[Line]`; `base_len(s: str) -> int` (characters excluding whitespace and Thai combining marks U+0E31, U+0E34–U+0E3A, U+0E47–U+0E4E); `long_tokens(lines, limit: int = 14) -> list[tuple[str, str]]`; `class ScriptError(ValueError)`.
- Produces: `estimate(lines, char_sec=0.08, line_gap=0.30, lead_in=0.25) -> Timing`; `align(lines, words: list[dict], duration: float) -> Timing`.
- Produces CLI: `timing.py estimate <project>` and `timing.py align <project>` read `<project>/script.md` (and `voice/words.json`), write `<project>/timing.json`. Exit 2 with the offending lines on: any token over 14 base chars; `align` overall `match < 0.60`. `align` prints every line with `ratio < 0.50` as `LOW l04 0.31 <text>` even when it exits 0.

`script.md` format: lines matching `^l\d{2,}:\s*(.+)$` are spoken lines; everything else (headings, blanks, `>` notes) is ignored. Spaces inside a line separate caption phrases.

- [ ] **Step 1: Write failing parser tests**

```python
SRC = "# ETF กับหุ้น\n\n> note\nl01: ETF กับหุ้น ต่างกันยังไง\nl02: หุ้นคือ การซื้อ บริษัทเดียว\n"
def test_parse():
    lines = parse_script(SRC)
    assert [l["id"] for l in lines] == ["l01", "l02"]
    assert lines[0]["tokens"] == ["ETF", "กับหุ้น", "ต่างกันยังไง"]
def test_duplicate_id_raises():  # "l01: ก\nl01: ข" -> ScriptError
def test_no_lines_raises():      # "# only a title" -> ScriptError
def test_base_len():
    assert base_len("ที่") == 1 and base_len("น้ำ") == 2 and base_len("ETF กับ") == 5
def test_long_tokens():
    assert long_tokens(parse_script("l01: " + "ก" * 15 + " ข")) == [("l01", "ก" * 15)]
    assert long_tokens(parse_script("l01: " + "ก" * 14 + " ข")) == []
```

- [ ] **Step 2: Run** `skills/paim-reel/.venv/bin/python -m pytest tests/py/test_script.py -v` — Expected: FAIL (import error).
- [ ] **Step 3: Implement `paim_script.py`.** Run — Expected: PASS.

- [ ] **Step 4: Write failing timing tests**

```python
L1 = parse_script("l01: ETF กับหุ้น ต่างกันยังไง\nl02: กขค งจ")
W = [dict(w="ETF",t0=0.30,t1=0.80), dict(w="กับ",t0=0.80,t1=1.00), dict(w="หุ้น",t0=1.00,t1=1.40),
     dict(w="ต่างกัน",t0=1.50,t1=2.00), dict(w="ยังไง",t0=2.00,t1=2.50),
     dict(w="กขค",t0=3.00,t1=3.60), dict(w="งจ",t0=3.60,t1=4.00)]

def test_estimate_exact():
    t = estimate(parse_script("l01: กขค งจ"))
    tk = t["lines"][0]["tokens"]
    assert t["estimated"] is True
    assert [round(x, 2) for x in (tk[0]["t0"], tk[0]["t1"], tk[1]["t0"], tk[1]["t1"])] == [0.25, 0.49, 0.49, 0.65]
    assert round(t["duration"], 2) == 0.90
def test_estimate_line_gap():   # second line t0 == first line t1 + 0.30
def test_align_token_times():
    t = align(L1, W, 4.3)
    tk = t["lines"][0]["tokens"]
    assert abs(tk[0]["t0"] - 0.30) < 0.05 and abs(tk[1]["t0"] - 0.80) < 0.05 and abs(tk[2]["t0"] - 1.50) < 0.05
    assert abs(t["lines"][0]["t1"] - 2.50) < 0.05 and abs(t["lines"][1]["t0"] - 3.00) < 0.05
    assert t["estimated"] is False and t["match"] > 0.95
def test_align_tolerates_misspelling():   # W with "หุน" instead of "หุ้น": match >= 0.9, token t0 within 0.10
def test_align_monotonic():               # every token t0 < t1, t0 non-decreasing across the whole file, last t1 <= duration
def test_align_skipped_line_is_low():     # W without the l02 words: lines[1]["ratio"] < 0.5
def test_align_wrong_audio():             # words from unrelated Thai text: match < 0.60
def test_cli_align_wrong_audio_exit_2(tmp_path):  # subprocess; returncode == 2; no timing.json written
def test_cli_long_token_exit_2(tmp_path): # estimate on a 15-char token; returncode == 2; message names l01
```

- [ ] **Step 5: Run** — Expected: FAIL.

- [ ] **Step 6: Implement `timing.py`.** `estimate`: token length = `base_len(token) * char_sec`, tokens contiguous inside a line, `line_gap` between lines, `duration = last t1 + lead_in`, `match = 1.0`, `ratio = 1.0`. `align` is not determined by its signature, so use this algorithm:

```
norm(s)  = lowercase, drop whitespace and punctuation (keep Thai letters and marks, Latin, digits)
S        = norm of all script lines concatenated; remember (line, token) of every char
R        = norm of all recognised words concatenated; each char gets a time spread
           evenly across its word's [t0, t1] (char k of n: t0 + k*(t1-t0)/n; end = next step)
blocks   = difflib.SequenceMatcher(None, S, R, autojunk=False).get_matching_blocks()
matched script chars take R's start/end time; unmatched ones are linearly interpolated
between the nearest matched neighbours (before the first: from 0; after the last: to duration)
token.t0 = start of its first char; token.t1 = end of its last char; line.t0/t1 likewise
then force non-decreasing t0 and t1 >= t0 + 0.04 across the file, clamp to duration
ratio(line) = matched chars / chars in the line;  match = matched chars / len(S)
```

- [ ] **Step 7: Run** `…/python -m pytest tests/py -v` — Expected: PASS.
- [ ] **Step 8: Commit** — `feat: script parser, estimated timing and script-to-voice alignment`.

---

### Task 3: Voice preparation and transcription

**Files:**
- Create: `skills/paim-reel/scripts/prep_voice.py`, `skills/paim-reel/scripts/transcribe.py`
- Test: `tests/py/test_prep_voice.py`, `tests/py/test_transcribe.py`

**Interfaces:**
- Consumes: `Line`/`Words` shapes; `parse_script` is not needed here.
- Produces: `prep(src: Path, project: Path) -> float` (duration in seconds; writes `<project>/voice/voice.wav`); `class VoiceError(Exception)`; CLI `prep_voice.py <audio> <project>` (exit 2 on `VoiceError`, prints `WARN longer than 90 s` above 90 s).
- Produces: `chunk_bounds(samples: np.ndarray, sr: int = 16000, min_chunk: float = 12.0) -> list[float]`; CLI `transcribe.py <project>` writes `<project>/voice/words.json` (`Words`), and writes `<project>/script.draft.md` (one `lNN:` line per recognised segment) only when `script.md` is absent. Model from env `PAIM_WHISPER_MODEL`, default `large-v3`, `device="cpu"`, `compute_type="int8"`, `language="th"`.

- [ ] **Step 1: Write failing prep tests.** A fixture builds audio with ffmpeg (`sine` 1 s, `anullsrc` 3 s, `sine` 1 s; stereo 44.1 kHz AAC) into `tmp_path / "เสียง ทดสอบ.m4a"`.

```python
def test_prep_output_format(tone_gap_tone, tmp_path):
    d = prep(tone_gap_tone, tmp_path / "p")
    info = ffprobe(tmp_path / "p/voice/voice.wav")
    assert info["channels"] == 1 and info["sample_rate"] == 48000 and info["codec_name"] == "pcm_s16le"
    assert 2.5 <= d <= 3.1          # 0.25 lead-in + 1 + 0.45 pause + 1, the 3 s gap is gone
def test_prep_peak(…):              # ffmpeg volumedetect max_volume <= -1.0 dB
def test_prep_keeps_short_pause(…): # a 0.4 s gap is kept: duration >= 2.5 for 1 s + 0.4 s + 1 s
def test_prep_mov_with_video(…):    # a .mov with a video stream is accepted
def test_prep_silent_raises(…):     # 3 s of anullsrc -> VoiceError matching "no speech"
def test_prep_missing_file_raises(…)  # VoiceError naming the path
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement `prep_voice.py`** with ffmpeg called through `subprocess` with list arguments (never a shell string, so spaces and Thai names survive): downmix to mono 48 kHz, trim head/tail silence leaving 0.25 s lead-in, shorten any pause longer than 0.45 s to 0.45 s (threshold −45 dB; as built, a single ffmpeg `silenceremove` pass cannot express a two-threshold rule), trim trailing silence to 0.15 s, then `loudnorm` to −14 LUFS with true peak −1 dBFS followed by a limiter. Raise `VoiceError("no speech …")` when less than 1.0 s remains.
- [ ] **Step 4: Run** — Expected: PASS.

- [ ] **Step 5: Write failing transcribe tests**

```python
def test_chunk_bounds_cuts_only_in_silence():
    sr = 16000; tone = np.sin(np.arange(13 * sr) * 0.05).astype("float32"); gap = np.zeros(sr, "float32")
    b = chunk_bounds(np.concatenate([tone, gap, tone, gap, tone]), sr)
    assert b[0] == 0.0 and abs(b[-1] - 41.0) < 0.01 and len(b) == 4
    assert all(13.0 <= x <= 14.0 or 27.0 <= x <= 28.0 for x in b[1:-1])
def test_chunk_bounds_short_audio():      # 5 s of tone -> [0.0, 5.0]
@pytest.mark.skipif(not os.environ.get("PAIM_RUN_WHISPER") or not shutil.which("say"), reason="opt-in")
def test_transcribe_cli(tmp_path):        # `say -v Kanya` a Thai sentence -> prep -> transcribe with PAIM_WHISPER_MODEL=tiny
    # words.json has >= 3 words, t0 non-decreasing, last t1 <= duration; script.draft.md exists
    # run again after creating script.md: script.draft.md is not rewritten
```

- [ ] **Step 6: Run** — Expected: FAIL.
- [ ] **Step 7: Implement `transcribe.py`.** Decode with ffmpeg to float32 16 kHz and pass samples (not a path) to faster-whisper. Transcribe chunk by chunk between `chunk_bounds` with `word_timestamps=True, vad_filter=True, condition_on_previous_text=False, temperature=[0.0, 0.2, 0.4], no_repeat_ngram_size=4` and add each chunk's offset to its word times. One long call can loop forever on a Thai take; chunking is what prevents it.
- [ ] **Step 8: Run** `…/python -m pytest tests/py -v`, then once `PAIM_RUN_WHISPER=1 …/python -m pytest tests/py/test_transcribe.py -v` — Expected: PASS both.
- [ ] **Step 9: Commit** — `feat: voice preparation and chunked local transcription`.

---

### Task 4: Icons, story validation and anchor resolution

**Files:**
- Create: `skills/paim-reel/lib/icons.mjs`, `skills/paim-reel/lib/story.mjs`, `skills/paim-reel/engine/layout.mjs`, `skills/paim-reel/engine/captions.mjs`
- Create: `tests/fixtures/mini/{script.md,story.json,timing.json}`
- Test: `tests/node/icons.test.mjs`, `tests/node/layout.test.mjs`, `tests/node/story.test.mjs`, `tests/node/captions.test.mjs`

**Interfaces:**
- Consumes: `loadBrand`, `textColorOn` (Task 1); `Timing` (Task 2).
- Produces `engine/layout.mjs`: constants `W=1080, H=1920, FPS=30, END_CARD=2.0`, `SAFE={x0:70,y0:220,x1:1010,y1:1500}`, `RIGHT_UI={x0:930,y0:1000,x1:1080,y1:1920}`, `HEADLINE={x:90,y:240,w:900,h:170}`, `CONTENT={x:90,y:440,w:900,h:720}`, `CAPTION={x:180,y:1250,w:720,h:230}`; `CAPACITY={center:1,row:3,stack:3,versus:2,grid:6}`; `slotRect(layout: string, count: number, slot: number): Rect`.
- Produces `lib/icons.mjs`: `iconSvg(name: string, weight: 'fill'|'duotone' = 'fill'): string`; `suggestIcons(name: string, n = 5): string[]`; `class IconError extends Error`.
- Produces `lib/story.mjs`: `resolveAnchor(anchor: string, timing: Timing): number`; `validateStory(story: object, timing: Timing, brand: Brand, assets: {sprites: string[]} = {sprites: []}): Resolved`; `class StoryError extends Error { problems: string[] }`.
- Produces `engine/captions.mjs`: `buildCaptions(timing, highlight: string[], sceneBgAt: (t:number)=>string): Caption[]`; `captionAt(captions, t: number): Caption | null`.

Story schema (authoritative; `references/story-json.md` in Task 9 documents exactly this):

```
story  {slug: /^[a-z0-9-]+$/, title: string, music?: string|null, highlight?: Anchor[], scenes: Scene[]}
Scene  {id, from: "lNN", layout: center|row|stack|versus|grid, bg?: cream|charcoal (default cream),
        headline?: {text, at?: Anchor}, items: Item[], marks?: Mark[]}
Item   common: {id, type, at: Anchor, slot?: int (default = index), enter?: pop|drop|slide-l|slide-r|rise|fade (default pop),
                idle?: none|bob|sway|pulse (default none), exit?: Anchor, x?, y?, size?}
       sprite: {sprite: /^[a-z0-9-]+$/, label?: string}        # <project>/gen/sprites/<sprite>.png
       icon:   {icon: phosphor-name, weight?: fill|duotone, color: orange|green|charcoal|cream, label?: string}
       pill:   {text, bg: orange|green|charcoal}
       number: {to: number, from?: 0, decimals?: 0, prefix?: "", suffix?: "", color, label?, source: non-empty string}
       bar:    {value: 0..1, color, label?}
Mark   arrow: {type, from: itemId, to: itemId, at}   ring: {type, on: itemId, at}   cross: {type, on: itemId, at}
Anchor "l05" (line start) | "l05@2" (0-based phrase index) | either + "+0.2" / "-0.1" seconds
```

Resolution rules: scene `t0` = `resolveAnchor(from)`, except the first scene which is 0; scene `t1` = next scene's `t0`; last scene ends at `timing.duration` (`voiceEnd`); `duration = voiceEnd + END_CARD`. Item `rect`: when `x` and `y` are given they are the item's centre in canvas px and `size` its box side (default 240), and the item takes no slot; otherwise `slotRect(layout, n, slot)` where `n` counts only the scene's items without an override. Layout capacity applies to `n`. `seed` = index of the item in the whole story. A caption runs from its token's `t0` to the next token's `t0` in the same line; a line's last token runs to `min(line.t1 + 0.40, next line t0)`, or `min(line.t1 + 0.40, voiceEnd)` for the last line, so no caption shows over the end card.

- [ ] **Step 1: Write failing layout tests**

```js
test('center slot is centred in CONTENT', () => {
  const r = slotRect('center', 1, 0);
  assert.equal(r.x + r.w / 2, 540); assert.equal(r.y + r.h / 2, 800);
});
test('row slots do not overlap and stay inside CONTENT', …);   // count 2 and 3
test('versus: slot 0 above y=800, slot 1 below', …);
test('grid 6 = 2 columns x 3 rows, no overlaps', …);
test('slot >= count or count > CAPACITY throws RangeError', …);
```

- [ ] **Step 2: Write failing icon tests**

```js
test('known icon', () => assert.match(iconSvg('piggy-bank'), /^<svg/));
test('duotone', () => assert.match(iconSvg('coins', 'duotone'), /<svg/));
test('unknown icon suggests names', () =>
  assert.throws(() => iconSvg('pigy-bank'), e => e instanceof IconError && /piggy-bank/.test(e.message)));
test('brand logos are refused', () =>
  assert.throws(() => iconSvg('amazon-logo'), e => e instanceof IconError && /brand/i.test(e.message)));
```

- [ ] **Step 3: Write the fixture and failing story tests.** Fixture `tests/fixtures/mini`: `script.md` = `l01: หุ้นคือ บริษัทเดียว` / `l02: ETF คือ ตะกร้าหุ้น`; `timing.json` = `estimated:true, duration:3.0`, l01 0.25–1.30 (tokens 0.25, 0.80), l02 1.60–2.75 (tokens 1.60, 1.95, 2.30); `story.json` = one `versus` scene from `l01` with icon `buildings` (orange, label `หุ้น`, at `l01`) and icon `basket` (green, label `ETF`, at `l02`), `highlight: ["l02@2"]`.

```js
test('anchors', () => {
  assert.equal(resolveAnchor('l02', T), 1.60);
  assert.equal(resolveAnchor('l02@1', T), 1.95);
  assert.ok(Math.abs(resolveAnchor('l02@1+0.2', T) - 2.15) < 1e-9);
  assert.throws(() => resolveAnchor('l09', T), /l09/);
  assert.throws(() => resolveAnchor('l02@7', T), /l02@7/);
  assert.throws(() => resolveAnchor('02', T), /anchor/i);
});
test('resolves the mini story', () => {
  const r = validateStory(S, T, loadBrand());
  assert.equal(r.duration, 5.0); assert.equal(r.voiceEnd, 3.0); assert.equal(r.estimated, true);
  assert.equal(r.scenes[0].t0, 0); assert.equal(r.scenes[0].t1, 3.0);
  assert.equal(r.scenes[0].items[1].t, 1.60);
  assert.deepEqual(r.endCard.t0, 3.0);
  assert.equal(r.captions.length, 5); assert.equal(r.captions[4].highlight, true);
});
test('reports every problem at once', () => {
  const bad = structuredClone(S);
  bad.scenes[0].items[0].icon = 'pigy-bank';
  bad.scenes[0].items[1].icon = 'google-logo';
  bad.scenes[0].items[1].at = 'l05';
  bad.scenes[0].items.push({id:'n', type:'number', to:7, suffix:'%', color:'green', at:'l02'});  // no source; 3 items > versus capacity
  assert.throws(() => validateStory(bad, T, loadBrand()), e =>
    e instanceof StoryError && e.problems.length >= 5 &&
    e.problems.some(p => /piggy-bank/.test(p)) && e.problems.some(p => /brand/i.test(p)) &&
    e.problems.some(p => /l05/.test(p)) && e.problems.some(p => /source/.test(p)) &&
    e.problems.some(p => /versus/.test(p)));
});
test('sprite must have been generated', () => {
  const sp = structuredClone(S);
  sp.scenes[0].items[1] = {id: 'b', type: 'sprite', sprite: 'basket', label: 'ETF', at: 'l02'};
  assert.throws(() => validateStory(sp, T, loadBrand()), e => e.problems.some(p => /basket/.test(p) && /gen_sprites\.py/.test(p)));
  assert.equal(validateStory(sp, T, loadBrand(), {sprites: ['basket']}).scenes[0].items[1].sprite, 'basket');
});
test('other rejections, one each', …);
// duplicate item id in a scene; item `at` outside its scene; scenes out of time order; first scene not from the first line;
// mark pointing at an unknown item; unknown enum value; slug with spaces; number.source = "  "; bar.value = 1.2
```

- [ ] **Step 4: Write failing caption tests** — on the mini timing: `captionAt(c, 0.10) === null`; `captionAt(c, 0.30).text === 'หุ้นคือ'`; `captionAt(c, 0.85).text === 'บริษัทเดียว'`; the l01 last caption ends at `min(1.30 + 0.40, 1.60) = 1.60`; the final caption ends at `min(2.75 + 0.40, 3.0) = 3.0`; captions never overlap in time.

- [ ] **Step 5: Run** `node --test tests/node/` — Expected: the new tests FAIL.
- [ ] **Step 6: Implement** `engine/layout.mjs`, `lib/icons.mjs` (read from `node_modules/@phosphor-icons/core/assets/<weight>/<name>-<weight>.svg`; suggestions by edit distance over the directory listing; if a name used in a fixture is absent from the installed set, swap in the nearest generic one in the fixture and its tests), `engine/captions.mjs`, `lib/story.mjs` (collect all problems, then throw once).
- [ ] **Step 7: Run** `node --test tests/node/` — Expected: PASS.
- [ ] **Step 8: Commit** — `feat: story schema, anchors, layouts, icons and captions`.

---

### Task 5: Image CLI adapter, sprite keying, sprite generation

**Files:**
- Create: `skills/paim-reel/scripts/image_cli.py`, `skills/paim-reel/scripts/key_sprite.py`, `skills/paim-reel/scripts/gen_sprites.py`
- Create: `tests/fixtures/fake_image_cli.py`
- Test: `tests/py/test_key_sprite.py`, `tests/py/test_image_cli.py`, `tests/py/test_gen_sprites.py`

**Interfaces:**
- Consumes: `Profile` (read straight from `profile.json`; Python never writes it).
- Produces `image_cli.py`: `class ImageCliError(Exception)`, `class QuotaError(ImageCliError)`; `STYLE: str`, `ASK: str`; `load_profile() -> dict | None`; `resolve_provider(profile: dict | None, agent: str) -> str`; `build_command(provider: str, ask: str, folder: Path, profile: dict | None = None) -> list[str]`; `generate(provider: str, folder: Path, filename: str, subject: str, size: str = "1024x1024", wait: int = 300, profile: dict | None = None) -> Path`; CLI `image_cli.py test [--agent claude|codex]` draws `<config dir>/test/sample.png` (subject "a shopping basket holding three coins"), keys it, prints the keyed path; exit 2 with one plain sentence on any `ImageCliError`.
- Produces `key_sprite.py`: `key(raw: Path, out: Path) -> dict` returning `{"size": (w, h), "opaque": float, "on_palette": float}`; `class KeyFailed(Exception)`.
- Produces CLI `gen_sprites.py <project> [--only a,b] [--parallel 2] [--agent claude|codex]` (agent default `claude`): reads `<project>/sprites.tsv` (`name<TAB>subject`, `#` comments), writes `<project>/gen/sprites/<name>-raw.png`, `<name>.png`, `<name>.log`. Prints `OK <name>`, `SKIP <name>` (keyed file exists), `FAIL <name> (<log path>)`, `OFF-PALETTE <name> 0.62` (when `on_palette < 0.80`; the file is still kept). Exit 0 when every row has a keyed PNG, 1 on any FAIL, 2 on a bad row (name not matching `^[a-z0-9-]+$`, empty subject), 3 on `QuotaError` (prints `QUOTA …` once and stops starting new rows).

Fixed text (exact; the spec pins the look):

```python
STYLE = ("Style: flat vector sticker illustration, bold simple rounded shapes, thick even outline in charcoal #252B31, "
         "flat fills using only orange #F5820B, green #14856D, charcoal #252B31, cream #FFFAF0 and white. "
         "No gradients, no shading, no texture, no drop shadow. ONE single isolated object, centred, the whole object "
         "visible with generous space around it. The background is a perfectly flat, uniform pure magenta (#FF00FF) "
         "with no texture, no shadow and no gradient. Never use magenta or pink inside the object. "
         "No text, no letters, no numbers, no logos, no brand marks, no real people.")
ASK = ("Use your image generation tool to create ONE square image, {size}. Then save the resulting PNG into the "
       "current directory as {filename}. Do nothing else.\n\nImage prompt: {subject}. {style}")
```

Commands (verified against `codex-cli 0.157` and `gemini 0.67` on 2026-11-16): codex → `["codex", "exec", "--skip-git-repo-check", "-s", "workspace-write", "-C", str(folder), ask]`; gemini → `["gemini", "-p", ask, "--yolo", "--skip-trust"]` run with `cwd=folder` (as built: without `--skip-trust` the Gemini CLI switches YOLO off in a folder it does not trust, so it could not save the image; and free personal Google accounts are refused by the Gemini CLI itself, so they are served by the Antigravity CLI, `agy`, set as `image_cmd`). When env `PAIM_IMAGE_CMD` or `profile["image_cmd"]` is set (env wins), the command is `shlex.split(that) + ["-p", ask]` with `cwd=folder`, whatever the provider. Always `stdin=subprocess.DEVNULL` (a CLI that reads stdin swallows the rest of a batch).

`generate` behaviour: run the command with stdout and stderr to `<folder>/<stem>.log`; then wait up to `wait` seconds for the file, polling every 2 s, because Gemini hands drawing to a sub-agent and the file can appear after the command returns. Log containing `RESOURCE_EXHAUSTED`, `QUOTA_EXHAUSTED` or `usage limit` → `QuotaError` at once, no retry. Log containing `429` and no file → retry, at most 3 attempts, sleeping `attempt × PAIM_IMAGE_BACKOFF` seconds (default 45). Command not found → `ImageCliError` whose message contains the provider's install line (`npm install -g @openai/codex` / `npm install -g @google/gemini-cli`). No file after `wait` → `ImageCliError` naming the log path.

Keying algorithm (not determined by the signature):

```
if more than 5% of pixels already have alpha < 128: keep the generator's alpha
else: m = min(R, B) - G                 # how magenta a pixel is
      alpha = 1 - clip((m - 25) / 55, 0, 1)
      where 0 < alpha < 1, recover the object's colour: C = clip((P - (1 - alpha) * (255, 0, 255)) / alpha, 0, 255)
opaque = mean(alpha > 0.5); raise KeyFailed if opaque < 0.02 or opaque > 0.90
trim to the bounding box of alpha > 0.05, plus 8 px
on_palette = share of opaque pixels within Euclidean RGB distance 60 of orange, green, charcoal, cream or white
```

- [ ] **Step 1: Write failing key tests.** Build inputs with Pillow in the test: 512×512 magenta, an orange disc (radius 120, centre 200,256) and a green `#14856D` square (100 px, centre 380,256).

```python
def test_key_magenta(tmp_path):
    info = key(raw, out); im = Image.open(out)
    assert im.mode == "RGBA" and 340 <= im.width <= 380 and 240 <= im.height <= 270   # bbox 350 x 240, plus 8 px each side
    assert im.getpixel((0, 0))[3] == 0
    r, g, b, a = im.getpixel((308, 128))                  # centre of the green square: (380 - 72, 256 - 128) after the trim
    assert a == 255 and abs(r - 0x14) < 12 and abs(g - 0x85) < 12 and abs(b - 0x6D) < 12
    assert info["on_palette"] >= 0.95 and 0.02 < info["opaque"] < 0.90
def test_key_keeps_real_alpha(…):     # transparent-background input: alpha channel unchanged, still trimmed
def test_key_all_background(…):       # plain magenta -> KeyFailed
def test_key_no_background(…):        # plain orange, no magenta -> KeyFailed (opaque > 0.90)
def test_off_palette(…):              # a blue #2040FF disc -> on_palette < 0.2
```

- [ ] **Step 2: Run** `…/python -m pytest tests/py/test_key_sprite.py -v` — Expected: FAIL. **Step 3: Implement `key_sprite.py`.** Run — Expected: PASS.

- [ ] **Step 4: Write the fake CLI** `tests/fixtures/fake_image_cli.py`: takes `-p PROMPT`, finds the file name after `current directory as `, appends one line to `$FAKE_CALLS`, and acts on `$FAKE_MODE`: `ok` writes the magenta+orange test image; `late` returns at once and writes it 3 s later from a detached child; `quota` prints `RESOURCE_EXHAUSTED`; `nothing` prints `done`; `429-once` prints `429 Too Many Requests` on the first call and behaves as `ok` afterwards; `reads-stdin` consumes stdin, then behaves as `ok`.

- [ ] **Step 5: Write failing adapter and batch tests** (all with `PAIM_IMAGE_CMD=<python> tests/fixtures/fake_image_cli.py`, `PAIM_IMAGE_BACKOFF=0`, `PAIM_CONFIG_DIR=tmp`)

```python
def test_commands_exact():
    assert build_command("codex", "A", Path("/p")) == ["codex", "exec", "--skip-git-repo-check", "-s", "workspace-write", "-C", "/p", "A"]
    assert build_command("gemini", "A", Path("/p")) == ["gemini", "-p", "A", "--yolo", "--skip-trust"]
    # with PAIM_IMAGE_CMD="agy --dangerously-skip-permissions": ["agy", "--dangerously-skip-permissions", "-p", "A"]
def test_resolve_provider():
    assert resolve_provider(None, "codex") == "codex"
    assert resolve_provider({"image_cli": "gemini"}, "claude") == "gemini"
    with pytest.raises(ImageCliError, match="onboarding"): resolve_provider(None, "claude")
    with pytest.raises(ImageCliError, match="onboarding"): resolve_provider({"image_cli": None}, "claude")
def test_prompt_carries_the_brand():
    for needle in ("#F5820B", "#14856D", "#252B31", "#FFFAF0", "#FF00FF", "no logos", "no real people"): assert needle in STYLE
def test_generate_ok(…):              # file exists, exactly 1 call
def test_generate_late_file(…):       # FAKE_MODE=late, wait=10 -> file exists
def test_generate_quota_no_retry(…):  # QuotaError, exactly 1 call
def test_generate_429_retries(…):     # FAKE_MODE=429-once -> file exists, exactly 2 calls
def test_generate_nothing(…):         # wait=3 -> ImageCliError containing the .log path
def test_generate_not_installed(…):   # PAIM_IMAGE_CMD unset, provider "gemini", PATH without gemini -> ImageCliError containing "npm install -g @google/gemini-cli"
def test_batch(tmp_path):             # sprites.tsv with basket, coin, piggy -> exit 0, three keyed PNGs, 3 calls
def test_batch_rerun_skips(…):        # second run: 0 new calls, three SKIP lines
def test_batch_only(…):               # --only coin -> 1 call
def test_batch_stdin_not_swallowed(…) # FAKE_MODE=reads-stdin -> still three PNGs
def test_batch_quota(…):              # exit 3, one QUOTA line, no further calls after the first failure
def test_batch_bad_name(…):           # row "Basket!\tx" -> exit 2, 0 calls
def test_batch_no_provider(…):        # no profile, --agent claude, PAIM_IMAGE_CMD unset -> exit 2, message contains "onboarding"
@pytest.mark.skipif(not os.environ.get("PAIM_RUN_IMAGE"), reason="opt-in, spends image quota")
def test_real_provider_draws(…):      # image_cli.py test for the provider in the real profile -> a keyed PNG, on_palette >= 0.6
```

- [ ] **Step 6: Run** — Expected: FAIL. **Step 7: Implement `image_cli.py` and `gen_sprites.py`** (a thread pool of `--parallel` workers; default 2).
- [ ] **Step 8: Run** `…/python -m pytest tests/py -v` — Expected: PASS.
- [ ] **Step 9: Real smoke, both providers, once each.** With the owner's own signed-in CLIs: `PAIM_RUN_IMAGE=1` and a temp profile set to `codex`, then to `gemini`. Look at both stickers. If the Gemini CLI returns no image (it may need an image extension), record exactly what it printed, make `image_cli.py test` turn that into the sentence "Gemini CLI on this machine cannot draw yet: <what to do>", and note the finding for `references/onboarding.md` (Task 10). Do not paper over it.
- [ ] **Step 10: Commit** — `feat: image CLI adapter, magenta keying and sprite generation`.

---

### Task 6: Motion functions and browser runtime

**Files:**
- Create: `skills/paim-reel/engine/motion.mjs`, `skills/paim-reel/engine/runtime.mjs`, `skills/paim-reel/engine/page.html`, `skills/paim-reel/engine/style.css`
- Test: `tests/node/motion.test.mjs`

**Interfaces:**
- Consumes: `Resolved`, layout constants, `captionAt`.
- Produces `engine/motion.mjs`: `ENTER_DUR=0.40`, `EXIT_DUR=0.20`; `enterState(kind: string, p: number): {opacity, dx, dy, scale, rot}`; `idleState(kind: string, tSince: number, seed: number): {dx, dy, scale, rot}`; `itemState(item, t: number): {visible: boolean, opacity, dx, dy, scale, rot}`; `progress(t, t0, dur): number` (clamped 0..1); `numberAt(item, t): string` (count-up over 0.8 s from `item.t`, formatted with `decimals`, `prefix`, `suffix`); `barAt(item, t): number` (0 → `value` over 0.6 s).
- Produces in the page: `window.__paim = { ready: Promise<void>, duration: number, seek(t: number): void, fontUsed(): string, textBoxes(): Array<{kind:'caption'|'headline'|'label'|'pill'|'number'|'endcard', text, rect: Rect, clipped: boolean}> }`. The page reads its data from `window.__PAIM_DATA = {resolved, brand, icons: {"name:weight": svg}, fallbackFontUrls: {"400": [{url, unicodeRange}], "700": [{url, unicodeRange}]}, forceFallback?: boolean}` (as built: one font file per weight, each with its Thai and Latin subsets; icons are keyed by name and weight).

Motion values (start state at `p = 0`; all end at identity; opacity reaches 1 at `p = 0.4`): `pop` scale 0 with back-overshoot (peaks above 1), `drop` dy −420, `slide-l` dx −520, `slide-r` dx +520, `rise` dy +260, `fade` opacity only. Idle: `bob` dy = 10·sin(2π·t/2.4 + seed), `sway` rot = 3°·sin(2π·t/3.0 + seed), `pulse` scale = 1 + 0.04·sin(2π·t/1.6 + seed).

- [ ] **Step 1: Write failing motion tests**

```js
const it = {t: 1.0, enter: 'pop', idle: 'none', seed: 3};
test('hidden before its time', () => assert.equal(itemState(it, 0.99).visible, false));
test('settled after ENTER_DUR', () => {
  const s = itemState(it, 1.0 + ENTER_DUR);
  assert.deepEqual([s.visible, s.opacity, s.dx, s.dy, s.rot], [true, 1, 0, 0, 0]);
  assert.ok(Math.abs(s.scale - 1) < 1e-9);
});
test('pop overshoots', () => assert.ok(enterState('pop', 0.7).scale > 1));
test('start offsets', () => {
  assert.equal(enterState('drop', 0).dy, -420); assert.equal(enterState('slide-l', 0).dx, -520);
  assert.equal(enterState('slide-r', 0).dx, 520); assert.equal(enterState('rise', 0).dy, 260);
});
test('deterministic', () => assert.deepEqual(itemState({...it, idle:'bob'}, 2.345), itemState({...it, idle:'bob'}, 2.345)));
test('bob stays within 10 px', …);
test('exit: fading during EXIT_DUR, gone after', …);          // exitT: 2.0 -> visible at 2.1 with opacity 0.5, not visible at 2.2
test('numberAt', () => {
  const n = {t: 1, from: 0, to: 7.5, decimals: 1, prefix: '', suffix: '%'};
  assert.equal(numberAt(n, 0.5), '0.0%'); assert.equal(numberAt(n, 1.8), '7.5%'); assert.equal(numberAt(n, 9), '7.5%');
});
test('barAt', …);   // 0 before t, value at t + 0.6
```

- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement `engine/motion.mjs`.** Run — Expected: PASS.

- [ ] **Step 4: Implement the runtime (`runtime.mjs`, `page.html`, `style.css`).** No test in this task; Task 7 exercises it end to end. Requirements:
  - `seek(t)` rebuilds the whole frame from `t` alone: no CSS animations or transitions, no timers, no `Date`, no `Math.random`.
  - Stage is a fixed 1080×1920 element. Cream scenes draw a grid of 108 px cells in charcoal at 6% opacity; charcoal scenes draw it in cream at 6%.
  - Type: headline 96 px/700 on an orange pill (charcoal text); caption 84 px/700, `line-height: 1.4`, centred in `CAPTION`, text colour `textColorOn(scene bg)`, highlighted caption on an orange pill with charcoal text, scale 0.92 → 1 over 0.12 s; item label 52 px/700 under the icon; number 140 px/700; end-card handle and disclaimer 40 px/400.
  - Font stack on every text element: `"Sukhumvit Set", "IBM Plex Sans Thai", sans-serif`; the fallback is declared with `@font-face` from `fallbackFontUrls`, one set of files per weight (400 and 700), each with its Thai and Latin subsets. `ready` resolves after `document.fonts.ready`.
  - `fontUsed()` returns `"Sukhumvit Set"` or `"IBM Plex Sans Thai"` by comparing measured text width against a `monospace`-only baseline; when `__PAIM_DATA.forceFallback` is true the stack omits Sukhumvit Set.
  - Icons are the inlined SVG with `fill` set to the brand colour; item box = its `rect`, transformed by `itemState`.
  - Sprites are `<img src="assets/sprites/<name>.png">` fitted inside the item `rect` (contain, centred), with the label under it like an icon's. `ready` also waits for every image to decode.
  - Marks: `arrow` is an SVG path between the two item rect edges drawn on over 0.3 s (charcoal on cream, cream on charcoal); `ring` an orange ellipse stroke drawn on over 0.3 s; `cross` two strokes in the scene's text colour.
  - End card (`t ≥ endCard.t0`): green background, `ติดตาม` 120 px/700 in cream, then handle, logo and disclaimer when set.
  - When `resolved.estimated`, draw `DRAFT · ยังไม่มีเสียงพูด` at 40 px at y 130-200 (above the headline zone) on every frame (as built after the sound effects were added: a draft has effects but no voice).
  - `textBoxes()` reports each visible text element's bounding rect in canvas px and `clipped = scrollHeight > clientHeight || scrollWidth > clientWidth`.

- [ ] **Step 5: Commit** — `feat: deterministic motion functions and page runtime`.

---

### Task 7: Build, render and stills

**Files:**
- Create: `skills/paim-reel/scripts/build.mjs`, `skills/paim-reel/scripts/render.mjs`, `skills/paim-reel/scripts/still.mjs`, `skills/paim-reel/lib/serve.mjs`
- Test: `tests/node/build.test.mjs`, `tests/node/render.e2e.test.mjs`

**Interfaces:**
- Consumes: `validateStory`, `iconSvg`, `loadBrand`, `loadProfile`, `effectiveBrand`, the page contract `window.__paim`.
- Produces: `buildProject(projectDir: string, opts?: {forceFallback?: boolean}): Promise<{resolved: Resolved, buildDir: string}>` — writes `<project>/build/index.html`, `build/engine/*`, `build/data.js` (sets `window.__PAIM_DATA`), `build/resolved.json`, and copies the fallback font and the logo into `build/assets/`. The brand it uses is `effectiveBrand(loadBrand(), loadProfile())`. It passes `assets.sprites` = the names of `<project>/gen/sprites/*.png` that do not end in `-raw`, and copies the sprites the story uses into `build/assets/sprites/`.
- Produces: `openPage(projectDir): Promise<{page, close(): Promise<void>}>` in `lib/serve.mjs` — serves `build/` from `node:http` on `127.0.0.1` port 0, launches Chromium with a 1080×1920 viewport at device scale 1, awaits `__paim.ready`.
- Produces: `renderProject(projectDir, opts?: {from?: number, to?: number, preview?: boolean}): Promise<{file: string, frames: number, previewFile?: string}>`; `stills(projectDir, times: number[], outFile: string, scale = 0.3): Promise<void>`.
- Produces CLIs: `build.mjs <project>`, `render.mjs <project> [--from s] [--to s] [--preview]`, `still.mjs <project> <t1,t2,…> <out.png>`. A `StoryError` prints one problem per line and exits 2.

Decisions: the page is served over HTTP because Chromium blocks ES-module imports from `file://`. Frames are JPEG quality 92 piped to one ffmpeg process (`-f image2pipe -framerate 30`), encoded `libx264 -crf 18 -pix_fmt yuv420p -movflags +faststart`. Audio is `<project>/voice/voice.wav` when it exists and the timing is not estimated, as AAC 192 kb/s 48 kHz; `story.music` (a path relative to the project) is mixed 30 dB below the voice and faded out over the end card. Output name: `renders/<slug>.mp4`, or `renders/<slug>-draft.mp4` when estimated; `--preview` adds a 720×1280 `-crf 26` copy named `…-preview.mp4`. A `--from/--to` render writes `renders/<slug>-part.mp4` without audio.

- [ ] **Step 1: Write the failing build test** — copy `tests/fixtures/mini` to a temp dir; `buildProject` returns `resolved.duration === 5.0`; `build/index.html`, `build/data.js`, `build/resolved.json`, `build/engine/runtime.mjs` exist; `data.js` contains both icon SVGs and no absolute home-folder path; a story with an unknown icon rejects with `StoryError`; a project without `timing.json` rejects with a message naming `timing.py`; a `story.music` path that does not exist rejects with a message naming that path; a story with a `sprite` item builds when `gen/sprites/basket.png` exists (the file is copied to `build/assets/sprites/`) and rejects with `StoryError` naming `gen_sprites.py` when it does not; with a profile whose `handle` is `@test`, `resolved.endCard.handle === '@test'`.

- [ ] **Step 2: Write the failing end-to-end test** (`render.e2e.test.mjs`, 120 s timeout)

```js
test('silent draft from estimated timing', async () => {
  const dir = copyFixture('mini');
  const r = await renderProject(dir, {preview: true});
  assert.match(r.file, /renders\/mini-draft\.mp4$/); assert.equal(r.frames, 150);
  const v = ffprobe(r.file);
  assert.deepEqual([v.video.width, v.video.height, v.video.r_frame_rate, v.video.pix_fmt, v.video.codec_name],
                   [1080, 1920, '30/1', 'yuv420p', 'h264']);
  assert.ok(Math.abs(v.duration - 5.0) < 0.1); assert.equal(v.audio, undefined);
  assert.equal(ffprobe(r.previewFile).video.width, 720);
});
test('final with voice', async () => {
  // set timing.estimated=false, synthesise voice/voice.wav (3 s sine, mono 48 kHz) with ffmpeg
  // file ends renders/mini.mp4; audio codec aac, sample_rate 48000; duration 5.0 ± 0.1
});
test('frames are deterministic', async () => {
  // openPage; seek(1.0) -> screenshot A; seek(2.5); seek(1.0) -> screenshot B; A and B are byte-identical
});
test('the frame actually shows the brand', async () => {
  // seek(2.6): pixel at (20, 20) is within 12 of cream #FFFAF0; seek(4.5): within 12 of green #14856D
  // textBoxes() at 2.6 includes a caption whose text is 'ตะกร้าหุ้น'
});
test('a sprite is drawn', …);                                    // sprite item with a synthesised PNG: at t + ENTER_DUR the centre pixel of its rect is the sprite's colour
test('music bed is accepted', …);                               // story.music = a synthesised 6 s sine wav -> render succeeds, one aac stream
test('project path with spaces and Thai letters renders', …);   // temp dir named "คลิป ทดสอบ"
test('stills writes a PNG', …);                                 // stills(dir, [0.5, 2.6, 4.5], out) -> file exists, width > 900
```

- [ ] **Step 3: Run** `node --test tests/node/` — Expected: the two new files FAIL.
- [ ] **Step 4: Implement** `lib/serve.mjs`, `build.mjs`, `render.mjs`, `still.mjs`.
- [ ] **Step 5: Run** `node --test tests/node/` — Expected: PASS. Open the contact sheet from the stills test and look at it: grid visible, icons in brand colours, Thai caption readable, end card green.
- [ ] **Step 6: Commit** — `feat: build, frame-accurate render and contact-sheet stills`.

---

### Task 8: Review gate (`check.mjs`)

**Files:**
- Create: `skills/paim-reel/scripts/check.mjs`
- Test: `tests/node/check.test.mjs`, `tests/fixtures/thai-marks/{script.md,story.json,timing.json}`

**Interfaces:**
- Consumes: `buildProject`, `openPage`, `window.__paim.textBoxes()`, `fontUsed()`, `SAFE`, `RIGHT_UI`, `CAPTION`.
- Produces: `deadBeats(resolved: Resolved, maxGap = 3.0): Array<{t0: number, t1: number}>` (pure); `checkProject(projectDir, opts?: {forceFallback?: boolean}): Promise<{pass: boolean, font: string, text: Finding[], deadBeats: Array<{t0,t1}>, overlaps: Finding[]}>` with `Finding = {t: number, kind: string, text: string, problem: 'outside-safe'|'right-ui'|'clipped'|'overlap'}`.
- Produces CLI: `check.mjs <project>` prints `font: …`, `text: PASS|FAIL (n)`, `dead beats: PASS|FAIL (n)`, `overlap: PASS|FAIL (n)` and one line per finding; exit 1 on any FAIL. Env `PAIM_FORCE_FALLBACK_FONT=1` sets `forceFallback`.

Rules: sample times are the midpoint of every caption, `t + ENTER_DUR` of every item, every headline start + 0.3, and the middle of the end card. At each, every text box must lie inside `SAFE`, must not intersect `RIGHT_UI`, and must not be `clipped`. A caption box must not intersect any visible item rect. Visual events for dead beats: scene starts, item `t`, mark `t`, headline `t`; a gap longer than `maxGap` between consecutive events, or between the last event and `voiceEnd`, is a dead beat.

- [ ] **Step 1: Write failing tests**

```js
test('deadBeats', () => {
  const r = {voiceEnd: 10, scenes: [{t0: 0, items: [{t: 0}, {t: 2.5}, {t: 6.0}], marks: [{t: 8.9}]}]};
  assert.deepEqual(deadBeats(r), [{t0: 2.5, t1: 6.0}]);
  assert.deepEqual(deadBeats({voiceEnd: 10, scenes: [{t0: 0, items: [{t: 0}], marks: []}]}), [{t0: 0, t1: 10}]);
});
test('mini passes', async () => {
  const c = await checkProject(copyFixture('mini'));
  assert.equal(c.pass, true); assert.deepEqual([c.text, c.deadBeats, c.overlaps], [[], [], []]);
});
test('Thai stacked marks are not clipped', async () => {
  // fixture thai-marks: captions 'ที่', 'น้ำ', 'ปั๊ม', 'ผู้ถือหุ้นกู้', 'กี่ปี'; item labels 'ผู้ถือหุ้นกู้'
  const c = await checkProject(copyFixture('thai-marks'));
  assert.equal(c.text.filter(f => f.problem === 'clipped').length, 0);
});
test('same fixture passes on the fallback font and reports it', async () => {
  const c = await checkProject(copyFixture('thai-marks'), {forceFallback: true});
  assert.equal(c.font, 'IBM Plex Sans Thai'); assert.equal(c.pass, true);
});
test('default font is reported', …);        // on macOS: c.font === 'Sukhumvit Set'
test('text in the phone-button column fails', async () => {
  // mini with a pill item at x: 940, y: 1100 -> a finding with problem 'right-ui', pass false
});
test('item over the caption fails', …);     // icon with x/y override inside CAPTION -> 'overlap'
test('CLI exit code', …);                   // 0 on mini, 1 on the right-ui variant, output has the four summary lines
```

- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement `check.mjs`.**
- [ ] **Step 4: Run** `node --test tests/node/` — Expected: PASS. If `clipped` findings appear for Thai marks, fix the CSS in `engine/style.css` (line-height, padding), not the test.
- [ ] **Step 5: Commit** — `feat: review gate for safe zones, clipping, overlaps and dead beats`.

---

### Task 9: `SKILL.md`, references, example, acceptance run

**Files:**
- Create: `skills/paim-reel/SKILL.md`, `skills/paim-reel/references/{brand.md,story-json.md,script-style.md}`
- Create: `skills/paim-reel/examples/etf-vs-stock/{script.md,story.json,sprites.tsv}` and its generated `gen/sprites/*.png`
- Test: `tests/node/skill.test.mjs`

**Interfaces:**
- Consumes: every CLI from Tasks 1–8, exactly as named there.
- Produces: the skill an agent loads. Frontmatter `name: paim-reel`; `description` states what it makes and when to use it, with Thai and English trigger phrases ("ทำคลิปจากเสียงนี้", "ทำ reel เรื่อง…", "make a P.AIM short about…"), under 1024 characters.

- [ ] **Step 1: Write the failing structural test** — `SKILL.md` frontmatter parses, `name === 'paim-reel'`, description length ≤ 1024 and mentions both a topic and a voice recording; body ≤ 200 lines; every `scripts/…` and `references/…` path mentioned in `SKILL.md` exists; no absolute home-folder path and no other project's name anywhere under `skills/`; the example validates (`estimate` its script through the Python CLI in a temp copy, then `buildProject` and `checkProject` pass with zero findings); the example uses at least 4 scenes, both scene backgrounds, at least 4 `sprite` items whose PNGs are committed (each under 400 KB, PNG colour type 6 = RGBA), at least one `number` with a `source`, and `highlight`.

- [ ] **Step 2: Write the example.** `examples/etf-vs-stock/script.md`: 10–12 Thai lines, about 35 s, on the difference between buying one stock and buying an ETF; phrases of at most 14 base characters; no company names; one sourced figure. `story.json`: opens with a `versus` scene, something new at least every 3 s, orange for the subject of each line, green for growth or the safer option, ends on a takeaway scene. `sprites.tsv`: 4–6 generic objects (a shopping basket, a stack of coins, an office building, a piggy bank, a rising bar chart); generate them once with a real provider (`gen_sprites.py`, the owner's signed-in CLI), look at each, regenerate any that is off-brand or carries text, and commit the keyed PNGs (not the `-raw` files).

- [ ] **Step 3: Write the three references.**
  - `brand.md`: the colour table and roles, the four text pairs and why (contrast figures from the spec), type sizes from Task 6, the zones from Task 4, the font note (system font on macOS, fallback elsewhere, never bundled), the no-logo rule.
  - `story-json.md`: the schema block from Task 4 verbatim, the resolution rules, the motion vocabulary from Task 6, a full worked example (the mini fixture), and the meaning of each `check.mjs` finding with its usual fix.
  - `script-style.md`: 8–14 lines for 30–60 s; hook in the first line; one idea per line; write a space between phrases and keep each phrase to 14 base characters; spell numbers the way they are read; content rules from spec §8 (no promised returns, no individual advice, every on-screen figure sourced); the read-aloud sheet format handed to P.AIM.

- [ ] **Step 4: Write `SKILL.md`.** Imperative steps, each naming its command:
  0. Run `scripts/doctor.sh --agent claude` (or `--agent codex`, whichever the agent is). Stop and report anything `MISSING`, with the `install.sh` line that fixes it. (Task 10 adds the routing to onboarding here; until then the acceptance runs use a seeded profile.)
  1. Make a project folder beside the audio or in the working directory; never inside the skill.
  2. Route: audio file given → voice mode; otherwise topic mode.
  3. Topic mode: `brief.md` → `script.md` (read `references/script-style.md`; write for the profile's `audience` in its `tone`) → fact-check figures on the web → `timing.py estimate` → story (step 6) → build, check, `render.mjs --preview` → send the draft and the read-aloud sheet; say plainly that the timing is estimated and the voice is still needed.
  4. Voice mode: `prep_voice.py` → `transcribe.py` → when there is no `script.md`, correct `script.draft.md` into `script.proposed.md` (spelling and phrase spaces only; a word that cannot be read is written `[?]`, never guessed), show it to the user and **stop** until she confirms or fixes it, then write `script.md` → `timing.py align` (as built: `timing.py` exits 2 while any `[?]` remains).
  5. If `align` exits 2 or prints `LOW` lines: show P.AIM those lines and ask whether to change the script to what was said or to re-record; do not render.
  6. Sprites and story: read `references/story-json.md`. List the objects the script names in `sprites.tsv` (generic objects only; 4–8 per reel; reuse one sprite in several scenes) and run `gen_sprites.py`. Look at every sprite; delete and regenerate one that has text, a logo, a wrong colour or an `OFF-PALETTE` line. On `QUOTA`, stop and tell P.AIM when to retry; use `icon` items instead only if she says so. Then write `story.json`: one scene per idea; the sprite is the thing the line names; highlight the one phrase per line that carries the point.
  7. `build.mjs` → `check.mjs` until every line says PASS → `still.mjs` at the middle of every scene; look at the sheet and fix covered or crowded frames.
  8. `render.mjs --preview`; confirm the file with `ffprobe`.
  9. Deliver: both files, the font used, which image CLI drew the sprites, what was checked, any claim left off screen, and that the agent cannot listen to the mix.
  Plus a short "Never" list: logos, brand marks or real people (in sprites too), unsourced numbers, TTS or cloned voice, writing into the skill folder, sending the recording or the script to any service, typing a password or key for the user.

- [ ] **Step 5: Run** `node --test tests/node/skill.test.mjs` — Expected: PASS.

- [ ] **Step 6: Acceptance run with a fresh agent, voice mode.** Install into a temp home (`./install.sh --home <tmp>`), seed a finished profile in a temp `PAIM_CONFIG_DIR` (`image_cli: codex`), and set `PAIM_IMAGE_CMD` to the fake CLI so the run spends no image quota. Synthesise a stand-in voice from the example script with macOS `say -v Kanya` (it is a test signal, not a deliverable). Dispatch a fresh subagent that is given only: the path `<tmp>/.claude/skills/paim-reel`, the audio file, and the sentence "ทำคลิปจากเสียงนี้". Pass when, without further help, it produces `renders/<slug>.mp4` that `ffprobe` shows as 1080×1920, 30 fps, with AAC audio, `check.mjs` exits 0, and the story uses at least three generated sprites. Record where it hesitated or went wrong.
- [ ] **Step 7: Acceptance run, topic mode.** A second fresh subagent, given the skill path and "ทำ reel เรื่อง ดอกเบี้ยทบต้น". Pass when it stops after delivering a `-draft.mp4`, a read-aloud sheet and a request for the recording, and its script contains no unsourced on-screen figure.
- [ ] **Step 8: Revise `SKILL.md` and the references** for each hesitation recorded in Steps 6–7, then repeat the run that failed. Stop when both pass with no intervention.
- [ ] **Step 9: Commit** — `feat: paim-reel skill instructions, references and worked example`.

---

### Task 10: Onboarding for P.AIM

**Files:**
- Create: `skills/paim-reel/references/onboarding.md`, `skills/paim-reel/references/cheatsheet-th.md`
- Modify: `skills/paim-reel/SKILL.md` (step 0 routing and a "set up again" trigger in the description)
- Test: `tests/node/onboarding.test.mjs`

**Interfaces:**
- Consumes: `doctor.sh --agent`, `install.sh`, `profile.mjs show|get|set|done|reset`, `image_cli.py test`, `timing.py estimate`, `build.mjs`, `render.mjs`, the bundled example.
- Produces: the procedure an agent follows the first time, and whenever P.AIM says "ตั้งค่าใหม่" / "set up again".

`onboarding.md` is written in English as instructions to the agent and carries the Thai sentences to say where wording matters. Its content, in this order:

1. **Rules.** Speak Thai; address her by `display_name` (default `พี่เอม`). One question per message. Say what a thing does, not what it is called: "โปรแกรมช่วยวาดภาพ" after the first mention, not "CLI". Announce each install (what, why, rough size) and wait for a yes. Save each answer immediately with `profile.mjs set`. Never ask for, type or store a password, key or login code. Run `profile.mjs show` first and ask only for what is still empty, so an interrupted setup resumes.
2. **Welcome.** Three sentences: what the skill makes, that setup takes about ten minutes, what she needs (this Mac, and a ChatGPT or a Google account).
3. **Machine check.** `doctor.sh --agent <agent>`; for each `MISSING` line a one-sentence plain explanation and, after a yes, `install.sh`. Missing Sukhumvit Set is explained, not treated as a failure.
4. **Picture helper (Claude Code only; skipped under Codex).** Explain why it is needed (Claude cannot draw) and offer the two choices with what each needs: Codex CLI — a ChatGPT account (the tested and recommended route); the Google route — a personal Google account through the Antigravity CLI, or the Gemini CLI only for an organisation-paid account or an existing API key (as built). Whatever Task 5 Step 9 found about either one is stated here. After her choice: install (`npm install -g @openai/codex` or `npm install -g @google/gemini-cli`), then she signs in herself in her own terminal (`codex login`, or start `gemini` and follow its sign-in); the agent waits. Then `profile.mjs set image_cli <choice>` and `image_cli.py test`; show her the sticker. On failure: the plain sentence from the tool, then offer to retry or to choose the other one. This step cannot be skipped under Claude Code.
5. **Brand details.** Channel handle; logo file (optional; copied to `<config dir>/assets/logo.png` and that path saved); disclaimer line for the end card (optional; suggest "ไม่ใช่คำแนะนำการลงทุน"); who the audience is, in one sentence; tone, as a choice (เป็นกันเอง / สุภาพเป็นทางการ / สนุกกระชับ); where to keep reels (default `~/Movies/paim-reels`). Tell her the colours and fonts are fixed by the brand.
6. **First clip.** Copy the bundled example into `<projects_dir>/example`, run `timing.py estimate`, `build.mjs`, `render.mjs --preview`, and show her the draft. Say that this one is silent because no voice has been recorded yet.
7. **Recording guide and cheat sheet.** Show `cheatsheet-th.md`, then `profile.mjs done --agent <agent>`.
8. **Set up again.** Ask which part to change; change only that. `profile.mjs reset --yes` only after she explicitly asks to start from zero.

`cheatsheet-th.md`, one page in Thai for P.AIM: the two sentences that start a reel ("ทำ reel เรื่อง …" and "ทำคลิปจากเสียงนี้" with the file attached); how to record (Voice Memos on the phone, a quiet room, the phone 15–20 cm away, read the sheet as written, one take, send the `.m4a`); what comes back (a draft, then the finished MP4 and a preview); what to say to change something ("เปลี่ยนภาพฉากที่ 3", "ตั้งค่าใหม่"); what stays on the machine (her voice file and its speech-to-text) and what does not (the assistant reads the script text; short object descriptions go to the drawing tool; fact and photo searches go to the web).

- [ ] **Step 1: Write the failing structural test** — `onboarding.md` names every `Profile` key except `version` and `onboarded_at`; contains both install commands, `codex login`, `image_cli.py test`, `profile.mjs done`, and a sentence matching `/never .*(password|key)/i`; its eight sections appear in the order above; `cheatsheet-th.md` has at least 300 Thai characters, both trigger sentences, and no word `CLI`; `SKILL.md` step 0 mentions `references/onboarding.md`, and its description contains `ตั้งค่า`.
- [ ] **Step 2: Run** `node --test tests/node/onboarding.test.mjs` — Expected: FAIL.
- [ ] **Step 3: Write `onboarding.md` and `cheatsheet-th.md`; update `SKILL.md`.** Run — Expected: PASS.

- [ ] **Step 4: Acceptance, first-time user under Claude Code.** Empty temp `PAIM_CONFIG_DIR`, temp home install, `PAIM_IMAGE_CMD` = fake CLI. A fresh subagent gets only the skill path and the message "อยากลองทำคลิปค่ะ"; a second subagent plays P.AIM from a fixed card (non-technical; chooses Gemini; handle `@paim.test`; no logo; accepts the suggested disclaimer; audience "มือใหม่หัดลงทุน"; tone "เป็นกันเอง"; default folder; answers one thing at a time and once replies "ไม่เข้าใจค่ะ"). Pass when: the profile is complete with `onboarded_at` set and `image_cli: gemini`; the example draft exists in the projects folder; the transcript shows one question per message, no request for a password or code, a simpler re-explanation after "ไม่เข้าใจค่ะ", and no reel work before setup finished.
- [ ] **Step 5: Acceptance, interrupted setup.** Repeat Step 4 but stop the agent right after the picture-helper step. Start a new fresh agent with "ทำต่อค่ะ". Pass when it resumes at brand details and does not ask about the picture helper again.
- [ ] **Step 6: Acceptance, the other branches.** (a) the card chooses Codex → `image_cli: codex`. (b) `--agent codex` (the agent is told it is running in Codex) → no picture-helper question; `profile.mjs done --agent codex` succeeds with `image_cli` null. (c) the fake CLI in `nothing` mode → the agent reports the failure in plain Thai and offers retry or the other helper; it does not mark setup done. (d) with a finished profile, "ตั้งค่าใหม่" then "เปลี่ยนชื่อช่อง" changes only `handle`.
- [ ] **Step 7: Revise `onboarding.md`** for every failure in Steps 4–6 and rerun the failed case until all pass without intervention.
- [ ] **Step 8: Commit** — `feat: guided first-run onboarding and Thai cheat sheet`.

---

### Task 11: README, notices, public-release audit, publish

**Files:**
- Create: `README.md`, `THIRD_PARTY_NOTICES.md`, `tests/node/release.test.mjs`
- Create: `docs/preview.gif` (≤ 3 MB, from the example's draft render)

**Interfaces:**
- Consumes: `install.sh`, `doctor.sh`, the example.
- Produces: a repository a stranger can clone, install and run.

- [ ] **Step 1: Write the failing release test** — over `git ls-files`: no file matches `\.(ttc|ttf|otf|wav|m4a|mp3|mp4|mov)$`; no file contains an absolute home-folder path, the name of another project, a bank or the owner, or a match for `(api[_-]?key|secret|token)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}`; no file is larger than 3 MB; `LICENSE` and `THIRD_PARTY_NOTICES.md` exist and the notices name Phosphor Icons (MIT), IBM Plex Sans Thai (OFL-1.1), Playwright (Apache-2.0), faster-whisper (MIT), Pillow (MIT-CMU) and state that Sukhumvit Set is not included and that the example sprites were generated with an image model for this project; `README.md` has both a `## ติดตั้ง` and a `## Install` section and both contain `./install.sh`.

- [ ] **Step 2: Write `THIRD_PARTY_NOTICES.md` and `README.md`.** README order: what it makes (with `docs/preview.gif`), requirements (including: under Claude Code, Codex CLI or Gemini CLI is required and why), install for Claude Code and for Codex, what the first-run setup asks, first reel in both modes (the two sentences a user types), what is sent to the image provider and what never leaves the machine, how to re-brand (`brand.json`), the font note, what version 1 does not do (spec §9), licence. Thai section first, English second, same content.

- [ ] **Step 3: Make `docs/preview.gif`** from the example draft (`ffmpeg`, 360 px wide, 12 fps).
- [ ] **Step 4: Run the whole suite** — `node --test tests/node/` and `skills/paim-reel/.venv/bin/python -m pytest tests/py -v` — Expected: all PASS.
- [ ] **Step 5: Codex install check.** `./install.sh --home <tmp> --codex`; assert the link; start Codex with `HOME=<tmp>` and confirm `paim-reel` appears in its skill list. If Codex needs a different folder or an `AGENTS.md` pointer, fix `install.sh` and the README, and add the case to `install.test.mjs`.
- [ ] **Step 6: Fresh-clone check.** `git clone` the local repo into a temp dir, run `./install.sh --home <tmp2>`, `doctor.sh`, then run the fake-CLI onboarding acceptance (Task 10 Step 4) against the clone, then build, check and render the example draft there — Expected: an MP4, with no step reaching outside the clone.
- [ ] **Step 7: Commit** — `docs: README, third-party notices and release audit`.
- [ ] **Step 8: STOP — ask the owner before publishing.** Show the owner: final repository and skill names, the licence holder name, the GitHub owner, `git ls-files`, and the release-test output. Only on an explicit yes:

```bash
gh repo create <owner>/paim-reel-skill --public --source . --remote origin --push
```

As built (Task 11): Step 1's media rule allows the six generated sound effects, the example sprites, the example photo and `docs/preview.gif`; it also runs `make_sfx.py --check` and reads the example photo's credits entry. Step 5 only checked the link under a temporary home; Codex itself was not started. Step 6 cloned, installed, ran `doctor.sh`, `timing.py estimate`, `build.mjs`, `check.mjs` and a draft render of the example, with no onboarding acceptance (the owner cancelled it). Step 8 was not run by the builder: nothing was pushed or created on GitHub.

Then confirm the repository page loads and the README renders.

---

---

# Addendum A (2026-11-16, after Task 10 was written) — paper look, web photos, sound effects, OpenFilm

The owner asked for four additions while the plan was running. They are Tasks 12-16 below.
Execution order from here: finish Task 10's review → 12 → 13 → 14 → 15 → 16 → 11 → final review.
Task 10's acceptance runs (its Steps 4-7) move into Task 16, because Tasks 12-15 change what onboarding and the cheat sheet must say.

Decisions taken with the owner (2026-11-16):
- Paper: a handmade-paper texture and torn paper edges, like two reference pictures the owner chose (reference only; nothing from them is copied).
- Pictures: web photos are used together with drawn sprites; the agent chooses per scene (real things → photo, ideas → sprite).
- Photo sources: general web image search (the owner's choice, made after being told that most web images are copyrighted).
- OpenFilm (github.com/openfilm/openfilm, MIT): the finished reel is exported as an OpenFilm project and opened in Studio so P.AIM can change it by hand. Our own renderer still makes the MP4.
- Sound effects: a small set, shipped in the repository.

## Global Constraints — changes

- The repository still contains no third-party picture, texture or sound without a clear licence. Textures and sound effects are generated by our own code. A photo fetched from the web lives only in the user's project folder; the one photo in the bundled example must be public domain or CC0, with its source in THIRD_PARTY_NOTICES.md.
- Every web photo used in a reel has a `credits.json` entry (image URL, page URL, licence text or `unknown`, credit). The delivery note lists every photo whose licence is `unknown` and says they are used at the user's own decision. Nothing is uploaded: only search words and fetches go out.
- Downloaded files are untrusted: HTTPS only, images only (JPEG, PNG, WebP), decoded and re-encoded with Pillow, never executed, SVG refused.
- Release test (Task 11): `skills/paim-reel/assets/sfx/*.wav` and the example's one photo are the only binary media allowed besides the example sprites.
- `SKILL.md` stays under 200 lines; new detail goes to `references/photos.md` and `references/openfilm.md`.
- Zone constants and encode settings do not change.

## Review Focus — additions

- A web fetch returns something that is not a usable picture (HTML error page, 3 MB PNG of 200 px, a redirect to http, an SVG): one plain FAIL line, nothing written. → Task 13.
- A story uses a photo that has no credits entry: build and check fail, naming the photo. → Task 13.
- Sound effects pile up or bury the voice: events are thinned, levels are fixed below the voice, the final still measures −14 LUFS ±1 with true peak ≤ −1 dBFS. → Task 14.
- The OpenFilm copy draws a different picture from our render at the same time. → Task 15.
- The texture makes text harder to read or changes between loads. → Task 12.

---

### Task 12: Paper look — handmade texture and torn edges

**Files:**
- Create: `skills/paim-reel/engine/paper.mjs`, `tests/node/paper.test.mjs`
- Modify: `skills/paim-reel/engine/runtime.mjs`, `skills/paim-reel/engine/style.css`, `skills/paim-reel/lib/story.mjs`, `skills/paim-reel/references/brand.md`, `skills/paim-reel/references/story-json.md`, `tests/node/render.e2e.test.mjs`

**Interfaces:**
- Consumes: `Resolved`, the page contract `window.__paim`.
- Produces `engine/paper.mjs` (browser-safe, pure): `rng(seed: number): () => number`; `hashSeed(text: string): number`; `tornPath(w: number, h: number, seed: number, rough = 14): string` (a closed SVG path `d` whose points stay within `rough` px inside the `w × h` box); `flecks(seed: number, w: number, h: number): Array<{x, y, len, rot, color: 'orange'|'green'|'charcoal'}>`; `fibres(seed, w, h): Array<{x, y, len, rot, bend, tone: -1|1}>`.
- Produces in the story schema: `Scene.frame?: 'orange'|'green'|'charcoal'` (the scene's paper becomes a torn sheet inset 36 px over that colour).

Look, exact:
- The faint grid is removed. Every scene background is a paper texture drawn once at `ready` on a 1080×1920 canvas and reused for all frames: base colour = the scene colour (`#FFFAF0`, `#252B31`, end card `#14856D`); soft mottling within ±3% lightness; 260 fibres, 40-220 px long, 1-2 px wide, ±6% lightness; 46 flecks, 6-26 px, in muted orange, green and charcoal at 55% opacity (on charcoal: orange, green and cream). Seed = `hashSeed(resolved.slug)`.
- The texture is static for the whole reel. No per-frame grain.
- `tornPath` is also the edge of the `frame` sheet; Task 13 uses it for photo cards.
- Text colours and pairs are unchanged; the mean colour of any 40×40 px patch of background stays within 10 levels per channel of the scene colour.

- [ ] **Step 1: Write failing tests for `paper.mjs`** — same seed gives the same `tornPath`, `flecks` and `fibres`; a different seed gives different ones; every `tornPath` point lies in the box and within `rough` of its edge; the path is closed; `flecks` returns 46 items inside the canvas with the three allowed colours; `hashSeed('a') !== hashSeed('b')`.
- [ ] **Step 2: Run** `node --test tests/node/paper.test.mjs` — Expected: FAIL. **Step 3: Implement `paper.mjs`.** Run — Expected: PASS.
- [ ] **Step 4: Write failing e2e tests** — two separate page loads of the mini fixture give byte-identical screenshots at t = 1.0; the mean of a 40×40 patch at (20, 20) is within 10 of cream at 2.6 s and of green at 4.5 s (replace the old single-pixel checks); a scene with `frame: 'orange'` shows orange at (10, 960) and paper at (540, 960); `seek(1.0) → seek(2.5) → seek(1.0)` is still pixel-identical; an unknown `frame` value is a `StoryError`.
- [ ] **Step 5: Implement the texture and `frame` in `runtime.mjs` / `style.css` / `story.mjs`.** Run the whole Node suite — Expected: PASS. `check.mjs` still passes on `mini`, `thai-marks` and the example.
- [ ] **Step 6: Look.** Render stills of the example with `still.mjs --scenes`; Read them next to the owner's two reference pictures (kept outside the repository). The paper should read as handmade paper at phone size without competing with captions. Save before/after sheets to `task-12-smoke/`.
- [ ] **Step 7: Update `brand.md` and `story-json.md`; commit** — `feat: handmade-paper texture and torn-edge frames`.

---

### Task 13: Photos from the web

**Files:**
- Create: `skills/paim-reel/scripts/fetch_photo.py`, `skills/paim-reel/scripts/credits.py`, `skills/paim-reel/references/photos.md`, `tests/py/test_fetch_photo.py`, `tests/py/test_credits.py`
- Modify: `skills/paim-reel/lib/story.mjs`, `skills/paim-reel/scripts/build.mjs`, `skills/paim-reel/scripts/check.mjs`, `skills/paim-reel/engine/runtime.mjs`, `skills/paim-reel/engine/style.css`, `skills/paim-reel/SKILL.md`, `skills/paim-reel/references/story-json.md`, and their tests

**Interfaces:**
- Produces CLI `fetch_photo.py <project> <name> <image_url> --page <page_url> [--license <text>] [--credit <text>]`: writes `<project>/gen/photos/<name>.jpg` (longest side ≤ 1600 px, EXIF removed) and adds or replaces the entry `{name, image_url, page_url, license, credit, fetched_at, sha256, width, height}` in `<project>/gen/photos/credits.json` (`license` is `"unknown"` when not given). Prints `OK <name> <W>x<H> license=<…>`. Exit 2, writing nothing, with one plain sentence when: the name does not match `^[a-z0-9-]+$`; either URL is not `https://` (env `PAIM_ALLOW_HTTP_LOCAL=1` permits `http://127.0.0.1` for tests); the response is not `image/jpeg`, `image/png` or `image/webp` or does not decode; it is larger than 15 MB; its short side is under 600 px; the download takes longer than 30 s.
- Produces CLI `credits.py <project>`: writes `<project>/renders/<slug>-credits.md` listing every photo the story uses (name, page URL, licence, credit), `unknown` licences first under their own heading; prints `credits: N photos, M with unknown licence`. Exit 2 if the story uses a photo with no credits entry.
- Produces in the schema: item `photo: {photo: /^[a-z0-9-]+$/, label?: string, treatment?: 'mono'|'color'}` (default `mono`). `validateStory(…, assets: {sprites, photos})`: a photo missing from `assets.photos` is a problem naming `fetch_photo.py`.
- `buildProject` passes `assets.photos` = names in `gen/photos/credits.json` whose `.jpg` exists, and copies used photos to `build/assets/photos/`.
- `check.mjs` gains a line `credits: PASS|FAIL (n)`: FAIL for a used photo without a credits entry.

Drawing: a photo is a paper card inside the item's art box — the picture cropped to fill, a 14 px cream paper border, the card's outline cut by `tornPath(seed = item.seed)`, a soft shadow, rotated by a seeded −2° to +2°. `mono` = desaturated with a warm paper tint; `color` = as is. Label under the card like any item. Marks treat the card as the picture.

`references/photos.md` (instructions to the agent): use a photo for a real, nameable thing the line mentions (a building, a banknote, a place, an object); use a sprite for an idea. Search with the agent's own web search; open the result's page; pass the direct image URL and the page URL to `fetch_photo.py`; pass `--license` only with text the page itself states. Do not use: stock-site previews with a watermark, frames from other creators' videos, pictures of private people, a company logo unless the script names that company. Prefer pages that state a licence. Read every fetched photo. Never copy a fetched photo into the skill folder. In the delivery note list every photo with licence `unknown`, with its page URL, and say plainly that those pictures may be copyrighted and are used at her decision; attach the credits file.

- [ ] **Step 1: Write failing `fetch_photo.py` tests** against a local `http.server` thread serving synthesised files (`PAIM_ALLOW_HTTP_LOCAL=1`): a 1200×900 JPEG → `OK`, a `.jpg` at most 1600 px, a credits entry with all nine fields and `license == "unknown"`; `--license "CC0"` is stored; fetching the same name twice replaces the entry; an HTML page served as `text/html` → exit 2 and nothing written; a file named `.jpg` holding HTML → exit 2; an SVG → exit 2; a 500×400 PNG → exit 2 naming the size; a `http://example.com/x.jpg` URL without the env → exit 2 without any request; a bad name → exit 2; EXIF GPS in the source is absent from the output.
- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement `fetch_photo.py`** (`urllib` with list-free URL handling, a 30 s timeout, a 15 MB read cap, redirects followed only to `https`). Run — Expected: PASS.
- [ ] **Step 4: Write failing tests** for `credits.py`, the `photo` item in `story.test.mjs` (missing photo → problem naming `fetch_photo.py`; present → resolves), `build.test.mjs` (photo copied; absolute paths absent from `data.js`), `check.test.mjs` (`credits: FAIL` for a photo whose credits entry was deleted) and one e2e (the card is drawn: the centre of its art box is not the paper colour; `textBoxes()` still reports its label).
- [ ] **Step 5: Implement.** Whole suites — Expected: PASS.
- [ ] **Step 6: Look.** A temp project with one public-domain photo fetched for real (one fetch) in `row`, `versus` and `center`; stills saved to `task-13-smoke/`; Read them.
- [ ] **Step 7: Write `references/photos.md`; add the photo step to `SKILL.md` step 6 and the unknown-licence list to step 9; update `story-json.md`. Commit** — `feat: web photos as torn paper cards, with credits`.

---

### Task 14: Sound effects

**Files:**
- Create: `skills/paim-reel/scripts/make_sfx.py`, `skills/paim-reel/assets/sfx/{pop,whoosh,tick,thud,paper,chime}.wav`, `skills/paim-reel/assets/sfx/README.md`, `skills/paim-reel/lib/sfx.mjs`, `tests/py/test_make_sfx.py`, `tests/node/sfx.test.mjs`
- Modify: `skills/paim-reel/scripts/render.mjs`, `skills/paim-reel/lib/story.mjs`, `skills/paim-reel/SKILL.md`, `skills/paim-reel/references/story-json.md`, `tests/node/render.e2e.test.mjs`

**Interfaces:**
- Produces CLI `make_sfx.py [--out <dir>] [--check]`: synthesises six sounds with numpy only (seeded noise, no samples from anywhere): `pop` 0.12 s, `whoosh` 0.35 s, `tick` 0.05 s, `thud` 0.25 s, `paper` 0.40 s, `chime` 0.90 s; mono, 48 kHz, 16-bit, peak −3 dBFS, 5 ms fades. `--check` exits 1 if the committed files differ from a fresh synthesis.
- Produces `lib/sfx.mjs`: `sfxEvents(resolved: Resolved): Array<{t: number, name: string, gainDb: number}>` (pure, sorted by `t`).
- Schema: `story.sfx?: boolean` (default `true`).

Event rules, exact: scene start except the first → `paper` −20 dB; item entrance by `enter`: `pop` → `pop` −16, `drop` → `thud` −16, `slide-l`/`slide-r`/`rise` → `whoosh` −20, `fade` → none; a `photo` item → `paper` −18 instead of its entrance sound; any mark → `tick` −18; a `number` → three `tick` −22 at 0.2, 0.45 and 0.7 s into its count; end card start → `chime` −16. Then drop any event less than 0.12 s after the previous event of the same name, and keep at most 60 (earliest first).

Mix: voice unchanged; effects at their `gainDb`; music as before; the sum goes through a limiter to true peak ≤ −1 dBFS. A draft (no voice) carries the effects only, so a draft now has an audio stream; with `story.sfx: false` a draft has none.

- [ ] **Step 1: Failing tests for `make_sfx.py`** — six files with the stated format, durations ±5 ms and peak −3 ±0.5 dBFS; two runs are byte-identical; `--check` passes on the committed files and fails after one byte is changed.
- [ ] **Step 2: Run, implement, run** — Expected: FAIL then PASS. Commit the six generated files.
- [ ] **Step 3: Failing tests for `sfxEvents`** — on the mini fixture the exact event list; thinning (two `pop` 0.05 s apart → one); the 60 cap; `fade` gives nothing; a photo gives `paper`; `sfx: false` → `[]`.
- [ ] **Step 4: Failing e2e tests** — a draft now has one `aac` stream and is not silent in a 0.3 s window after the first entrance (`volumedetect` mean above −60 dB); with `sfx: false` the draft has no audio stream; a final with voice measures −14 ±1.5 LUFS integrated and true peak ≤ −1 dBFS (`ebur128`); the voice-only window between two events is unchanged within 0.5 dB of the same render with `sfx: false`.
- [ ] **Step 5: Implement `lib/sfx.mjs` and the mix in `render.mjs`.** Whole suites — Expected: PASS. Update the two existing tests and the `SKILL.md` / reference sentences that say a draft has no audio.
- [ ] **Step 6: Commit** — `feat: generated sound effects placed from the story`.

---

### Task 15: OpenFilm hand-off

**Files:**
- Create: `skills/paim-reel/scripts/export_openfilm.mjs`, `skills/paim-reel/scripts/open_studio.sh`, `skills/paim-reel/references/openfilm.md`, `tests/node/openfilm.test.mjs`
- Modify: `skills/paim-reel/engine/runtime.mjs` (only to expose what the export needs), `skills/paim-reel/scripts/doctor.sh`, `skills/paim-reel/SKILL.md`

**Interfaces:**
- Consumes: `buildProject`, `Resolved`, `sfxEvents`.
- Produces: `exportOpenfilm(projectDir: string): Promise<{dir: string, clips: number}>` and CLI `export_openfilm.mjs <project>` → `<project>/openfilm/` holding `film.html`, the page(s), and `assets/` (voice, effects, music, sprites, photos, fonts). Prints `openfilm -> <dir> (<n> clips)`.
- Produces: `open_studio.sh <project>` → runs `npx -y openfilm@latest open <project>/openfilm` and prints what it prints. `doctor.sh` gains one line, `openfilm: ok` or `WARN openfilm (needs Node 22.2 or newer)`; a WARN never makes doctor fail.

Before writing code, learn the real format from OpenFilm itself, not from memory: run `npx -y openfilm@latest` and `npx -y openfilm@latest skill edit` (the first run downloads the package and a headless Chromium, about 100 MB; this is approved) and read what they print. What we know from its README: a film is a folder with `film.html`; each `<section>` is a track, first on top; a clip is an element (`<iframe src="page.html#t=a,b">`, `<audio src=… at=… volume=…>`); a page sets `window.film = { frame(t), duration, ready }` and must draw the same picture for the same `t`.

Requirements:
- Picture track: one clip per scene, plus the end card, each showing exactly what our renderer shows for that span. Voice on its own track. Sound effects on their own track, one clip per event at its `gainDb`. Music on its own track when present. Canvas 1080×1920.
- The page wraps our runtime (`frame(t)` → `__paim.seek(sceneStart + t)`); no second drawing code.
- Hand edits made in Studio live in `<project>/openfilm/`. Re-running the export must not silently destroy them: if `openfilm/` exists and differs from the last export (keep a manifest of file hashes), write to `openfilm-<n>/` instead and say so.

- [ ] **Step 1: Failing tests (no network)** — after `exportOpenfilm` on the mini fixture: `film.html` exists, has a 1080×1920 viewport, one picture clip per scene plus the end card with spans that tile `[0, duration]`, one voice clip when `voice/voice.wav` exists, one effect clip per `sfxEvents` entry; every `src` it names exists under `openfilm/`; no absolute path; loading a scene page in Playwright and calling `window.film.frame(0.5)` gives the same screenshot as our page at `sceneStart + 0.5`; a second export after touching `film.html` goes to `openfilm-2/`.
- [ ] **Step 2: Run, implement, run** — Expected: FAIL then PASS.
- [ ] **Step 3: Real check, opt-in (`PAIM_RUN_OPENFILM=1`)** — `npx -y openfilm@latest look` (or the command its help names) on the exported example gives a contact sheet; Read it beside our `still.mjs --scenes` sheet; `openfilm render` of the first 2 s gives an MP4. Save both to `task-15-smoke/`. Then `open_studio.sh` once: confirm the Studio URL answers HTTP 200, and stop the server. Record exactly what could and could not be edited in Studio (clip order and trims, sound levels, elements inside a scene).
- [ ] **Step 4: Write `references/openfilm.md`** (what the export contains, how to open it, what P.AIM can change by hand, that she exports from Studio after hand edits, what a re-export does) and add to `SKILL.md` step 9: after delivering the MP4, run the export, open Studio, and tell her. **Commit** — `feat: export the reel to OpenFilm and open Studio`.

---

### Task 16: Example, skill text and acceptance for the additions

**Files:**
- Modify: `skills/paim-reel/examples/etf-vs-stock/*` (one public-domain or CC0 photo with its `credits.json`), `skills/paim-reel/SKILL.md`, `skills/paim-reel/references/onboarding.md`, `skills/paim-reel/references/cheatsheet-th.md`, `tests/node/skill.test.mjs`, `tests/node/onboarding.test.mjs`

- [ ] **Step 1: Example.** Add one photo item with a public-domain or CC0 source (fetched for real, source and licence in `credits.json`); re-check, re-render the draft with effects, refresh the sheet; extend `skill.test.mjs` (the example has a photo with a credits entry whose licence is not `unknown`).
- [ ] **Step 2: One coherence pass over `SKILL.md`, the references, `onboarding.md` and the cheat sheet** for the four additions: onboarding tells her about web photos (and that unknown-licence pictures are her decision), about Studio (the first opening downloads about 100 MB; ask first), and that clips now have sound effects; the cheat sheet gains "ขอเปลี่ยนรูป", "เปิดให้แก้เอง" and the Studio export note. Tests updated.
- [ ] **Step 3: Acceptance (controller-run).** The four runs of Task 10 Steps 4-6 (first-time user; interrupted setup; the other branches) and the two reel runs of Task 9 (voice with confirmation; topic), all on the installed skill with the fake image CLI. Web search and photo fetching are real in these runs. Pass when each reaches its expected end with no intervention, the voice reel uses at least one photo with a credits entry, has effects in its audio, and an `openfilm/` folder is exported.
- [ ] **Step 4: Revise for every hesitation; repeat failed runs. Commit** — `feat: example and skill text for paper, photos, effects and OpenFilm`.

---

## Open items for the owner (do not block Tasks 1–10)

- Final repository and skill names (working: `paim-reel-skill`, `paim-reel`).
- P.AIM's handle, logo and disclaimer are now collected by onboarding on her machine. Say so if they should instead be baked into `brand.json` as repository defaults.
- Which provider (Codex or Gemini) draws the example sprites that get committed, and which one onboarding should present first.
- Licence holder name on `LICENSE`, and which GitHub account or organisation owns the repository.
- Whether to also register the skill on the owner's own machine.

---

## Changes during implementation

The plan above is kept as written. Where building it showed a statement to be wrong or incomplete, the line was corrected in place and marked "as built". The full list is in the spec, section 13 ("Changes during implementation"). In short:

- Privacy: not "recordings and scripts never leave the machine", but four parts: the voice file and its speech-to-text stay on this machine; the assistant reads the script text; short object descriptions go to the drawing tool; fact and photo searches go to the web.
- Pauses: any pause longer than 0.45 s is shortened to 0.45 s; trailing silence is trimmed to 0.15 s.
- Voice mode with no script: the corrected text goes to `script.proposed.md`, the agent stops for the user's confirmation, unreadable words stay `[?]`.
- Image tools: the Gemini command carries `--skip-trust`; free and paid personal Google accounts are served by the Antigravity CLI; Codex is the recommended route.
- Fonts and icons: `fallbackFontUrls` per weight with Thai and Latin subsets; icons keyed `name:weight`.
- Drafts carry sound effects, and the banner reads `DRAFT · ยังไม่มีเสียงพูด`.
- Added after the plan was written: the handmade-paper look, web photos with a credits file, generated sound effects, the OpenFilm hand-off (finished reels only), larger layout geometry, number grouping, single-line pills, and `still.mjs --scenes`.
