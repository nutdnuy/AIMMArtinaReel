"""Draw one sticker through the user's image CLI (Codex or Gemini).

  image_cli.py test [--agent claude|codex]

`test` draws "a shopping basket holding three coins" to <config dir>/test/sample.png, keys it and
prints the keyed path. Exit 2 with one plain sentence when the CLI cannot draw.

Environment: PAIM_IMAGE_CMD (or profile "image_cmd") replaces the provider command with
"<that command> -p <ask>"; PAIM_IMAGE_BACKOFF is the 429 back-off unit in seconds (default 45).
"""
import argparse
import json
import os
import re
import shlex
import subprocess
import sys
import time
from pathlib import Path

STYLE = ("Style: flat vector sticker illustration, bold simple rounded shapes, thick even outline in charcoal #252B31, "
         "flat fills using only orange #F5820B, green #14856D, charcoal #252B31, cream #FFFAF0 and white. "
         "No gradients, no shading, no texture, no drop shadow. ONE single isolated object, centred, the whole object "
         "visible with generous space around it. The background is a perfectly flat, uniform pure magenta (#FF00FF) "
         "with no texture, no shadow and no gradient. Never use magenta or pink inside the object. "
         "No text, no letters, no numbers, no logos, no brand marks, no real people.")
ASK = ("Use your image generation tool to create ONE square image, {size}. Then save the resulting PNG into the "
       "current directory as {filename}. Do nothing else.\n\nImage prompt: {subject}. {style}")

INSTALL = {
    "codex": "npm install -g @openai/codex",
    "gemini": "npm install -g @google/gemini-cli",
}
QUOTA_MARKERS = ("resource_exhausted", "quota_exhausted", "usage limit")
POLL_SECONDS = 2
ATTEMPTS = 3
TEST_SUBJECT = "a shopping basket holding three coins"


class ImageCliError(Exception):
    pass


class QuotaError(ImageCliError):
    pass


def config_dir() -> Path:
    return Path(os.environ.get("PAIM_CONFIG_DIR") or Path.home() / ".config" / "paim-reel")


def load_profile() -> "dict | None":
    """The user's profile.json (written by profile.mjs), or None when onboarding has not run."""
    path = config_dir() / "profile.json"
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return None
    try:
        data = json.loads(text)
    except ValueError as e:
        raise ImageCliError(f"{path} is not valid JSON ({e})") from e
    if not isinstance(data, dict):
        raise ImageCliError(f"{path} must hold a JSON object")
    return data


def custom_command(profile: "dict | None" = None) -> "str | None":
    """PAIM_IMAGE_CMD (wins) or the profile's image_cmd; None when neither is set."""
    return os.environ.get("PAIM_IMAGE_CMD") or (profile or {}).get("image_cmd") or None


def resolve_provider(profile: "dict | None", agent: str) -> str:
    """Under Codex the provider is codex; under Claude Code the user chose one in onboarding."""
    if agent == "codex":
        return "codex"
    choice = (profile or {}).get("image_cli")
    if choice in INSTALL:
        return choice
    raise ImageCliError("No image CLI is chosen yet: run the onboarding and pick Codex or Gemini "
                        "(or run: node scripts/profile.mjs set image_cli codex).")


def build_command(provider: str, ask: str, folder: Path, profile: "dict | None" = None) -> "list[str]":
    custom = custom_command(profile)
    if custom:
        return shlex.split(custom) + ["-p", ask]
    if provider == "codex":
        return ["codex", "exec", "--skip-git-repo-check", "-s", "workspace-write", "-C", str(folder), ask]
    if provider == "gemini":
        return ["gemini", "-p", ask, "--yolo"]
    raise ImageCliError(f"unknown image provider: {provider}")


def _log_text(log: Path) -> str:
    try:
        return log.read_text(encoding="utf-8", errors="replace")
    except FileNotFoundError:
        return ""


def _quota_hit(text: str) -> bool:
    lower = text.lower()
    return any(marker in lower for marker in QUOTA_MARKERS)


def _quota_error(log: Path) -> QuotaError:
    return QuotaError(f"The image provider says its quota is used up (see {log}). Try again later.")


def _ready(target: Path) -> bool:
    return target.is_file() and target.stat().st_size > 0


