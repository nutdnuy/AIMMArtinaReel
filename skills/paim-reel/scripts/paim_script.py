"""Parse script.md into spoken lines and measure caption tokens."""
import re

LINE_RE = re.compile(r"^(l\d{2,}):\s*(.*)$")


class ScriptError(ValueError):
    pass


def _is_combining(ch: str) -> bool:
    cp = ord(ch)
    return cp == 0x0E31 or 0x0E34 <= cp <= 0x0E3A or 0x0E47 <= cp <= 0x0E4E


def base_len(s: str) -> int:
    """Characters excluding whitespace and Thai combining marks."""
    return sum(1 for ch in s if not ch.isspace() and not _is_combining(ch))


def parse_script(text: str) -> list[dict]:
    """Return [{id, text, tokens}] for every `lNN: ...` line; ignore the rest."""
    lines: list[dict] = []
    seen: set[str] = set()
    for raw in text.splitlines():
        m = LINE_RE.match(raw.strip())
        if not m:
            continue
        line_id = m.group(1)
        tokens = m.group(2).split()
        if not tokens:
            raise ScriptError(f"{line_id}: empty line")
        if line_id in seen:
            raise ScriptError(f"duplicate line id {line_id}")
        seen.add(line_id)
        lines.append({"id": line_id, "text": " ".join(tokens), "tokens": tokens})
    if not lines:
        raise ScriptError("no spoken lines found (expected lines like 'l01: ...')")
    return lines


def long_tokens(lines: list[dict], limit: int = 14) -> list[tuple[str, str]]:
    """(line id, token) for every token longer than `limit` base characters."""
    return [(l["id"], t) for l in lines for t in l["tokens"] if base_len(t) > limit]
