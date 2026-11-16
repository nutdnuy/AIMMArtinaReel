"""List the web photos a story uses, with where each came from.

  credits.py <project>

Reads <project>/story.json and <project>/gen/photos/credits.json (written by fetch_photo.py) and writes
<project>/renders/<slug>-credits.md: every photo the story uses with its page URL, licence and credit,
the ones whose licence is "unknown" first under their own heading. Prints
`credits: N photos, M with unknown licence`.
Exit 0 done, 2 bad input: no story, or a photo the story uses has no entry in credits.json.
"""
import json
import re
import sys
from pathlib import Path

NAME_RE = re.compile(r"^[a-z0-9-]+$")
UNKNOWN = "unknown"


class CreditsError(Exception):
    pass


def credits_file(project: Path) -> Path:
    return Path(project) / "gen" / "photos" / "credits.json"


def load_entries(project: Path) -> "list[dict]":
    """The entries of gen/photos/credits.json, or [] when the file does not exist yet."""
    path = credits_file(project)
    if not path.is_file():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        raise CreditsError(f"{path} is damaged ({e}): fix or delete it, then fetch the photos again") from e
    if not isinstance(data, list) or not all(isinstance(e, dict) and isinstance(e.get("name"), str) for e in data):
        raise CreditsError(f"{path} must be a list of photo entries, each with a name: fix or delete it")
    return data


def story_photos(project: Path) -> "tuple[str, str, list[str]]":
    """(slug, title, the photo names the story uses, in order of first use)."""
    path = Path(project) / "story.json"
    try:
        story = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise CreditsError(f"{path} not found") from None
    except (OSError, ValueError) as e:
        raise CreditsError(f"{path} is not valid JSON ({e})") from e
    if not isinstance(story, dict) or not isinstance(story.get("slug"), str) or not NAME_RE.match(story["slug"]):
        raise CreditsError(f"{path} needs a slug of a-z, 0-9 and -")
    names = []
    for scene in story.get("scenes") or []:
        for item in (scene.get("items") or []) if isinstance(scene, dict) else []:
            if isinstance(item, dict) and item.get("type") == "photo" and isinstance(item.get("photo"), str):
                if item["photo"] not in names:
                    names.append(item["photo"])
    title = story["title"] if isinstance(story.get("title"), str) else story["slug"]
    return story["slug"], title, names


def one_line(text) -> str:
    return " ".join(str(text or "").split())


def is_unknown(entry: dict) -> bool:
    return one_line(entry.get("license")).lower() in ("", UNKNOWN)


def line(entry: dict) -> str:
    credit = one_line(entry.get("credit")) or "(none given)"
    return (f"- **{entry['name']}**: page {one_line(entry.get('page_url')) or '(none)'}; "
            f"licence {one_line(entry.get('license')) or UNKNOWN}; credit {credit}")


def render(title: str, entries: "list[dict]") -> str:
    unknown = [e for e in entries if is_unknown(e)]
    stated = [e for e in entries if not is_unknown(e)]
    out = [f"# Photo credits: {one_line(title)}", ""]
    if not entries:
        out += ["This reel uses no web photos.", ""]
    if unknown:
        out += [f"## Licence unknown ({len(unknown)})", "",
                "These pictures came from the open web and their pages state no licence. They may be copyrighted "
                "and are used at P.AIM's own decision.", ""]
        out += [line(e) for e in unknown] + [""]
    if stated:
        out += [f"## Licence stated by the page ({len(stated)})", ""]
        out += [line(e) for e in stated] + [""]
    return "\n".join(out)


def run(project: Path) -> int:
    project = Path(project)
    try:
        slug, title, names = story_photos(project)
        by_name = {e["name"]: e for e in load_entries(project)}
        missing = [n for n in names if n not in by_name]
        if missing:
            raise CreditsError(
                f"the story uses {', '.join(missing)} with no entry in {credits_file(project)}: "
                f"fetch each one with scripts/fetch_photo.py so its source is recorded")
    except CreditsError as e:
        print(e, file=sys.stderr)
        return 2
    entries = [by_name[n] for n in names]
    out = project / "renders" / f"{slug}-credits.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(render(title, entries), encoding="utf-8")
    print(f"credits: {len(entries)} photos, {sum(map(is_unknown, entries))} with unknown licence")
    return 0


def main(argv) -> int:
    if len(argv) != 2:
        print("usage: credits.py <project>", file=sys.stderr)
        return 2
    return run(Path(argv[1]))


if __name__ == "__main__":
    sys.exit(main(sys.argv))
