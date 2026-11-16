# First-run setup with P.AIM

Follow this the first time (`doctor.sh` prints `onboarding: needed` or `MISSING image-cli …`),
when she says "ทำต่อค่ะ" after an interrupted setup, and when she says "ตั้งค่าใหม่" or
"set up again" (section 8). Do no reel work until section 7 is finished.

`<skill>` is this skill's folder. `<agent>` is `claude` under Claude Code and `codex` under Codex.
`<config dir>` is `${PAIM_CONFIG_DIR:-$HOME/.config/paim-reel}`, the folder of the profile
(`echo "${PAIM_CONFIG_DIR:-$HOME/.config/paim-reel}"` prints it). Profile commands are
`node <skill>/scripts/profile.mjs show | get <key> | set <key> <value> | done --agent <agent> | reset --yes`.

The Thai sentences below say พี่เอม; say her `display_name` instead if it is different.

## 1. Rules

- Speak Thai to her. Call her by `display_name` (`profile.mjs get display_name`; the default is
  `พี่เอม`). If she asks to be called something else, `profile.mjs set display_name "<name>"`.
- Short sentences, polite and warm, the way you would speak to an older colleague you respect.
  No emoji.
- **One question per message**, then wait for her answer.
- Say what a thing does, not what it is called. Name a tool once ("Codex CLI
  โปรแกรมช่วยวาดภาพ"), then only "โปรแกรมช่วยวาดภาพ". Never say "CLI", "PATH", "npm",
  "profile" or "install script" to her. Profile is "การตั้งค่า"; Terminal is "แอป Terminal
  หน้าต่างสำหรับพิมพ์คำสั่ง" the first time, then "หน้าต่าง Terminal".
- When she says "ไม่เข้าใจค่ะ" or sounds unsure: explain again in fewer, simpler words, with an
  everyday comparison, and no new terms. Never repeat the same sentence.
- Before every install, say what it is, why it is needed, its rough size and time, and wait for
  a clear yes. Run nothing that installs before that yes.
- Save each answer the moment you have it, with `profile.mjs set`, before the next question.
  Never set `version` or `onboarded_at` by hand: `profile.mjs done` writes `onboarded_at`.
- **Never ask for, type, read back or store a password, API key or login code.** She signs in
  herself, in her own Terminal window or browser. If she starts to send one, stop her:
  > ไม่ต้องส่งรหัสผ่านมาในแชตนะคะ พิมพ์ในหน้าต่างที่เปิดขึ้นมาเองได้เลยค่ะ ข้อมูลนี้ควรอยู่กับพี่เอมคนเดียวค่ะ
- **Resume, never restart.** Always begin with `profile.mjs show` and
  `<skill>/scripts/doctor.sh --agent <agent>`, then start at the first step not done:

  | Step | Done when |
  |---|---|
  | 3. Machine check | `doctor.sh` prints no `MISSING` line except `MISSING image-cli …` |
  | 4. Picture helper | under Codex: always. Under Claude Code: `image_cli` is set, `doctor.sh` prints `image-cli: ok …`, and `<config dir>/test/sample.png` exists |
  | 5. Brand details | `handle`, `audience`, `tone` and `projects_dir` have values (`logo` and `disclaimer` may be empty by her choice) |
  | 6. First clip | `<sample>/renders/etf-vs-stock-draft.mp4` exists, `<sample>` being `<projects_dir>/example` or `<projects_dir>/example-sample` (section 6) |
  | 7. Cheat sheet | `onboarded_at` is set |

  On a resume, skip the welcome and say in one sentence where you are going on from:
  > การตั้งค่ายังค้างอยู่ค่ะ ขอทำต่อจากตรงที่ค้างไว้เลยนะคะ
- If `profile.mjs show` exits 1 with `is not valid JSON` or `must hold a JSON object`, the
  settings file is damaged and `doctor.sh` will wrongly say nothing was chosen. Tell her plainly,
  ask once whether to set up again, and only after her yes move the file aside (nothing is
  deleted): `mv "<config dir>/profile.json" "<config dir>/profile.json.bak"`. Then begin at
  section 2.

## 2. Welcome

Send these three sentences, then ask whether to begin:

> สวัสดีค่ะพี่เอม ผู้ช่วยตัวนี้ทำคลิปแนวตั้งสั้น ๆ อธิบายเรื่องการเงินในแบบของ P.AIM จากหัวข้อที่พี่เอมบอก หรือจากเสียงที่พี่เอมอัดมาค่ะ
> ครั้งแรกต้องตั้งค่ากันก่อน ใช้เวลาประมาณสิบนาที ไม่รวมเวลาที่เครื่องทำคลิปตัวอย่างให้ดูค่ะ
> ที่ต้องมีคือเครื่อง Mac เครื่องนี้ กับบัญชี ChatGPT หรือบัญชี Google อย่างใดอย่างหนึ่งค่ะ
>
> เริ่มเลยไหมคะ

Under Codex the third sentence is only "ที่ต้องมีคือเครื่อง Mac เครื่องนี้ค่ะ": Codex draws the
pictures itself.

## 3. Machine check

Run `<skill>/scripts/doctor.sh --agent <agent>`. It exits non-zero until setup is done; that is
expected here. Read its lines:

- `ok …`: nothing to do.
- `font: Sukhumvit Set`: nothing to say. `font: IBM Plex Sans Thai (fallback)` is not a failure;
  tell her once:
  > เครื่องนี้ไม่มีตัวอักษร Sukhumvit Set คลิปจะใช้ตัวอักษร IBM Plex Sans Thai ที่หน้าตาใกล้เคียงกันแทนค่ะ ไม่ต้องทำอะไรเพิ่มค่ะ
- `MISSING image-cli …`: section 4 handles it.
- `onboarding: needed`: this procedure handles it.
- Any other `MISSING` line: give one plain sentence for each, announce the fix, wait for her yes,
  then fix it. Handle them one at a time, in the order printed.

| Line | What to tell her | Fix, after her yes |
|---|---|---|
| `MISSING node …` | the program that builds the video pages; about 100 MB | `brew install node` if `command -v brew` finds Homebrew; otherwise send her to https://nodejs.org to download the macOS installer and run it herself |
| `MISSING ffmpeg …` / `MISSING ffprobe …` | the program that joins pictures and sound into an MP4; a few hundred MB | `brew install ffmpeg` |
| `MISSING playwright …`, `MISSING chromium …`, `MISSING python packages …` | the pieces that draw each frame and turn her voice into text; about 1 GB in all, several minutes | `<skill>/../../install.sh --<agent>` (it installs every missing piece in one go) |

- No Homebrew (`command -v brew` finds nothing): send her to https://brew.sh and ask her to run
  the command shown there in her own Terminal window. It asks for her Mac password, which she
  types there herself. Wait for her, then run `doctor.sh` again.
- `install.sh` stops with a message: tell her what it says in plain Thai. If it asks for
  Python 3.12 or uv, `brew install uv` (after her yes) and run `install.sh` again. If it says the
  skill folder `already exists and is not a link to this skill`, this copy was not installed
  from its repository: say so and stop.

Run `doctor.sh` again after each fix. Go on when no `MISSING` line is left except
`MISSING image-cli …`.

## 4. Picture helper

**Under Codex skip this section**: Codex draws the pictures, `image_cli` stays empty and nothing
is asked. **Under Claude Code it cannot be skipped**: without it there are no pictures and setup
cannot finish. If she wants to stop here, tell her she can come back with "ทำต่อค่ะ".

What was seen on a test Mac (2026-11-16); results on hers may differ, and `image_cli.py test`
is the judge:

- **Codex CLI** (needs a ChatGPT account) drew a clean sticker in the brand colours.
  Recommend it.
- **The Google route.** The plain Gemini CLI refuses free personal Google accounts ("This client
  is no longer supported for Gemini Code Assist for individuals"); Google's own Gemini CLI page
  says free personal use and the Google AI Pro and Ultra plans moved to the Antigravity CLI
  (`agy`) on 18 June 2026. So for a personal Google account the route is the **Antigravity CLI**,
  which did draw, a weaker sticker with a white border. The plain Gemini CLI is only for a work
  account whose organisation pays for Gemini Code Assist, or a Gemini API key she has already
  set up herself.

Ask, in one message:

> ต่อไปเป็นเรื่องภาพค่ะ ผู้ช่วยตัวนี้วาดรูปเองไม่ได้ เลยต้องยืมโปรแกรมช่วยวาดภาพมาใช้ มีให้เลือกสองทางค่ะ
> 1. Codex CLI ของ OpenAI ใช้บัญชี ChatGPT ทางนี้แนะนำค่ะ ตอนทดลองวาดได้สวยและตรงสีของแบรนด์
> 2. โปรแกรมช่วยวาดภาพของ Google ใช้บัญชี Google ทางนี้ก็วาดได้ แต่ภาพที่ได้ยังไม่เรียบร้อยเท่าค่ะ
>
> ผลที่เครื่องของพี่เอมอาจต่างจากตอนทดลองได้นะคะ เลือกแล้วจะลองวาดภาพทดสอบหนึ่งภาพ ถ้าไม่ได้ผลก็เปลี่ยนไปอีกทางได้ค่ะ
>
> พี่เอมสะดวกใช้ทางไหนคะ

If she chooses Google, ask one more question:

> บัญชี Google ที่จะใช้ เป็นบัญชีส่วนตัว หรือบัญชีของที่ทำงานคะ ถ้าไม่แน่ใจ ตอบว่าไม่แน่ใจได้เลยค่ะ

Personal, or she is not sure → Antigravity CLI. Work account, or she says she already has a
Gemini API key → Gemini CLI. If the test drawing then says Google no longer accepts this client
(her organisation does not pay for Gemini Code Assist), offer the Antigravity route as below.

### Install

Announce it (what, why, size, a few minutes) and wait for her yes. You run the command:

- **Codex CLI**, about 300 MB: `npm install -g @openai/codex`. If npm refuses with a
  permission error, use `brew install --cask codex` instead; never `sudo`.
  Official page: https://github.com/openai/codex
- **Antigravity CLI**, about 220 MB:
  `curl -fsSL https://antigravity.google/cli/install.sh | bash`. It also adds a line to her
  shell settings so the program can be found: say so when you announce it.
  Official page: https://antigravity.google/docs/getting-started?tab=cli
- **Gemini CLI**, about 100 MB: `npm install -g @google/gemini-cli`.
  Official page: https://github.com/google-gemini/gemini-cli

The commands were checked on those pages on 2026-11-16. If one fails, open its page; if the
command there has changed, use the page's command and tell her.

### Sign in: she does it, you wait

First tell her how to open Terminal:

> ขั้นต่อไปพี่เอมต้องเข้าสู่ระบบเองค่ะ ขั้นแรก เปิดแอป Terminal หน้าต่างสำหรับพิมพ์คำสั่งก่อนนะคะ กดปุ่ม Command กับ Space พร้อมกัน พิมพ์คำว่า Terminal แล้วกด Enter ค่ะ เปิดได้แล้วบอกได้เลยนะคะ

Then, after she says it is open, the step for her choice:

- **Codex CLI**:
  > ในหน้าต่าง Terminal พิมพ์ `codex login` แล้วกด Enter ค่ะ จะมีหน้าเว็บเปิดขึ้นมา ให้เข้าสู่ระบบด้วยบัญชี ChatGPT ตามที่หน้าเว็บบอก พอหน้าเว็บบอกว่าเสร็จแล้ว กลับมาบอกได้เลยค่ะ

  When she says it is done, `codex login status` shows whether she is signed in (it prints the
  method, never a secret).
- **Antigravity CLI**: a new window is needed so the program can be found.
  > ปิดหน้าต่าง Terminal เดิม แล้วเปิดหน้าต่างใหม่ก่อนนะคะ จากนั้นพิมพ์ `agy` แล้วกด Enter ค่ะ ถ้ามีคำถามเรื่องสีหรือการแสดงผล กด Enter ข้ามไปได้เลย จะมีหน้าเว็บเปิดขึ้นมา ให้เข้าสู่ระบบด้วยบัญชี Google พอเสร็จแล้วปิดหน้าต่าง Terminal ได้เลยค่ะ แล้วกลับมาบอกนะคะ
- **Gemini CLI**:
  > ในหน้าต่าง Terminal พิมพ์ `gemini` แล้วกด Enter ค่ะ แล้วทำตามที่หน้าจอบอกเพื่อเข้าสู่ระบบด้วยบัญชี Google ของที่ทำงาน พอเสร็จแล้วปิดหน้าต่าง Terminal ได้เลยค่ะ แล้วกลับมาบอกนะคะ

### Save the choice and test it

1. Save it:
   - Codex CLI: `profile.mjs set image_cli codex`, then `profile.mjs set image_cmd null`.
   - Antigravity CLI: `profile.mjs set image_cli gemini`, then
     `profile.mjs set image_cmd "agy --dangerously-skip-permissions"` (that exact string).
   - Gemini CLI: `profile.mjs set image_cli gemini`, then `profile.mjs set image_cmd null`.
2. `doctor.sh --agent claude` must now print `image-cli: ok codex` (Codex CLI), `image-cli: ok gemini`
   (Gemini CLI) or `image-cli: ok custom command` (the Antigravity CLI is saved as a command, so it
   always prints this, as does any `PAIM_IMAGE_CMD`).
   `MISSING image-cli (agy not found)` right after installing the Antigravity CLI means this
   session started before the program was added: ask her to close and reopen this app, then say
   "ทำต่อค่ะ". Do not change her shell settings yourself.
3. Tell her it takes a minute or two, then run
   `rm -f "<config dir>/test/sample.png"` and
   `<skill>/.venv/bin/python <skill>/scripts/image_cli.py test`.
   - Exit 0: it prints the path of the keyed sticker. Open it and show it to her:
     > โปรแกรมช่วยวาดภาพใช้ได้แล้วค่ะ นี่คือภาพทดลอง ตะกร้าใส่เหรียญค่ะ ในคลิปจริงจะเป็นภาพตามเรื่องที่เล่าค่ะ
   - Exit 2: it prints one sentence on why it could not draw. Put that sentence in plain Thai
     (no file paths, no English terms), then ask her one question: try again, or use the other
     choice. Do not go on to section 5. Common sentences:
     - `… is not installed …`: the install did not finish; offer to install again.
     - `… stopped with exit code … and drew nothing; see <log>`: read the last lines of that
       log first. If it is about signing in, take her through the sign-in again.
     - `Gemini CLI on this machine cannot draw yet: Google no longer accepts this client …`: her
       account needs the Antigravity route; offer it (install, sign in, save as above).
     - `… quota is used up …` or `kept answering 429 …`: the drawing allowance is used up for
       now; offer to try later or to use the other choice.
     - `… finished but no picture appeared …`: offer one retry, then the other choice.

## 5. Brand details

Tell her first:

> ต่อไปเป็นข้อมูลของช่องค่ะ สีและตัวอักษรของ P.AIM กำหนดไว้แล้ว ไม่ต้องเลือกค่ะ ขอถามทีละข้อนะคะ

Then one question per message, in this order, saving each answer before the next question:

1. `handle`:
   > ชื่อช่องที่อยากให้ขึ้นท้ายคลิปคืออะไรคะ เช่น @ชื่อช่อง

   `profile.mjs set handle "<what she wrote>"`.
2. `logo` (optional):
   > มีไฟล์โลโก้ที่อยากให้ขึ้นท้ายคลิปไหมคะ ถ้ามีส่งไฟล์มาได้เลย ถ้าไม่มีก็ข้ามได้ค่ะ

   With a file: `mkdir -p "<config dir>/assets"`, copy it there with a plain shell copy
   (`cp "<her file>" "<config dir>/assets/logo.png"`; keep her file's extension if it is not
   `.png`), then `profile.mjs set logo "<config dir>/assets/logo.png"` with the full path
   written out. Without one: leave `logo` empty and go on.
3. `disclaimer` (optional):
   > อยากให้มีข้อความเตือนสั้น ๆ ท้ายคลิปไหมคะ แนะนำว่า "ไม่ใช่คำแนะนำการลงทุน" ค่ะ

   Accepts the suggestion: `profile.mjs set disclaimer "ไม่ใช่คำแนะนำการลงทุน"`. Her own
   wording: save that. None: leave it empty.
4. `audience`:
   > คนดูส่วนใหญ่ของช่องเป็นใครคะ เล่าสั้น ๆ ประโยคเดียวพอค่ะ

   `profile.mjs set audience "<her sentence>"`.
5. `tone`:
   > อยากให้คลิปพูดน้ำเสียงแบบไหนคะ เป็นกันเอง สุภาพเป็นทางการ หรือสนุกกระชับคะ

   `profile.mjs set tone "<her choice>"`, one of `เป็นกันเอง`, `สุภาพเป็นทางการ`, `สนุกกระชับ`.
6. `projects_dir`:
   > จะให้เก็บคลิปไว้ในโฟลเดอร์ Movies ชื่อ paim-reels เลยไหมคะ หรืออยากเก็บที่อื่นคะ

   Default: `~/Movies/paim-reels`. Write the full path (expand `~` to her home folder), make it
   with `mkdir -p`, then `profile.mjs set projects_dir "<full path>"`.

## 6. First clip

Make the bundled example with her settings, so she sees a clip before she records anything. No
pictures are drawn: the example brings its own.

> ต่อไปจะลองทำคลิปตัวอย่างให้ดูหนึ่งคลิปนะคะ อาจใช้เวลาไม่กี่นาทีไปจนถึงสิบกว่านาที ระหว่างนี้พักก่อนได้เลยค่ะ

(The render prints nothing while it works; on the test Mac this 36 s example took from about one
minute to about 15 minutes, depending on what else the Mac was doing. Run it in the background if
your tools allow, and wait for it.)

`<projects_dir>` is `profile.mjs get projects_dir`. The sample goes to `<sample>`, which is
`<projects_dir>/example` unless that folder holds something of hers:

- `<projects_dir>/example` does not exist → `<sample>` is that folder.
- It exists and its `story.json` has `"slug": "etf-vs-stock"` → it is this sample from an
  earlier try: remove it, and `<sample>` is that folder.
- It exists and is anything else (no `story.json`, or another slug) → it is hers: leave it
  untouched, and `<sample>` is `<projects_dir>/example-sample`, under the same two rules. If
  `example-sample` is also something else, ask her where the sample may go.

Then:

```
cp -R <skill>/examples/etf-vs-stock <sample>
<skill>/.venv/bin/python <skill>/scripts/timing.py estimate <sample>
node <skill>/scripts/build.mjs <sample>
node <skill>/scripts/render.mjs <sample> --preview
```

`render.mjs` prints `N frames -> …` and `preview -> …`: the draft is
`<sample>/renders/etf-vs-stock-draft.mp4` and its preview `etf-vs-stock-draft-preview.mp4`.
Send her the preview:

> นี่คือคลิปตัวอย่างค่ะ คลิปนี้ยังไม่มีเสียงพี่เอม มีแค่เสียงเอฟเฟกต์เบา ๆ เพราะยังไม่ได้อัดเสียงค่ะ ฉากตะกร้าเป็นรูปถ่ายจริงที่เจ้าของรูปให้ทุกคนใช้ได้ฟรี ท้ายคลิปจะเห็นชื่อช่องที่เพิ่งตั้งไว้ คลิปจริงจะมีเสียงพี่เอมและคำบรรยายตรงกับเสียงค่ะ

If a command exits non-zero, run `doctor.sh` again and fix what it reports (section 3); do not
go on until the draft exists.

## 7. Recording guide and cheat sheet

First tell her, in one message, what comes with every clip (pictures from the web, and Studio):

> ก่อนจบ ขอเล่าสามเรื่องที่ควรรู้นะคะ
> เรื่องแรก ทุกคลิปมีเสียงเอฟเฟกต์เบา ๆ ตอนภาพขึ้นและตอนเปลี่ยนฉาก เสียงพี่เอมจะดังกว่าเสมอค่ะ
> เรื่องที่สอง ของจริงที่มีชื่อเรียก เช่น ตึก ธนบัตร หรือสถานที่ ผู้ช่วยจะค้นรูปถ่ายจากเว็บมาใส่ให้ รูปบนเว็บส่วนใหญ่มีเจ้าของค่ะ
> รูปไหนที่ไม่รู้ว่าเจ้าของให้สิทธิ์ใช้หรือไม่ อาจติดลิขสิทธิ์ได้ ผู้ช่วยจะแจ้งรูปเหล่านั้นทุกครั้ง จะใช้รูปนั้นหรือไม่ พี่เอมเป็นผู้ตัดสินใจค่ะ
> คลิปที่มีรูปจากเว็บ จะมีไฟล์บอกที่มาของรูปแนบไปด้วยทุกครั้งค่ะ
> เรื่องที่สาม คลิปที่มีเสียงพี่เอมแล้ว เปิดแก้เองได้ในโปรแกรม OpenFilm Studio ซึ่งเป็นโปรแกรมแก้คลิปที่เปิดในหน้าเว็บบนเครื่องนี้ค่ะ คลิปร่างยังเปิดแก้ไม่ได้นะคะ
> ครั้งแรกที่เปิด เครื่องต้องดาวน์โหลดประมาณ 100 MB ผู้ช่วยจะถามพี่เอมก่อนค่ะ
> โปรแกรมแก้คลิปเป็นของพี่เอม ผู้ช่วยจะไม่ปิดให้ แก้เสร็จแล้วพี่เอมปิดเองได้เลยค่ะ
> คลิปที่แก้เองแล้ว ให้ส่งออกจากโปรแกรมแก้คลิปนั้นเลย ไฟล์ที่ผู้ช่วยทำไว้จะไม่เปลี่ยนตามค่ะ

Then send her the text of `references/cheatsheet-th.md` as it is, and tell her she can keep it:

> นี่คือคู่มือย่อค่ะ มีวิธีสั่งทำคลิปและวิธีอัดเสียง เก็บไว้ดูได้เลยนะคะ

Then run `profile.mjs done --agent <agent>`. It prints `onboarding done (…)`. Exit 1
`onboarding incomplete, missing: …` names what is still empty: go back to that step. Run
`doctor.sh --agent <agent>` once more; it exits 0 now.

> ตั้งค่าเสร็จเรียบร้อยแล้วค่ะ อยากทำคลิปเรื่องไหน พิมพ์ว่า "ทำ reel เรื่อง" ตามด้วยหัวข้อได้เลยค่ะ

If her first message was already a reel request, ask whether to start that one now.

## 8. Set up again

When she says "ตั้งค่าใหม่", "set up again", or asks to change one setting: run
`profile.mjs show`, then ask which part to change (skip the question if she already named it):

> อยากเปลี่ยนส่วนไหนคะ ชื่อช่อง โลโก้ ข้อความเตือนท้ายคลิป กลุ่มคนดู น้ำเสียง ที่เก็บคลิป หรือโปรแกรมช่วยวาดภาพคะ

Change only that part, with its question from section 4 or 5, and touch nothing else:

| She says | Key | Do |
|---|---|---|
| ชื่อช่อง | `handle` | section 5, question 1 |
| โลโก้ | `logo` | section 5, question 2; to remove it, `profile.mjs set logo ""` |
| ข้อความเตือนท้ายคลิป | `disclaimer` | section 5, question 3; to remove it, `profile.mjs set disclaimer ""` |
| กลุ่มคนดู | `audience` | section 5, question 4 |
| น้ำเสียง | `tone` | section 5, question 5 |
| ที่เก็บคลิป | `projects_dir` | section 5, question 6; reels already made stay where they are |
| ชื่อที่ให้เรียก | `display_name` | ask the name, `profile.mjs set display_name "<name>"` |
| โปรแกรมช่วยวาดภาพ | `image_cli`, `image_cmd` | all of section 4 (Claude Code only) |

Confirm the change in one sentence and stop; `onboarded_at` stays as it is. Run
`profile.mjs reset --yes` only when she explicitly asks to start everything from zero, and only
after she confirms once more:

> จะลบการตั้งค่าทั้งหมดแล้วเริ่มใหม่ตั้งแต่ต้น ใช่ไหมคะ

After the reset, begin again at section 2.
