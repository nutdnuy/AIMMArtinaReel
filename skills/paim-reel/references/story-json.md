# `story.json`: what is on screen, and when

The story says which pictures appear, where, and on which spoken phrase. It is anchored to
`script.md` lines and phrases, never to seconds, so the same story is re-timed unchanged when the
voice replaces the estimated timing. `build.mjs` validates it against `timing.json` and prints
every problem at once (one per line, exit 2).

## Schema

```
story  {slug: /^[a-z0-9-]+$/, title: string, music?: string|null, sfx?: boolean (default true), highlight?: Anchor[], scenes: Scene[]}
Scene  {id, from: "lNN", layout: center|row|stack|versus|grid, bg?: cream|charcoal (default cream),
        frame?: orange|green|charcoal, headline?: {text, at?: Anchor}, items: Item[], marks?: Mark[]}
Item   common: {id, type, at: Anchor, slot?: int (default = index), enter?: pop|drop|slide-l|slide-r|rise|fade (default pop),
                idle?: none|bob|sway|pulse (default none), exit?: Anchor, x?, y?, size?}
       sprite: {sprite: /^[a-z0-9-]+$/, label?: string}        # <project>/gen/sprites/<sprite>.png
       photo:  {photo: /^[a-z0-9-]+$/, label?: string, treatment?: mono|color (default mono)}   # <project>/gen/photos/<photo>.jpg
       icon:   {icon: phosphor-name, weight?: fill|duotone, color: orange|green|charcoal|cream, label?: string}
       pill:   {text, bg: orange|green|charcoal}
       number: {to: number, from?: 0, decimals?: 0, prefix?: "", suffix?: "", group?: true, color, label?, source: non-empty string}
       bar:    {value: 0..1, color, label?}
Mark   arrow: {type, from: itemId, to: itemId, at}   ring: {type, on: itemId, at}   cross: {type, on: itemId, at}
Anchor "l05" (line start) | "l05@2" (0-based phrase index) | either + "+0.2" / "-0.1" seconds
```

## Resolution rules

- Scene `t0` = the time of its `from` line, except the first scene, which starts at 0 and must
  start `from` the first line. Scene `t1` = the next scene's `t0`; the last scene ends at
  `timing.duration` (`voiceEnd`). Scenes follow the script in order. Reel duration =
  `voiceEnd` + 2.0 s end card.
- Every `at` (item, headline, mark) must fall inside its scene. A headline without `at` shows
  from the scene start. `exit` must come after the item's `at`; the item fades out over 0.2 s.
- Item ids are unique within a scene; marks point at item ids of the same scene.
- Item rect: when `x` and `y` are given they are the item's centre in canvas px and `size` its box
  side (default 240), and the item takes no slot. Otherwise the layout gives the rect from
  `slotRect(layout, n, slot)`, where `n` counts only the scene's items without `x`/`y`. Layout
  capacity applies to `n`; two items may not share a slot. `seed` = index of the item in the whole
  story (it only shifts the phase of the idle loop).
- A caption runs from its phrase's `t0` to the next phrase's `t0` in the same line; a line's last
  phrase runs to `min(line.t1 + 0.40, next line t0)`, or `min(line.t1 + 0.40, voiceEnd)` for the
  last line, so no caption shows over the end card.
- `highlight` lists anchors (offsets ignored; a bare `l05` means its first phrase). A highlighted
  phrase is drawn charcoal on an orange pill.
- `frame` (optional): the scene's paper becomes a torn sheet over paper of that colour, 36 px of it
  showing round the edge. Layout, text zones and text colours do not change (the text is on the
  sheet, which is still `bg`). Any other value is a build problem. Without `frame` the scene's paper
  fills the canvas.
- `music` (optional): an audio file, absolute or relative to the project folder, mixed at
  -30 dB under the voice in the final render and faded out over the end card.
- `sfx` (optional, default `true`): sound effects placed from the story, nothing to write. `false`
  turns them all off (a draft then has no audio at all). They come from `assets/sfx/` and sit under
  the voice; the sum goes through a limiter at -1.2 dBFS (true peak), the level `prep_voice.py` already holds the voice to, so a prepared voice is not changed where no effect plays. A draft carries the effects
  only: no voice, no music. A part render (`--from/--to`) has no audio.

  | When | Sound | Level |
  |---|---|---|
  | a scene starts (not the first) | `paper` | -20 dB |
  | an item enters: `pop` / `drop` / `slide-l`, `slide-r`, `rise` / `fade` | `pop` / `thud` / `whoosh` / none | -16 / -16 / -20 dB |
  | a `photo` item enters (instead of its entrance sound) | `paper` | -18 dB |
  | a mark is drawn | `tick` | -18 dB |
  | a `number` counts (0.2, 0.45, 0.7 s after it appears, besides its entrance) | 3 x `tick` | -22 dB |
  | the end card starts | `chime` | -16 dB |

  A sound is dropped when the same sound played less than 0.12 s before, and at most 60 effects
  are placed (the earliest). Levels are relative to the files, whose peak is -3 dBFS.

