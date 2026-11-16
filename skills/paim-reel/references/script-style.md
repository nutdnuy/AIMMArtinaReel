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

- 8–14 lines for 30–60 s. `timing.py estimate` reads 0.08 s per base character, 0.30 s between
  lines and 0.25 s at each end; aim the estimate at the length asked for.
- **Hook in the first line**: a question or a surprise the viewer wants answered.
- **One idea per line.** If a line needs "and" to hold two ideas, make it two lines.
- End on a takeaway line: what to remember, not what to buy.
- Write for the profile's `audience` in its `tone` (`scripts/profile.mjs get audience`,
  `… get tone`). Plain spoken Thai; explain any finance word the first time it appears.
- Spell numbers the way they are read (`ห้าสิบตัว`, `สามเปอร์เซ็นต์`, `เซ็ตห้าสิบ`), not as
  digits. P.AIM then reads exactly what is written and the alignment matches her voice. The
  figure itself goes on screen as a `number` item with its `source`.

## Content rules

Educational finance content only:

- No promise or prediction of returns ("ได้กำไรแน่", "ขึ้นแน่นอน").
- No individual investment advice: no "buy X", no telling a viewer what suits them personally.
  Compare options by who they tend to suit, in general terms.
- Every figure shown on screen is fact-checked on the web and carries a `source` in
  `story.json` (publisher, page, URL, access date). Prefer stable, definitional figures (how many
  stocks an index holds) over returns or prices, which go stale. A figure you cannot verify
  stays out of the script and off the screen; say so in the delivery report.
- No company names, logos or brand marks unless P.AIM's own script or recording uses them; never
  in sprites.

## Voice mode: turning `script.draft.md` into `script.md`

When P.AIM sends a recording without a script, `transcribe.py` writes `script.draft.md`: one
`lNN:` line per recognised segment, and **no spaces between phrases** (each line is one long
phrase). Copy it to `script.md` and correct only:

1. Spelling the recogniser got wrong (finance words, English terms such as `ETF`).
2. Phrase spaces: split every line into phrases of at most 14 base characters.
3. Line breaks: join or split lines so each holds one idea, keeping the words in order.

Never change, add or remove what was said: the captions must match her voice, and
`timing.py align` reports any line that drifts (`LOW lNN …`). Numbers stay the way she said
them.

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
