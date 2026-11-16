"""Fetch one picture from the open web into a project, and record where it came from.

  fetch_photo.py <project> <name> <image_url> --page <page_url> [--license <text>] [--credit <text>]

The URL comes from the open web, so nothing is trusted: every check below runs before anything is written
to the project. Writes <project>/gen/photos/<name>.jpg (longest side at most 1600 px, re-encoded as JPEG
with no EXIF) and adds or replaces the entry {name, image_url, page_url, license, credit, fetched_at, sha256,
width, height} in <project>/gen/photos/credits.json (sha256 is the stored JPEG's; license is "unknown" when
--license is not given: pass it only with text the picture's own page states). Prints `OK <name> <W>x<H>
license=<...>`.

Refused (exit 2, nothing written, one sentence on stderr): a name outside a-z, 0-9 and -; an image or page
URL that is not https:// (PAIM_ALLOW_HTTP_LOCAL=1 also allows http://127.0.0.1, for tests); a redirect to
anything but https://; an https:// host that is a loopback, private, link-local or other non-public address
(checked for the image URL, the page URL and every redirect hop, and again when connecting); an HTTP error status; a response that is not image/jpeg, image/png or image/webp, or
whose bytes do not decode as one of those (an SVG never does); more than 15 MB; a short side under 600 px;
a download that takes longer than 30 s (PAIM_FETCH_TIMEOUT sets another number of seconds, for tests).
Exit 1: the server could not be reached.
"""
import argparse
import fcntl
import hashlib
import http.client
import io
import ipaddress
import json
import os
import re
import socket
import sys
import tempfile
import threading
import urllib.error
import urllib.parse
import urllib.request
import warnings
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageOps

from credits import CreditsError, credits_file, load_entries

NAME_RE = re.compile(r"[a-z0-9-]+")
USER_AGENT = "paim-reel/1.0"
ACCEPT = "image/jpeg, image/png, image/webp"
TYPES = ("image/jpeg", "image/png", "image/webp")
FORMATS = ("JPEG", "PNG", "WEBP")
MAX_BYTES = 15 * 1024 * 1024
MAX_PIXELS = 40_000_000
MIN_SHORT = 600
MAX_SIDE = 1600
QUALITY = 88
CHUNK = 64 * 1024
TEXT_MAX = 500
CREAM = (255, 250, 240)

warnings.simplefilter("error", Image.DecompressionBombWarning)


class Refused(Exception):
    """This picture or URL may not be used (exit 2)."""


class Unreachable(Exception):
    """The server could not be reached (exit 1)."""


def timeout() -> float:
    try:
        return float(os.environ.get("PAIM_FETCH_TIMEOUT", "30"))
    except ValueError:
        return 30.0


def non_public(address: str) -> bool:
    """True for an address that is not on the public internet (loopback, private, link-local, unspecified,
    multicast, reserved, shared, documentation)."""
    ip = ipaddress.ip_address(address.split("%")[0])
    if ip.version == 6 and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return not ip.is_global or ip.is_multicast or ip.is_reserved or ip.is_loopback or ip.is_link_local


def check_host(host: str, what: str) -> None:
    """Refuse a host that is, or resolves to, a non-public address. A name that does not resolve is left to
    the connection, which fails on its own."""
    try:
        addresses = [host]
        ipaddress.ip_address(host)
    except ValueError:
        try:
            addresses = [info[4][0] for info in socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)]
        except OSError:
            return
    if any(non_public(a) for a in addresses):
        raise Refused(f"the {what} points at {host}, a private or local address: only public web addresses are fetched")


def check_url(url: str, what: str) -> None:
    """Refuse anything but https:// (and, for tests only, http://127.0.0.1)."""
    try:
        parts = urllib.parse.urlsplit(url)
        host, _ = parts.hostname, parts.port
    except ValueError:
        raise Refused(f"the {what} is not a web address") from None
    local = os.environ.get("PAIM_ALLOW_HTTP_LOCAL") == "1" and parts.scheme == "http" and host == "127.0.0.1"
    if not (parts.scheme == "https" or local) or not host:
        raise Refused(f"the {what} must start with https:// ({url[:80]})")
    if parts.username or parts.password:
        raise Refused(f"the {what} must not contain a user name or password")
    if not local:
        check_host(host, what)