## Layouts (canvas px; CONTENT is x 90–990, y 440–1160)

| Layout | Holds | Slot rects |
|---|---|---|
| `center` | 1 | 720 × 720 at x 180, y 440: the biggest picture |
| `row` | 3 | side by side, y 440–980; width 440 (1 item), 435 (2), 280 (3); label under the picture |
| `stack` | 3 | 760 wide (x 160–920), 240 tall (224 for 3), top to bottom, centred; a sprite, icon or photo label sits beside its picture |
| `versus` | 2 | 760 × 340, top (y 440) and bottom (y 820): the "this or that" split; labels beside the pictures |
| `grid` | 6 | 2 columns × 3 rows of 435 × 220, left to right then down; a lone last cell is centred. The right cell of the last row reaches the phone-button column: a long label there fails `check.mjs` with `right-ui` |

Pick by what the line compares: one thing → `center`; a sequence or cause → `row`; a ranked list
→ `stack`; a choice between two → `versus`; many members of a group → `grid`. Fewer, larger
pictures read better than full grids: prefer `center`, `versus` and `row` of 2.

## Items

- `sprite`: a generated sticker, `gen/sprites/<sprite>.png` (made by `gen_sprites.py`; never the
  `-raw` file). The same sprite may appear in many scenes. Drawn contained in its rect.
- `photo`: a real picture from the web, drawn as a cream paper card with a torn edge, a soft shadow and a
  tilt of up to 2° (from the item's `seed`), the picture cropped to fill it; the label goes where a
  sprite's would. `mono` (default) is desaturated with a warm paper tint, `color` shows it as it is.
  Marks go round the card. `gen/photos/<photo>.jpg` and its entry in `gen/photos/credits.json` come
  from `scripts/fetch_photo.py`; a photo without both is a build problem naming `fetch_photo.py`.
  Rules for choosing and fetching photos, and the credits for the delivery note: `photos.md`.
- `icon`: a Phosphor icon by name (`basket`, `buildings`, `coins`, `piggy-bank`, `chart-line-up`,
  `trend-down`, `shield-check`, `receipt`, `bank`, `wallet`, `scales`, …). An unknown name fails
  with "Did you mean: …" suggestions. Names ending `-logo` are refused. The same icon may be used
  with both weights in one story.
- `pill`: a short phrase on a coloured pill, always on one line (64 px, shrinks to 32 px to fit
  its slot; a phrase that does not fit even then is `clipped`). Keep it to one short phrase.
- `number`: a figure that counts up over 0.8 s on a chip of its `color`, on one line (140 px,
  shrinks to 56 px). Thousands separators are shown (`1,050`, `1,102.50`) unless
  `"group": false` (use that for a year). `source` is required and must say where the figure
  comes from (rules in `script-style.md`, "Figures and sources"). No source, no number on
  screen.
- `bar`: a bar that fills to `value` over 0.6 s; it grows upwards in a tall rect, rightwards in a
  wide one.
- `label`: 52 px under the picture (beside it in `versus` and `stack`). Labels are not shrunk:
  keep them to one short phrase (about 12 base characters, less in a row of 3).

## Marks

Marks are drawn on the item's picture (its art area), never over its label.

- `arrow` from one picture to another ("leads to"), drawn on over 0.3 s in the scene's text
  colour.
- `ring`: an orange ellipse around a picture ("this one"), pulled in on the label's side so the
  label stays clear.
- `cross`: two strokes over a picture, in the scene's text colour ("not this").

A mark shows only while every item it points at is visible. Add a mark only when it says one of
those three things.

## Motion vocabulary

| Enter (0.40 s) | Start state |
|---|---|
| `pop` (default) | scale 0, overshoots past full size, settles |
| `drop` | 420 px above, falls in |
| `slide-l` / `slide-r` | 520 px to the left / right, slides in |
| `rise` | 260 px below, rises in |
| `fade` | opacity only |

Opacity reaches 1 at 40% of the entrance. Idle loops start as the entrance ends: `bob` ±10 px
every 2.4 s, `sway` ±3° every 3.0 s, `pulse` ±4% every 1.6 s, `none` (default). Headlines pop.
Every frame is a function of time alone, so any frame renders the same in any order.

## Writing a good story

- One scene per idea, usually one or two lines each. Use a `charcoal` scene for the turn (a risk,
  a cost, a "but"); keep most scenes `cream`. A `frame` sets one scene apart (the key point or the
  takeaway); one or two per reel is plenty.
- Something new (a scene, an item, a mark or a headline) at least every 3.0 s, or `check.mjs`
  reports a dead beat. Bring items in on the phrase that names them (`l03@1`), not all at the
  line start.
- The picture is the thing the line names. Give the subject of each line `orange`; give growth or
  the safer option `green`.
- Highlight the one phrase per line that carries the point.
- Open with a hook scene (a `versus` suits a "this or that" topic); end on a takeaway scene.
- Headlines are a few words (they shrink from 96 to 56 px to fit one 900 px line).

## Fixing a dead beat ("nothing new for more than 3 s")

Work down this list; stop at the first that fixes it.

1. Spread what the scene already has: move items' `at` to later phrases (`l04@2` instead of
   `l04`), so they arrive one by one as the line names them.
