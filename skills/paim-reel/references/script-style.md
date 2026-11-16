# Writing `script.md`

`script.md` is what P.AIM says, line by line. Captions show its spelling, the story anchors to
its lines and phrases, and the timing is measured against it.

## Format

```
# <title, for people; ignored by the tools>

l01: ซื้อหุ้นตัวเดียว หรือซื้อ ETF ทั้งตะกร้า แบบไหนดีกว่า
l02: หุ้นหนึ่งตัว คือการเป็น เจ้าของบางส่วน ของบริษัทเดียว
```

- Only lines that start `lNN:` are spoken (`l01`, `l02`, … at least two digits, each id once).
  Every other line is ignored.
- A **phrase** is the text between two spaces. Each phrase becomes one caption, shown on its own,
  and is an anchor target (`l02@1` is the second phrase of `l02`).
- Put a space between phrases and keep every phrase to **14 base characters** or fewer (Thai
  vowel and tone marks above or below a letter do not count). `timing.py` exits 2 and prints
  `tokens over 14 characters, add spaces to split them:` with each long phrase; split those
  phrases at a natural word break and run it again.
- Thai does not use spaces between words, so the phrase spaces are yours to add: break where a
  speaker would breathe or stress, 4–12 characters per phrase reads best.

## Shape of a reel

- 8–14 lines. `timing.py estimate` reads 0.08 s per base character, 0.30 s between lines and
  0.25 s at each end, and prints `estimated 34.0 s, 12 lines`. The estimate is a floor: real
  speech usually runs longer, so aim for an estimate of 30–50 s.
- **Hook in the first line**: a question or a surprise the viewer wants answered.
- **One idea per line.** If a line needs "and" to hold two ideas, make it two lines.
- End on a takeaway line: what to remember, not what to buy.
- Write for the profile's `audience` in its `tone` (`scripts/profile.mjs get audience`,
  `… get tone`). An empty `audience` means beginners; an empty `tone` means friendly, plain
  speech. Plain spoken Thai; explain any finance word the first time it appears.
- Spell numbers the way they are read (`ห้าสิบตัว`, `สามเปอร์เซ็นต์`, `หนึ่งพันห้าสิบบาท`), not
  as digits. P.AIM then reads exactly what is written and the alignment matches her voice. The
  figure itself goes on screen as a `number` item with its `source`.

## Content rules

Educational finance content only:

- No promise or prediction of returns ("ได้กำไรแน่", "ขึ้นแน่นอน").
- No individual investment advice: no "buy X", no telling a viewer what suits them personally.
  Compare options by who they tend to suit, in general terms.
- Every figure shown on screen is fact-checked on the web and carries a `source` in
  `story.json`, in both modes (in voice mode, check the figures P.AIM says). See "Figures and
  sources" below. A figure you cannot verify stays off the screen; say so in the delivery
  report.
- No company names, logos or brand marks unless P.AIM's own script or recording uses them; never
  in sprites.

## Figures and sources

- `source` names the publisher, the page, the URL and the access date:
  `"<publisher>, <page>: <what it says>. <url> (accessed YYYY-MM-DD)"`.
- Where to look, in order: a Thai regulator or exchange (the SEC Thailand, the Bank of Thailand,
  the Stock Exchange of Thailand), then another country's regulator, then a named reference work.
  Prefer stable, definitional figures (how many stocks an index holds) over returns or prices,
  which go stale.
- A figure you computed from sourced inputs may go on screen with
  `source: "computed: 1000 × 1.05, inputs from <source>"`.
- A made-up illustration (an example deposit, an example price) is allowed only when the spoken
  line calls it hypothetical (`สมมติ…`) and its `source` says `hypothetical example`. Changing
  the currency of a source's worked example is allowed only for such a labelled illustration.
- Shown numbers get thousands separators (`1,050`) unless the item sets `"group": false` (a
  year, for example).

## Voice mode: from `script.draft.md` to a confirmed `script.md`

When P.AIM sends a recording without a script, `transcribe.py` writes `script.draft.md`: one
`lNN:` line per recognised segment, and **no spaces between phrases** (each line is one long
phrase). The project then moves through three files:

| File | Written by | Means |
|---|---|---|
| `script.draft.md` | `transcribe.py` | what the recogniser heard; never timed or shown |
| `script.proposed.md` | you | your corrected text, waiting for her confirmation |
| `script.md` | you, after her answer | the script she supplied or confirmed; the only one the tools read |

Write the proposal to `script.proposed.md`, never straight to `script.md`, and correct only:

1. Spelling the recogniser got wrong (finance words, English terms such as `ETF`).
2. Phrase spaces: split every line into phrases of at most 14 base characters.
3. Line breaks: join or split lines so each holds one idea, keeping the words in order. Lines
   need not match the draft's segments one to one.
4. Numbers: spell them the way she read them.

Never change, add or remove what was said: the captions must match her voice, and
`timing.py align` reports any line that drifts (`LOW lNN …`).

The recogniser often mishears Thai ("บริสัตว์" for "บริษัท"). Fix a word only when the intended
word is certain from context; otherwise write `[?]` in its place. Never fill a gap from
`examples/` or from what the topic "should" say: those are not her words. Then stop and show
P.AIM the whole proposal, line by line, and ask her to confirm or fix it. She is the only one
who heard the recording. If you come back to a project that has `script.proposed.md` and no
`script.md`, her answer is still pending: show the proposal again and wait.

After her answer, write `script.md` with her fixes and every `[?]` filled in. `timing.py`
refuses a script that still holds `[?]` (exit 2, naming the lines).

## The read-aloud sheet (topic mode)

Hand P.AIM a sheet she can read straight from her phone. Write it to `<project>/read-aloud.md`:

```
# อ่านออกเสียง: <title>

ยาวประมาณ <estimated duration, rounded> วินาที · อ่านต่อเนื่องในเทคเดียว · เว้นจังหวะสั้น ๆ ระหว่างบรรทัด

1. ซื้อหุ้นตัวเดียว หรือซื้อ ETF ทั้งตะกร้า แบบไหนดีกว่า
2. หุ้นหนึ่งตัว คือการเป็น เจ้าของบางส่วน ของบริษัทเดียว
…

อัดด้วย Voice Memos ในห้องเงียบ ถือโทรศัพท์ห่างปากประมาณหนึ่งคืบ แล้วส่งไฟล์ .m4a กลับมาได้เลยค่ะ
```

One numbered line per `lNN:` line, with the same words and spaces as `script.md`, no ids.
