"""Draw every sticker of a project with the user's image CLI and key it to transparency.

  gen_sprites.py <project> [--only a,b] [--parallel 2] [--agent claude|codex]

Reads <project>/sprites.tsv ("name<TAB>subject", "#" starts a comment) and writes
<project>/gen/sprites/<name>-raw.png, <name>.png and <name>.log. A row whose keyed PNG already
exists is skipped. Output lines: OK / SKIP / FAIL <name> (<log>) / OFF-PALETTE <name> <share> / QUOTA.
Exit 0 every row has a keyed PNG, 1 a row failed, 2 bad input or no image CLI, 3 provider quota used up.
PAIM_IMAGE_WAIT sets how many seconds to wait for each picture (default 300).
"""
import argparse
import os
import re
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import image_cli
from image_cli import ImageCliError, QuotaError
from key_sprite import KeyFailed, key

NAME_RE = re.compile(r"^[a-z0-9-]+$")
OFF_PALETTE_BELOW = 0.80


class BadRows(Exception):
    pass


def read_rows(tsv: Path) -> "list[tuple[str, str]]":
    if not tsv.is_file():
        raise BadRows(f"{tsv} not found: write one 'name<TAB>subject' line per sticker")
    rows, seen = [], set()
    for number, line in enumerate(tsv.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        name, _, subject = line.partition("\t")
        name, subject = name.strip(), subject.strip()
        if not NAME_RE.match(name):
            raise BadRows(f"{tsv} line {number}: name '{name}' must use only a-z, 0-9 and -")
        if not subject:
            raise BadRows(f"{tsv} line {number}: '{name}' has no subject after the tab")
        if name in seen:
            raise BadRows(f"{tsv} line {number}: name '{name}' appears twice")
        seen.add(name)
        rows.append((name, subject))
    return rows


def run(project: Path, only: "list[str] | None", parallel: int, agent: str) -> int:
    project = Path(project)
    try:
        rows = read_rows(project / "sprites.tsv")
        if only:
            unknown = [n for n in only if n not in {r[0] for r in rows}]
            if unknown:
                raise BadRows(f"--only names not in sprites.tsv: {', '.join(unknown)}")
            rows = [r for r in rows if r[0] in only]
        profile = image_cli.load_profile()
        provider = "custom" if image_cli.custom_command(profile) else image_cli.resolve_provider(profile, agent)
    except BadRows as e:
        print(e, file=sys.stderr)
        return 2
    except ImageCliError as e:
        print(" ".join(str(e).split()), file=sys.stderr)
        return 2

    folder = project / "gen" / "sprites"
    wait = int(os.environ.get("PAIM_IMAGE_WAIT", "300"))
    lock = threading.Lock()
    stop = threading.Event()
    failed, quota = [], []

    def say(text: str) -> None:
        with lock:
            print(text, flush=True)

    def work(name: str, subject: str) -> None:
        keyed, log = folder / f"{name}.png", folder / f"{name}.log"
        if keyed.is_file():
            say(f"SKIP {name}")
            return
        if stop.is_set():
            return
        try:
            raw = image_cli.generate(provider, folder, f"{name}-raw.png", subject, wait=wait, profile=profile)
            info = key(raw, keyed)
        except QuotaError as e:
            with lock:
                first = not quota
                quota.append(name)
            stop.set()
            if first:
                say(f"QUOTA {e}")
            return
        except Exception as e:   # ImageCliError, KeyFailed, or anything unexpected: one row never kills the batch
            with log.open("a", encoding="utf-8") as f:
                f.write(f"\n{type(e).__name__}: {' '.join(str(e).split())}\n")
            failed.append(name)
            say(f"FAIL {name} ({log})")
            return
        say(f"OK {name}")
        if info["on_palette"] < OFF_PALETTE_BELOW:
            say(f"OFF-PALETTE {name} {info['on_palette']:.2f}")

    folder.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=max(parallel, 1)) as pool:
        for future in [pool.submit(work, n, s) for n, s in rows]:
            future.result()
    if quota:
        return 3
    return 1 if failed else 0


def main(argv) -> int:
    ap = argparse.ArgumentParser(prog="gen_sprites.py")
    ap.add_argument("project", type=Path)
    ap.add_argument("--only", default="", help="comma separated sticker names")
    ap.add_argument("--parallel", type=int, default=2)
    ap.add_argument("--agent", choices=("claude", "codex"), default="claude")
    args = ap.parse_args(argv[1:])
    only = [n.strip() for n in args.only.split(",") if n.strip()] or None
    return run(args.project, only, args.parallel, args.agent)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
