# OpenFilm hand-off

After the MP4 is delivered, the reel is also exported as an OpenFilm project and opened in OpenFilm
Studio (github.com/openfilm/openfilm, MIT), a video editor that runs in the browser, so that P.AIM can
change it by hand. Our own renderer (`render.mjs`) still makes the MP4; Studio is an extra, not a
replacement. Everything here was learnt from OpenFilm 0.3.2 (`npx -y openfilm@latest --version`), by
reading what the tool prints and by using Studio on an exported reel. Where this file says "not
checked", nobody has looked: do not promise it to her.

## Run it

Only a final reel is exported (timing aligned to her recording). A draft (estimated timing, no voice yet)
is not exported: `export_openfilm.mjs` stops with one sentence (exit 2), there is no hand-off for a draft,
and the export happens once her voice is in.

```
node <skill>/scripts/export_openfilm.mjs <project>     # prints: openfilm -> <folder> (<n> clips)
bash <skill>/scripts/open_studio.sh <project>          # or the folder it printed, if not openfilm/
```

- Needs Node 22.2 or newer (`doctor.sh` prints `openfilm: ok` or `WARN openfilm (needs Node 22.2 or
  newer)`; on a WARN skip the hand-off and say so) and, the first time, a download of the OpenFilm
  package and a headless Chromium (about 100 MB) through `npx -y openfilm@latest`.
- `open_studio.sh` prints Studio's address and returns at once; Studio keeps running in the background
  on this computer (127.0.0.1). It may be a Studio she already has open with other films in it, so:
  Studio is hers; never stop or restart it. She closes it herself. (A command that stalls is stopped,
  with everything it started, after 3 minutes; a Studio that did start is left running.)
- The address Studio prints contains a local session key. Give it to her once, in the chat only. Never
  write it into a file, a note, a log, a commit message or the delivery note.
- The export makes no network call and needs no sign-in. Studio also has features that use online
  services (making voice-over, music, pictures; transcripts). Do not use them: her voice recording
  stays on this machine. Nothing in the hand-off connects a service for her.

## What the export holds: `<project>/openfilm/`

- `film.html`: the edit. 1080×1920. Tracks, top first: `Pictures` (one clip per scene plus the end
  card, end to end, covering exactly 0 to the reel's length), `Voice` (when `voice/voice.wav`
  exists), `Effects` (one clip per sound effect at its level; effects that overlap in time go on
  `Effects 2`, `Effects 3`, ... because clips on one track must not overlap), `Music` (when the
  story has `music`: at -30 dB like the render, repeated to the length of the reel, faded out over
  the end card; the fade is on its last piece).
- `scene-01.html` ... `endcard.html`: one page per scene. Each is our own `engine/` and `data.js`
  with a thin wrapper: `frame(t)` draws the reel at (scene start + t). There is no second drawing
  code, so the picture is the render's picture: our test compares the page at `frame(0.5)` with our
  page at the scene start + 0.5 s and the two screenshots are byte for byte the same. OpenFilm's own
  `look` of the same time differs from our render by a mean of 0.1 of 255 per pixel (it re-encodes
  the frame), nothing you can see.
- `assets/` (sprites, photos, fonts, logo, music, `voice.wav`, `sfx/`), `engine/`, `data.js`,
  `style.css`, and `.paim-export.json` (the manifest of file hashes, see "A re-export").

## What P.AIM can change in Studio (seen working, on 0.3.2)

This list was observed with OpenFilm 0.3.2. `open_studio.sh` runs `npx -y openfilm@latest`, so Studio may be
newer than that: the list must be checked again after an OpenFilm update (`--version` says which one ran).

Every change is written to `film.html` in `openfilm/` a moment after she makes it. Seen:

- Clip order: dragging a picture clip over its neighbour swaps them (`at` times follow).
- Cutting: the scissors button splits a clip at the playhead (two clips of the same scene page, the
  second starting where the first stopped); Delete removes a piece and the later picture clips close
  the gap.
- Sound levels: select the voice, an effect or the music, tab `Audio`, `Volume` in dB (-6 dB was
  saved as `volume="0.501"`). The `Properties` tab of a sound clip also has fades, start and end
  times, and speed.
- Text inside a scene: click a headline, caption, label or pill in the picture, then `Text` in the
  panel; the new words show at once and are saved as an `overrides` entry on that scene's clip.
  The panel also offers position, size, angle, font, weight and size for it.
- Pictures inside a scene: click a sprite, icon or photo and move, resize or rotate it (moving a
  sprite 210 px was saved as a translate of `[210,0]`), or crop and fit it.
- Fades, motion, adjust and effects tabs exist on a picture clip; `Advanced` lists the changes
  inside the page and has `Replace` for the page file. I only looked at these tabs.

## What to tell her, plainly

- Our scene logic does not run on her edit. Studio applies a change after the page has drawn its
  frame, so a headline she retypes is not shrunk to fit and a picture she moves does not make the
  arrows or rings follow it. That follows from how OpenFilm applies changes (its SPEC); I did not
  try a long text or a marked picture. She should look at the result.
- Cutting or reordering picture clips does not cut the voice. In the cut I made, the voice clip kept
  its place (and sound clips starting after the cut moved up, the voice, running across it, did
  not), so the picture and her voice drift apart unless she cuts the voice at the same spot. Whether
  effect clips follow a reorder is not checked.
- Studio mixes the clips as they stand. Our render's limiter and loudness measurement are not in
  it: the final MP4 she exports from Studio is not the loudness-checked file the skill delivered.
  OpenFilm's `render --loudness=-14` exists (its help says so); I did not run it on a reel.
- Studio never changes `story.json`, `timing.json` or our MP4. Her edits live only in `openfilm/`.

## Not checked

- Trimming by dragging a clip's edge (my automated drag did not move the edge; splitting and
  deleting did work), the Export button inside Studio (the command `openfilm render` does render the
  export; a 2 s range gave a 1080×1920, 30 fps H.264 + AAC file), undo, hiding or muting a track,
  adding her own pictures or music, captions made in Studio, and the Motion and Effects tabs.
- Studio in a browser other than the one OpenFilm opens (its README says Chrome or Edge).

## A re-export

Re-running the export never silently destroys her edits. Each export writes a manifest of file
hashes into its folder. Before writing, the export compares `openfilm/` with its manifest:

- unchanged (she opened it in Studio but changed nothing: opening alone changes no file): it is
  refreshed in place;
- changed, with a file added or removed, or with no manifest: it is left alone, the export goes to
  `openfilm-2/` (then `openfilm-3/`, ...: the first folder that is free or still unchanged), and the
  command says which folder holds her edits. Tell her both exist and which is which.

Anything starting with a dot (`.film/`, which OpenFilm keeps for its own cache and history) is not
counted. A video she exports from Studio into the folder, or a file she adds, counts as an edit.
To keep working on the new export she opens it with `open_studio.sh <folder>`.
