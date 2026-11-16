# P.AIM brand rules for reels

The engine already enforces most of this. Read it before writing a story, so the story asks for
what the engine allows, and before judging a contact sheet.

## Colours

| Token | Hex | Role |
|---|---|---|
| `orange` | `#F5820B` | the subject of the line: headline pill, highlighted caption pill, ring marks, the key icon or figure |
| `green` | `#14856D` | growth, the safer option, trust: positive values, the end card |
| `charcoal` | `#252B31` | main text; the background of contrast scenes |
| `cream` | `#FFFAF0` | the soft default background |

Scene backgrounds are `cream` (default) or `charcoal`. Use a charcoal scene for a turn in the story
(a risk, a cost, a "but").

## Paper

Every background is handmade paper in the scene colour (the end card in green), painted by our own
code (`engine/paper.mjs`; no picture or texture file is used):

- soft mottling and pulp relief within ±3% lightness;
- 260 raised fibres, 40-220 px long, 1-2 px wide, ±6% lightness;
- 46 flecks of pressed petal, 6-26 px, at 55% opacity, in muted orange, green and charcoal (on
  charcoal paper cream instead of charcoal; on green paper cream instead of green). A large fleck is
  muted further, so it never moves a patch of paper by more than a few levels.

The paper is seeded from the story's `slug`: it is painted once when the page loads and is the same
in every frame and on every render. Any 40 × 40 px patch of it averages within 10 levels (per RGB
channel) of the scene colour, so the text pairs below keep their contrast.

A scene's `frame` (`orange`, `green` or `charcoal`) shows its paper as a torn sheet laid over paper of
that colour: 36 px of the frame colour shows around it, the tear wanders up to 14 px further in, with
a soft shadow, a thinned see-through margin and a few loose fibres. Every text zone lies inside the
sheet. Use a frame sparingly, for one scene that should stand apart (the key point, the takeaway).

Colour use in a story: give the thing each line is about `orange`; give growth or the safer
option `green`; keep `charcoal`/`cream` icons for neutral things. One orange subject per scene
reads best.

## Text colour pairs

Text may only use these pairs (text colour on background). Measured WCAG contrast:

| Text on background | Contrast | Used for |
|---|---|---|
| charcoal on cream | 13.7 | captions and labels on cream scenes |
| charcoal on orange | 5.5 | headline pill, highlighted caption, orange pills and number chips |
| cream on charcoal | 13.7 | captions and labels on charcoal scenes; charcoal pills |
| cream on green | 4.4 | green pills and number chips, the end card |

Not allowed: orange text on cream (2.5) and green text on charcoal (3.1). That is why an orange
highlight is an orange pill behind charcoal text, and why a `number` sits on a chip of its own
colour. Icons, sprites, bars and marks are graphics, not text: any brand colour on either
background.

## Type

Every text element uses `"Sukhumvit Set", "IBM Plex Sans Thai", sans-serif`, line height 1.4.

| Element | Size / weight | Notes |
|---|---|---|
| headline | 96 px / 700 | orange pill, charcoal text, centred in HEADLINE; shrinks to 56 px to fit |
| caption | 84 px / 700 | one phrase at a time, centred in CAPTION; shrinks to 52 px; a highlighted phrase sits on an orange pill and grows 0.92 → 1 over 0.12 s |
| item label | 52 px / 700 | under the picture, in the scene's text colour; not shrunk, so keep labels short |
| pill item | 64 px / 700 | one line; shrinks to 32 px to fit its slot, else `clipped` |
| number item | 140 px / 700 | one line, thousands separators; counts up over 0.8 s; shrinks to 56 px to fit, else `clipped` |
| end card "ติดตาม" | 120 px / 700 | cream on green |
| end-card handle, disclaimer | 40 px / 400 | shown when the profile sets them |
| draft banner | 40 px / 700 | `DRAFT · ยังไม่มีเสียง`, on every frame of an estimated-timing render |

Fonts: Sukhumvit Set ships with macOS and is used when present. It is not redistributable: the
skill never contains or copies its files. Elsewhere the engine loads IBM Plex Sans Thai (OFL-1.1,
installed from npm with the skill). `check.mjs` prints which one drew the text (`font: …`); say it
in the delivery report.

## Canvas and zones

Canvas 1080 × 1920 px, 30 fps. Output H.264 yuv420p with AAC 48 kHz audio.

| Zone | Rect | Meaning |
|---|---|---|
| SAFE | x 70–1010, y 220–1500 | all text must stay inside |
| RIGHT_UI | x 930–1080, y 1000–1920 | the phone's like/share column: no text may touch it |
| HEADLINE | x 90, y 240, 900 × 170 | where a scene headline sits |
| CONTENT | x 90, y 440, 900 × 720 | where the layout slots place items |
| CAPTION | x 180, y 1250, 720 × 230 | where the caption phrase sits; no item may cover a caption |

Reel length = voice length + a 2.0 s green end card.

## Pictures

- Sprites are flat sticker illustrations of one generic object each, in the four brand colours plus
  white, drawn by the user's image CLI on a flat magenta `#FF00FF` background that is keyed out
  (a green key would remove brand green). `gen_sprites.py` flags `OFF-PALETTE` when under 80% of a
  sprite's pixels are near the palette.
- Icons are Phosphor (MIT), weights `fill` and `duotone`, in a brand colour.

## Never

- No third-party logos, brand marks, mascots or real people: not in sprites, icons, labels or
  captions. Phosphor names ending in `-logo` are refused. Describe sprites as generic objects
  ("an office building", not a company's tower).