2. Split a long scene in two at the line where the idea turns, each with its own layout.
3. Add a mark only when it says something: `ring` = this one, `arrow` = leads to, `cross` = not
   this. Never add a mark that means nothing.
4. If a line has nothing to show, the line is too long: shorten or split it in `script.md`, then
   run `timing.py` again.

## Worked example (the smallest story)

`script.md`:

```
l01: หุ้นคือ บริษัทเดียว
l02: ETF คือ ตะกร้าหุ้น
```

`timing.json` (from `timing.py estimate`, abridged): `estimated: true`, `duration: 3.0`; `l01`
0.25–1.30 s with phrases at 0.25 and 0.80; `l02` 1.60–2.75 s with phrases at 1.60, 1.95 and 2.30.

`story.json`:

```json
{
  "slug": "mini",
  "title": "Stock vs ETF",
  "highlight": ["l02@2"],
  "scenes": [
    {
      "id": "s1",
      "from": "l01",
      "layout": "versus",
      "items": [
        {"id": "stock", "type": "icon", "icon": "buildings", "color": "orange", "label": "หุ้น", "at": "l01"},
        {"id": "etf", "type": "icon", "icon": "basket", "color": "green", "label": "ETF", "at": "l02"}
      ]
    }
  ]
}
```

Resolved: one scene 0–3.0 s; `stock` pops into the top slot at 0.25 s, `etf` into the bottom
slot at 1.60 s; five captions, the last (`ตะกร้าหุ้น`) highlighted; end card 3.0–5.0 s. The full
reel in `examples/etf-vs-stock/` uses every layout but `stack` and `grid`, sprites, icons, a pill,
a sourced number and all three marks.

## `check.mjs` findings and their usual fix

To look at the result, `still.mjs <project> --scenes <out.png>` takes one frame per scene once
its last entrance, count-up and mark have finished.

`check.mjs` builds the project, opens it, and measures every text box at settled moments (after
each entrance; an item with an idle loop is judged over the loop's whole reach). It prints
`font: …`, then `text:`, `dead beats:` and `overlap:` lines, each `PASS` or `FAIL (n)` with one
line per finding: `<time> <kind> "<text>": <problem>`. A fourth line, `credits:`, is `PASS` or `FAIL (n)`
with one line per photo the story uses that has no entry in `gen/photos/credits.json` (`photos.md`).
Exit 0 only when all four pass.

| Finding | Meaning | Usual fix |
|---|---|---|
| `outside-safe` | text leaves x 70–1010, y 220–1500 (a headline its zone) | shorten the headline or label; move a free item (`x`/`y`) inward; drop an idle loop near an edge |
| `right-ui` | text touches the phone-button column (x ≥ 930, y ≥ 1000) | shorten the label; move the item to another slot or layout; move a free item left or up |
| `clipped` | text does not fit its box even at its smallest size (a `number` or `pill` too long for its one line) | fewer digits (use a suffix such as `ล้าน`), a shorter pill, or a bigger layout (`center`, row of 2) |
| `overlap` | a caption or headline covers a picture | do not place free items over y 1250–1480 or the headline zone; use slots |
| dead beat `a to b` | nothing new for more than 3.0 s | see "Fixing a dead beat" above |

`build.mjs` problems (exit 2) name the scene and item, for example
`scene "hook" item "etf": sprite "basket" has not been generated: run scripts/gen_sprites.py first`
or `layout versus holds at most 2 items, got 3`. Fix each line and build again.