def _wait_for(target: Path, log: Path, wait: float) -> bool:
    """Poll for the file; Gemini hands drawing to a sub-agent so it can appear after the command returns."""
    deadline = time.monotonic() + wait
    while True:
        if _ready(target):
            size = target.stat().st_size
            time.sleep(0.3)   # let a writer that is still flushing finish
            if target.stat().st_size == size:
                return True
        if _quota_hit(_log_text(log)):
            raise _quota_error(log)
        if time.monotonic() >= deadline:
            return False
        time.sleep(min(POLL_SECONDS, max(deadline - time.monotonic(), 0.05)))


def generate(provider: str, folder: Path, filename: str, subject: str, size: str = "1024x1024",
             wait: int = 300, profile: "dict | None" = None) -> Path:
    """Ask the image CLI to draw `subject` into <folder>/<filename>; return that path."""
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / filename
    log = folder / f"{re.sub(r'-raw$', '', Path(filename).stem)}.log"   # basket-raw.png -> basket.log
    ask = ASK.format(size=size, filename=filename, subject=subject.strip(), style=STYLE)
    cmd = build_command(provider, ask, folder, profile)
    backoff = float(os.environ.get("PAIM_IMAGE_BACKOFF", "45"))

    limited = timed_out = False
    code = 0
    for attempt in range(1, ATTEMPTS + 1):
        target.unlink(missing_ok=True)   # a leftover from an earlier run must not pass for this drawing
        try:
            with log.open("wb") as out:
                code = subprocess.run(cmd, cwd=folder, stdin=subprocess.DEVNULL, stdout=out, stderr=out,
                                      timeout=wait).returncode
        except FileNotFoundError:
            hint = INSTALL.get(provider)
            raise ImageCliError(
                f"The image command '{cmd[0]}' is not installed"
                + (f": install it with `{hint}` and sign in." if hint and not custom_command(profile)
                   else ".")) from None
        except subprocess.TimeoutExpired:
            timed_out = True   # the file may still exist; otherwise the "no picture" error names the log
        text = _log_text(log)
        if not _ready(target) and _quota_hit(text):
            raise _quota_error(log)
        limited = not _ready(target) and re.search(r"\b429\b", text) is not None
        if not limited:
            break
        if attempt < ATTEMPTS:
            time.sleep(attempt * backoff)

    if limited:
        raise ImageCliError(f"The image provider kept answering 429 (too many requests) after {ATTEMPTS} tries; "
                            f"see {log}. Try again later.")
    if code != 0 and not timed_out and not _ready(target):
        raise ImageCliError(f"The image CLI stopped with exit code {code} and drew nothing; see {log}")
    if _wait_for(target, log, 0 if timed_out else wait):
        return target
    raise ImageCliError(f"The image CLI finished but no picture appeared; see {log}")


GEMINI_CANNOT_DRAW = (
    ("ineligibletiererror", "Gemini CLI on this machine cannot draw yet: Google no longer accepts this client "
     "for sign-in (it asks users to move to Antigravity). Install Google's Antigravity CLI (agy) and run "
     "`node scripts/profile.mjs set image_cmd \"agy --dangerously-skip-permissions\"`, or choose Codex instead."),
    ("not running in a trusted directory", "Gemini CLI on this machine cannot draw yet: it refuses to run in a "
     "folder it does not trust. Set GEMINI_CLI_TRUST_WORKSPACE=true in the environment and try again, "
     "or choose Codex instead."),
)


def explain_failure(log: Path) -> "str | None":
    """A plain sentence for the Gemini CLI failures seen in the log, or None."""
    text = _log_text(log).lower()
    for marker, sentence in GEMINI_CANNOT_DRAW:
        if marker in text:
            return sentence
    return None


def _test(agent: str) -> int:
    from key_sprite import KeyFailed, key
    try:
        profile = load_profile()
        provider = "custom" if custom_command(profile) else resolve_provider(profile, agent)
        folder = config_dir() / "test"
        raw = generate(provider, folder, "sample-raw.png", TEST_SUBJECT, profile=profile)
        out = folder / "sample.png"
        key(raw, out)
    except (ImageCliError, KeyFailed) as e:
        reason = explain_failure(config_dir() / "test" / "sample.log") if isinstance(e, ImageCliError) else None
        print(reason or " ".join(str(e).split()), file=sys.stderr)
        return 2
    print(out)
    return 0


def main(argv) -> int:
    ap = argparse.ArgumentParser(prog="image_cli.py")
    sub = ap.add_subparsers(dest="command", required=True)
    t = sub.add_parser("test", help="draw one sample sticker with the chosen image CLI")
    t.add_argument("--agent", choices=("claude", "codex"), default="claude")
    args = ap.parse_args(argv[1:])
    return _test(args.agent)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