def public_connection(address, timeout, source_address=None):
    """socket.create_connection that connects only to a public address it has checked itself, so a name
    that resolves differently a moment later cannot lead to a local one."""
    host, port = address
    infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    for info in infos:
        check_host(info[4][0], "server")
    return socket.create_connection((infos[0][4][0], port), timeout, source_address)


class PublicHTTPSConnection(http.client.HTTPSConnection):
    """An https connection that opens its socket with public_connection. The assignment follows super().__init__,
    which sets the instance's own _create_connection and would shadow a class attribute. TLS is untouched: the
    certificate and host name are still checked against the name in the URL (self.host)."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._create_connection = public_connection


class PublicHTTPSHandler(urllib.request.HTTPSHandler):
    def https_open(self, req):
        return self.do_open(PublicHTTPSConnection, req, context=self._context)


class HttpsOnly(urllib.request.HTTPRedirectHandler):
    """Follows a redirect only to a URL that would itself be accepted."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        check_url(newurl, "redirect target")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def read_capped(resp) -> bytes:
    """At most MAX_BYTES + 1 bytes of the body: one more than allowed is how too much is noticed."""
    chunks, total = [], 0
    while total < MAX_BYTES + 1:
        chunk = resp.read(min(CHUNK, MAX_BYTES + 1 - total))
        if not chunk:
            break
        chunks.append(chunk)
        total += len(chunk)
    if total > MAX_BYTES:
        raise Refused("the file is larger than 15 MB")
    return b"".join(chunks)


def get(url: str) -> bytes:
    # Non-ASCII characters in the path are percent-encoded; characters a URL already uses are left as they are.
    ascii_url = urllib.parse.quote(url, safe="%/:?&=#+@!$'()*,;~[]")
    request = urllib.request.Request(ascii_url, headers={"User-Agent": USER_AGENT, "Accept": ACCEPT})
    try:
        with urllib.request.build_opener(HttpsOnly, PublicHTTPSHandler).open(request, timeout=timeout()) as resp:
            kind = resp.headers.get_content_type()
            if kind not in TYPES:
                raise Refused(f"the server sent {kind}, not an image/jpeg, image/png or image/webp picture")
            length = resp.headers.get("Content-Length", "")
            if length.isdigit() and int(length) > MAX_BYTES:
                raise Refused("the file is larger than 15 MB")
            return read_capped(resp)
    except urllib.error.HTTPError as e:
        raise Refused(f"the server answered {e.code} {e.reason}, not a picture") from None
    except (urllib.error.URLError, http.client.HTTPException, OSError) as e:
        raise Unreachable(f"could not download the picture ({getattr(e, 'reason', e)})") from None


def download(url: str) -> bytes:
    """get(), given the whole of timeout() seconds, not just per read: a server that drips bytes is cut off."""
    box = {}

    def work():
        try:
            box["data"] = get(url)
        except BaseException as e:   # handed to the main thread
            box["error"] = e

    worker = threading.Thread(target=work, daemon=True)
    worker.start()
    worker.join(timeout())
    if worker.is_alive():
        raise Refused(f"the download took longer than {timeout():g} s")
    if "error" in box:
        raise box["error"]
    return box["data"]


def prepare(data: bytes) -> bytes:
    """The picture as a clean JPEG: decoded by Pillow (the type comes from the bytes), upright, flattened onto
    cream where transparent, at most MAX_SIDE px, with no EXIF, profile or other container data."""
    try:
        img = Image.open(io.BytesIO(data), formats=FORMATS)
        if img.width * img.height > MAX_PIXELS:
            raise Refused(f"the picture is {img.width}x{img.height} px, far too large to use")
        if img.format == "JPEG":
            img.draft("RGB", (MAX_SIDE, MAX_SIDE))   # decode at a reduced scale, never below the output size
        img.load()
        img = ImageOps.exif_transpose(img)
    except Refused:
        raise
    except Exception:   # Pillow's decoders raise many kinds of error on bad bytes
        raise Refused("the file is not a JPEG, PNG or WebP picture that can be read") from None
    w, h = img.size
    if min(w, h) < MIN_SHORT:
        raise Refused(f"the picture is {w}x{h} px, but its short side must be at least {MIN_SHORT} px")
    if "A" in img.getbands() or (img.mode == "P" and "transparency" in img.info):
        rgba = img.convert("RGBA")
        flat = Image.new("RGB", rgba.size, CREAM)
        flat.paste(rgba, mask=rgba.getchannel("A"))
        img = flat
    img = img.convert("RGB")
    img.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)
    clean = Image.frombytes("RGB", img.size, img.tobytes())   # carries nothing but pixels
    out = io.BytesIO()
    clean.save(out, "JPEG", quality=QUALITY, optimize=True)
    return out.getvalue()


