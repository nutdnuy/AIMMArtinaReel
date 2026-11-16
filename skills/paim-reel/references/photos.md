# Photos from the web

A `photo` item shows a real picture from the web as a torn-edged paper card. It is optional and
sits beside drawn sprites: the agent chooses per scene.

P.AIM chose general web image search for this, after being told that most web images are
copyrighted. Search words and fetches go out to the web; nothing from the project is uploaded.

## When to use a photo

- A photo is for a real, nameable thing the line mentions: a building, a banknote, a place, an
  object. "ตึกธนาคาร", "ธนบัตร 100 บาท", "ตลาดหลักทรัพย์".
- A sprite or an icon is for an idea (risk, growth, saving). Never search for a photo of an idea.
- A few photos in a reel is plenty. Prefer one large photo (`center`, `versus`, a row of 2) to a
  crowd of small ones.

## Finding and fetching one

1. Search the web with your own search tool for the thing, in words that name it plainly.
   Prefer pages that state a licence (Wikimedia Commons, a government or museum archive, a
   CC0 or public-domain collection).
2. Open the result's page. Find the direct image URL (the picture file itself, not the page) and
   read the licence and credit text the page states.
3. Run, with a lower-case name of letters, digits and `-` (the story uses it as `photo`):

   ```
   <skill>/.venv/bin/python <skill>/scripts/fetch_photo.py <project> <name> <image_url> --page <page_url> \
       [--license "<text>"] [--credit "<text>"]
   ```

   - `--license` only with text the page itself states (`CC0 1.0`, `Public domain`, `CC BY 4.0`).
     If the page states none, leave it out: the photo is then recorded as `unknown`. Never guess
     or write a licence the page does not state.
   - `--credit` is the author or credit line the page asks for.
   - `OK <name> <W>x<H> license=<…>`: done. Exit 2 prints one sentence (not https, not a JPEG,
     PNG or WebP picture, over 15 MB, short side under 600 px, took over 30 s, the server said 404):
     choose another picture. Exit 1: the server could not be reached; try once more or choose another.
   - `the server answered 429 Too Many Requests, not a picture` (or `403`, another refusal): the
     site is throttling or refusing automated downloads. Wait at least 20 s and retry once; if it
     refuses again, take the picture from another source whose page states its licence (a
     government or museum archive). Never retry in a loop.
4. **Read every fetched photo** (`<project>/gen/photos/<name>.jpg`) before using it: is it the
   thing the line names, sharp, free of text, a watermark, a logo or a face you should not show?
   Delete a bad one (`rm` the `.jpg`; the entry in `credits.json` then names nothing) and fetch
   another.
5. Use it in the story as `{"type": "photo", "photo": "<name>", "label": "…", "at": "…"}`
   (`references/story-json.md`).

`fetch_photo.py` runs on macOS or Linux (it locks the credits file with `fcntl`). Its requests say
`User-Agent: paim-reel/1.0 (open-source video skill; photo fetch)`, which names the tool and nothing
about her or this machine; `PAIM_USER_AGENT` replaces it.

The script saves the picture as a JPEG at most 1600 px on the long side, with EXIF removed, and
records `{name, image_url, page_url, license, credit, fetched_at, sha256, width, height}` in
`<project>/gen/photos/credits.json`. Only the script writes these two things; never edit either by
hand to make a check pass.

## Do not use

- Stock-site previews with a watermark.
- Frames or screenshots taken from other creators' videos.
- Pictures of private people (a recognisable person who is not a public figure acting in public).
- A company logo, unless the script (the line) names that company.
- Anything you could not open the page of, or whose page you could not read.

## The photo is copied nowhere else

A fetched photo lives only in `<project>/gen/photos/`. Never copy one into the skill folder, the
examples or the repository.

## Risks, plainly

- Most pictures on the web are copyrighted. A page that states a licence (CC0, public domain, a
  Creative Commons licence) tells you the terms; a page that states nothing does not make the
  picture free to use.
- A licence that needs attribution (CC BY, CC BY-SA) is met by the credits file below; say which
  photos need it.
- The fetch is limited by the script (https only, pictures only, decoded and re-encoded, never
  executed, SVG refused), but the content is still whatever the page holds: look at it.

## The check and the credits file

- `check.mjs` prints `credits: PASS`, or `credits: FAIL (n)` naming each photo the story uses that
  has no entry in `credits.json`. Build, still and render also refuse such a story. Fix it by
  fetching the photo again with `fetch_photo.py`, never by editing `credits.json` by hand.
- Before delivering, run `<skill>/.venv/bin/python <skill>/scripts/credits.py <project>`. It writes
  `<project>/renders/<slug>-credits.md` (every photo the story uses: name, page URL, licence,
  credit; licence `unknown` first, under its own heading) and prints
  `credits: N photos, M with unknown licence`.

## In the delivery note: required when a photo is used

**Attach the credits file. List every photo whose licence is `unknown`, each with its page URL,
and say plainly that those pictures may be copyrighted and are used at P.AIM's own decision.**
Example, in the language she is using:

> Photos with no licence stated (may be copyrighted; used at your decision):
> - `old-bank`: https://example.org/page-it-came-from

If no photo is `unknown`, say that every photo's page states its licence, and attach the file all
the same. A reel with no photos needs none of this.