def one_line(text: str, flag: str) -> str:
    text = " ".join(text.split())
    if len(text) > TEXT_MAX:
        raise Refused(f"the {flag} text is longer than {TEXT_MAX} characters: give the short line the page states")
    return text


def aside(folder: Path, body: bytes) -> Path:
    """`body` in a new file of its own name in `folder`, to be moved into place."""
    with tempfile.NamedTemporaryFile(dir=folder, prefix=".", suffix=".tmp", delete=False) as f:
        f.write(body)
    return Path(f.name)


def save(project: Path, name: str, jpeg: bytes, entry: dict) -> None:
    """Records the photo and its entry together. Under an exclusive lock the entries are read again (another
    fetch may have finished while this one downloaded), the record is moved into place first and the picture
    second; if the picture cannot be moved the old record is put back, so a picture never has another
    picture's source."""
    folder = credits_file(project).parent
    folder.mkdir(parents=True, exist_ok=True)
    record, picture = folder / "credits.json", folder / f"{name}.jpg"
    with open(folder / ".credits.lock", "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        entries = sorted([e for e in load_entries(project) if e["name"] != name] + [entry], key=lambda e: e["name"])
        old = record.read_bytes() if record.is_file() else None
        temps = [aside(folder, (json.dumps(entries, indent=2, ensure_ascii=False) + "\n").encode("utf-8")),
                 aside(folder, jpeg)]
        try:
            os.replace(temps[0], record)
            try:
                os.replace(temps[1], picture)
            except OSError:
                if old is None:
                    record.unlink(missing_ok=True)
                else:
                    restore = aside(folder, old)
                    os.replace(restore, record)
                raise
        finally:
            for tmp in temps:
                tmp.unlink(missing_ok=True)


def run(project: Path, name: str, image_url: str, page_url: str, license_text: str, credit: str) -> int:
    try:
        if not NAME_RE.fullmatch(name):
            raise Refused(f"the photo name '{name}' must use only a-z, 0-9 and -")
        check_url(image_url, "image URL")
        check_url(page_url, "page URL")
        license_text = one_line(license_text, "--license") or "unknown"
        credit = one_line(credit, "--credit")
        if not project.is_dir():
            raise Refused(f"the project folder {project} was not found")
        load_entries(project)   # a damaged record is refused before anything is downloaded
        jpeg = prepare(download(image_url))
    except (Refused, CreditsError) as e:
        print(" ".join(str(e).split()), file=sys.stderr)
        return 2
    except Unreachable as e:
        print(" ".join(str(e).split()), file=sys.stderr)
        return 1
    width, height = Image.open(io.BytesIO(jpeg)).size
    entry = {
        "name": name, "image_url": image_url, "page_url": page_url, "license": license_text, "credit": credit,
        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sha256": hashlib.sha256(jpeg).hexdigest(), "width": width, "height": height,
    }
    try:
        save(project, name, jpeg, entry)
    except CreditsError as e:
        print(" ".join(str(e).split()), file=sys.stderr)
        return 2
    except OSError as e:
        print(f"could not save the photo ({e.strerror or e})", file=sys.stderr)
        return 1
    print(f"OK {name} {width}x{height} license={license_text}")
    return 0


def main(argv) -> int:
    ap = argparse.ArgumentParser(prog="fetch_photo.py")
    ap.add_argument("project", type=Path)
    ap.add_argument("name")
    ap.add_argument("image_url")
    ap.add_argument("--page", required=True, help="the web page the picture was found on")
    ap.add_argument("--license", default="", help="the licence text the page states (default: unknown)")
    ap.add_argument("--credit", default="", help="the credit line the page asks for")
    args = ap.parse_args(argv[1:])
    return run(args.project, args.name, args.image_url, args.page, args.license, args.credit)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
