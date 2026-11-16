import hashlib
import io
import json
import os
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

FETCH = Path(__file__).resolve().parents[2] / "skills" / "paim-reel" / "scripts" / "fetch_photo.py"
PAGE = "https://commons.example/wiki/File:Thing.jpg"
CREDIT_KEYS = {"name", "image_url", "page_url", "license", "credit", "fetched_at", "sha256", "width", "height"}


# ---------- synthesised pictures

def picture(size=(1200, 900), seed=1):
    rng = np.random.default_rng(seed)
    base = np.linspace(0, 255, size[0], dtype=np.uint8)[None, :, None].repeat(size[1], 0).repeat(3, 2)
    noise = rng.integers(0, 40, base.shape, dtype=np.uint8)
    return Image.fromarray(np.minimum(base.astype(int) + noise, 255).astype(np.uint8), "RGB")


def encode(img, fmt, **kw):
    buf = io.BytesIO()
    img.save(buf, fmt, **kw)
    return buf.getvalue()


def jpeg_with_gps(size=(1200, 900), orientation=None):
    exif = Image.Exif()
    exif[0x010F] = "SecretCameraMaker"
    if orientation:
        exif[0x0112] = orientation
    exif.get_ifd(0x8825).update({1: "N", 2: (13.0, 45.0, 0.0), 3: "E", 4: (100.0, 30.0, 0.0)})
    return encode(picture(size), "JPEG", exif=exif.tobytes())


# ---------- a local site that serves what a test puts in `routes`

class Site:
    """path -> (status, content_type, body) or a function(handler) for anything stranger."""

    def __init__(self):
        self.routes = {}
        self.hits = []
        site = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                site.hits.append((self.path, dict(self.headers)))
                route = site.routes.get(self.path)
                if route is None:
                    self.send_error(404)
                elif callable(route):
                    route(self)
                else:
                    status, ctype, body = route
                    self.send_response(status)
                    self.send_header("Content-Type", ctype)
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    try:
                        self.wfile.write(body)
                    except OSError:   # the client refused the body and hung up
                        pass

            def log_message(self, *args):
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.server.daemon_threads = True
        self.base = f"http://127.0.0.1:{self.server.server_port}"
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def put(self, path, body, ctype="image/jpeg", status=200):
        self.routes[path] = (status, ctype, body)
        return self.base + path

    def close(self):
        self.server.shutdown()
        self.server.server_close()


@pytest.fixture
def site():
    s = Site()
    yield s
    s.close()


@pytest.fixture
def project(tmp_path):
    p = tmp_path / "proj"
    p.mkdir()
    return p


def run(project, *args, env=None, local=True):
    e = {k: v for k, v in os.environ.items() if k != "PAIM_ALLOW_HTTP_LOCAL"}
    e["NO_PROXY"] = "127.0.0.1"
    e["no_proxy"] = "127.0.0.1"
    if local:
        e["PAIM_ALLOW_HTTP_LOCAL"] = "1"
    e.update(env or {})
    return subprocess.run([sys.executable, str(FETCH), str(project), *args], env=e,
                          capture_output=True, text=True, timeout=120)


def fetch(project, name, url, *extra, **kw):
    return run(project, name, url, "--page", PAGE, *extra, **kw)


def credits(project):
    return json.loads((project / "gen" / "photos" / "credits.json").read_text(encoding="utf-8"))


def nothing_written(project):
    return not (project / "gen").exists()


# ---------- the happy path

def test_jpeg_is_fetched_recoded_and_recorded(project, site):
    url = site.put("/a.jpg", encode(picture((1200, 900)), "JPEG"))
    r = fetch(project, "bank", url)
    assert r.returncode == 0, r.stdout + r.stderr
    assert r.stdout.strip() == "OK bank 1200x900 license=unknown"
    out = project / "gen" / "photos" / "bank.jpg"
    img = Image.open(out)
    assert img.format == "JPEG" and max(img.size) <= 1600 and img.size == (1200, 900)
    [entry] = credits(project)
    assert set(entry) == CREDIT_KEYS
    assert entry["name"] == "bank" and entry["image_url"] == url and entry["page_url"] == PAGE
    assert entry["license"] == "unknown" and entry["credit"] == ""
    assert (entry["width"], entry["height"]) == (1200, 900)
    assert entry["sha256"] == hashlib.sha256(out.read_bytes()).hexdigest()
    assert entry["fetched_at"].endswith("+00:00") and entry["fetched_at"].startswith("20")


def test_the_request_carries_only_a_generic_user_agent(project, site):
    url = site.put("/a.jpg", encode(picture(), "JPEG"))
    assert fetch(project, "bank", url).returncode == 0
    [(_, headers)] = site.hits
    assert headers["User-Agent"] == "paim-reel/1.0"
    assert not {"Cookie", "Referer", "Authorization", "From"} & set(headers)


def test_license_and_credit_are_stored(project, site):
    url = site.put("/a.jpg", encode(picture(), "JPEG"))
    r = fetch(project, "bank", url, "--license", "CC0", "--credit", "Jane  Doe, via Commons")
    assert r.returncode == 0, r.stderr
    assert r.stdout.strip() == "OK bank 1200x900 license=CC0"
    [entry] = credits(project)
    assert entry["license"] == "CC0" and entry["credit"] == "Jane Doe, via Commons"


def test_the_same_name_twice_replaces_the_entry(project, site):
    first = site.put("/a.jpg", encode(picture((1200, 900), 1), "JPEG"))
    second = site.put("/b.jpg", encode(picture((900, 1200), 2), "JPEG"))
    assert fetch(project, "bank", first).returncode == 0
    assert fetch(project, "coin", first).returncode == 0
    assert fetch(project, "bank", second, "--license", "CC0").returncode == 0
    entries = credits(project)
    assert [e["name"] for e in entries] == ["bank", "coin"]
    bank = entries[0]
    assert bank["image_url"] == second and bank["license"] == "CC0" and (bank["width"], bank["height"]) == (900, 1200)
    assert Image.open(project / "gen" / "photos" / "bank.jpg").size == (900, 1200)


def test_a_large_picture_is_scaled_to_1600_on_its_long_side(project, site):
    url = site.put("/big.jpg", encode(picture((3200, 2400)), "JPEG"))
    r = fetch(project, "big", url)
    assert r.returncode == 0, r.stderr
    assert r.stdout.strip() == "OK big 1600x1200 license=unknown"
    assert Image.open(project / "gen" / "photos" / "big.jpg").size == (1600, 1200)


def test_png_and_webp_are_accepted_and_come_out_as_jpeg(project, site):
    png = site.put("/a.png", encode(picture((800, 700)), "PNG"), "image/png")
    webp = site.put("/a.webp", encode(picture((800, 700)), "WEBP"), "image/webp")
    assert fetch(project, "one", png).returncode == 0
    assert fetch(project, "two", webp).returncode == 0
    for name in ("one", "two"):
        assert Image.open(project / "gen" / "photos" / f"{name}.jpg").format == "JPEG"


def test_transparency_is_flattened_onto_cream(project, site):
    clear = Image.new("RGBA", (800, 800), (0, 0, 0, 0))
    url = site.put("/a.png", encode(clear, "PNG"), "image/png")
    assert fetch(project, "ghost", url).returncode == 0
    px = Image.open(project / "gen" / "photos" / "ghost.jpg").getpixel((400, 400))
    assert all(abs(a - b) <= 4 for a, b in zip(px, (255, 250, 240))), px


def test_exif_is_gone_and_the_orientation_is_applied(project, site):
    src = jpeg_with_gps((1200, 900), orientation=6)   # stored sideways: shows as 900 x 1200
    assert Image.open(io.BytesIO(src)).getexif().get_ifd(0x8825), "the source carries GPS"
    url = site.put("/a.jpg", src)
    r = fetch(project, "bank", url)
    assert r.returncode == 0, r.stderr
    out = project / "gen" / "photos" / "bank.jpg"
    img = Image.open(out)
    assert img.size == (900, 1200)
    assert len(img.getexif()) == 0 and not img.getexif().get_ifd(0x8825)
    assert "exif" not in img.info and "icc_profile" not in img.info
    data = out.read_bytes()
    assert b"Exif" not in data and b"SecretCameraMaker" not in data
    assert credits(project)[0]["width"] == 900


def test_a_redirect_to_a_local_picture_is_followed(project, site):
    site.put("/real.jpg", encode(picture(), "JPEG"))
    site.routes["/go.jpg"] = lambda h: (h.send_response(302), h.send_header("Location", "/real.jpg"),
                                        h.send_header("Content-Length", "0"), h.end_headers())
    assert fetch(project, "bank", site.base + "/go.jpg").returncode == 0


# ---------- refusals: exit 2, one sentence, nothing written

def refused(r, project, *words):
    assert r.returncode == 2, r.stdout + r.stderr
    assert r.stdout == ""
    message = r.stderr.strip()
    assert message and "\n" not in message and "Traceback" not in message, message
    for w in words:
        assert w in message, f"{w!r} not in {message!r}"
    assert nothing_written(project)


def test_html_page_is_refused(project, site):
    url = site.put("/page", b"<html><body>not a picture</body></html>", "text/html; charset=utf-8")
    refused(fetch(project, "bank", url), project, "text/html")


def test_html_in_a_jpg_file_is_refused(project, site):
    url = site.put("/fake.jpg", b"<html><body>I am a web page</body></html>", "image/jpeg")
    refused(fetch(project, "bank", url), project, "not a JPEG, PNG or WebP picture")


def test_svg_is_refused_whatever_it_is_called(project, site):
    svg = b'<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"><rect width="900" height="900"/></svg>'
    refused(fetch(project, "a", site.put("/a.svg", svg, "image/svg+xml")), project, "image/svg+xml")
    refused(fetch(project, "b", site.put("/b.jpg", svg, "image/jpeg")), project, "not a JPEG, PNG or WebP picture")


def test_a_truncated_picture_is_refused(project, site):
    url = site.put("/cut.jpg", encode(picture(), "JPEG")[:6000])
    refused(fetch(project, "bank", url), project, "not a JPEG, PNG or WebP picture")


def test_gif_is_refused_by_its_bytes_even_under_a_jpeg_header(project, site):
    url = site.put("/a.jpg", encode(picture((800, 800)).convert("P"), "GIF"), "image/jpeg")
    refused(fetch(project, "bank", url), project, "not a JPEG, PNG or WebP picture")


def test_small_picture_is_refused_naming_its_size(project, site):
    url = site.put("/small.png", encode(picture((500, 400)), "PNG"), "image/png")
    refused(fetch(project, "bank", url), project, "500x400", "600")


def test_a_picture_over_15_mb_is_refused_without_a_credits_file(project, site):
    big = b"\xff\xd8" + b"\0" * (15 * 1024 * 1024)
    url = site.put("/big.jpg", big)
    refused(fetch(project, "bank", url), project, "15 MB")


def test_a_body_with_no_length_is_cut_off_at_15_mb(project, site):
    def endless(h):
        h.send_response(200)
        h.send_header("Content-Type", "image/jpeg")
        h.send_header("Connection", "close")
        h.end_headers()
        try:
            for _ in range(40):
                h.wfile.write(b"\0" * (1024 * 1024))
        except OSError:
            pass
    site.routes["/endless.jpg"] = endless
    refused(fetch(project, "bank", site.base + "/endless.jpg"), project, "15 MB")


def test_a_slow_download_is_refused(project, site):
    def slow(h):
        h.send_response(200)
        h.send_header("Content-Type", "image/jpeg")
        h.send_header("Connection", "close")
        h.end_headers()
        for _ in range(30):
            h.wfile.write(b"\xff\xd8")
            h.wfile.flush()
            time.sleep(0.2)
    site.routes["/slow.jpg"] = slow
    started = time.monotonic()
    r = fetch(project, "bank", site.base + "/slow.jpg", env={"PAIM_FETCH_TIMEOUT": "1"})
    refused(r, project, "longer than 1 s")
    assert time.monotonic() - started < 5


def test_an_error_page_is_refused(project, site):
    refused(fetch(project, "bank", site.base + "/missing.jpg"), project, "404")


def test_plain_http_is_refused_before_any_request(project, site):
    # nothing listens on port 9: a request would give a connection error, not this sentence
    r = fetch(project, "bank", "http://example.com/x.jpg", local=False)
    refused(r, project, "https://")
    r = fetch(project, "bank", "http://127.0.0.1:9/x.jpg", local=False)
    refused(r, project, "https://")
    assert site.hits == []


def test_the_local_switch_allows_only_127_0_0_1(project):
    r = fetch(project, "bank", "http://example.com/x.jpg")
    refused(r, project, "https://")
    r = fetch(project, "bank", "http://localhost:9/x.jpg")
    refused(r, project, "https://")


def test_the_page_url_must_be_https_too(project, site):
    url = site.put("/a.jpg", encode(picture(), "JPEG"))
    r = run(project, "bank", url, "--page", "http://example.com/page")
    refused(r, project, "page", "https://")
    assert site.hits == []


def test_a_url_with_a_password_is_refused(project):
    refused(fetch(project, "bank", "https://user:secret@example.com/x.jpg"), project, "user name or password")


def test_a_redirect_to_http_is_refused_and_not_followed(project, site):
    site.routes["/go.jpg"] = lambda h: (h.send_response(302), h.send_header("Location", "http://example.com/x.jpg"),
                                        h.send_header("Content-Length", "0"), h.end_headers())
    refused(fetch(project, "bank", site.base + "/go.jpg"), project, "https://")


@pytest.mark.parametrize("name", ["Bank", "bank_1", "", "a/b", "../x", "banque ", "ธนาคาร"])
def test_a_bad_name_is_refused(project, site, name):
    url = site.put("/a.jpg", encode(picture(), "JPEG"))
    r = fetch(project, name, url)
    refused(r, project, "a-z")
    assert site.hits == []


def test_a_missing_project_folder_is_refused(tmp_path, site):
    url = site.put("/a.jpg", encode(picture(), "JPEG"))
    r = fetch(tmp_path / "nope", "bank", url)
    assert r.returncode == 2 and "not found" in r.stderr
    assert not (tmp_path / "nope").exists()


def test_a_failed_fetch_leaves_the_earlier_photo_and_entry_alone(project, site):
    good = site.put("/a.jpg", encode(picture(), "JPEG"))
    assert fetch(project, "bank", good).returncode == 0
    before = ((project / "gen" / "photos" / "bank.jpg").read_bytes(), credits(project))
    bad = site.put("/b.html", b"<html></html>", "text/html")
    assert fetch(project, "bank", bad).returncode == 2
    assert ((project / "gen" / "photos" / "bank.jpg").read_bytes(), credits(project)) == before
    left = sorted(p.name for p in (project / "gen" / "photos").iterdir() if p.name != ".credits.lock")
    assert left == ["bank.jpg", "credits.json"], "no temp file is left behind"


def test_a_damaged_credits_file_is_not_overwritten(project, site):
    folder = project / "gen" / "photos"
    folder.mkdir(parents=True)
    (folder / "credits.json").write_text("{not json", encoding="utf-8")
    url = site.put("/a.jpg", encode(picture(), "JPEG"))
    r = fetch(project, "bank", url)
    assert r.returncode == 2 and "credits.json" in r.stderr
    assert (folder / "credits.json").read_text(encoding="utf-8") == "{not json"
    assert not (folder / "bank.jpg").exists()


def test_a_very_long_licence_text_is_refused(project, site):
    url = site.put("/a.jpg", encode(picture(), "JPEG"))
    refused(fetch(project, "bank", url, "--license", "x" * 600), project, "--license")


# ---------- fix round 1: parallel fetches, an all-or-nothing write, public addresses only, a smaller pixel cap

def start(project, name, url, env=None):
    e = {k: v for k, v in os.environ.items()}
    e.update({"PAIM_ALLOW_HTTP_LOCAL": "1", "NO_PROXY": "127.0.0.1", "no_proxy": "127.0.0.1"})
    e.update(env or {})
    return subprocess.Popen([sys.executable, str(FETCH), str(project), name, url, "--page", PAGE], env=e,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)


def test_parallel_fetches_all_keep_their_entries(project, site):
    def slow(h):
        time.sleep(1)
        body = encode(picture((1000, 800)), "JPEG")
        h.send_response(200)
        h.send_header("Content-Type", "image/jpeg")
        h.send_header("Content-Length", str(len(body)))
        h.end_headers()
        h.wfile.write(body)
    site.routes["/slow.jpg"] = slow
    names = ["aa", "bb", "cc", "dd", "ee", "ff"]
    procs = {n: start(project, n, site.base + "/slow.jpg") for n in names}
    results = {n: p.communicate(timeout=60) + (p.returncode,) for n, p in procs.items()}
    for n, (out, err, code) in results.items():
        assert code == 0 and out.startswith(f"OK {n} "), (n, out, err)
    assert [e["name"] for e in credits(project)] == names
    assert sorted(p.name for p in (project / "gen" / "photos").glob("*.jpg")) == [f"{n}.jpg" for n in names]
    assert sorted(p.name for p in (project / "gen" / "photos").iterdir() if p.name != ".credits.lock") \
        == sorted([f"{n}.jpg" for n in names] + ["credits.json"]), "no temp file is left behind"


def failed_to_save(r):
    assert r.returncode == 1, r.stdout + r.stderr
    message = r.stderr.strip()
    assert message and "\n" not in message and "Traceback" not in message, message
    assert "could not save" in message


def test_a_write_failure_is_one_sentence_not_a_traceback(project, site):
    (project / "gen").write_text("a file where the folder should be", encoding="utf-8")
    url = site.put("/a.jpg", encode(picture(), "JPEG"))
    failed_to_save(fetch(project, "bank", url))


def test_if_the_picture_cannot_be_saved_the_old_source_stays_with_the_old_picture(project, site):
    first = site.put("/a.jpg", encode(picture((1200, 900), 1), "JPEG"))
    assert fetch(project, "coin", first, "--license", "CC0").returncode == 0
    folder = project / "gen" / "photos"
    before = (folder / "credits.json").read_bytes()
    (folder / "bank.jpg").mkdir()   # the picture cannot be written here
    failed_to_save(fetch(project, "bank", first))
    assert (folder / "credits.json").read_bytes() == before, "no entry for a picture that was not saved"
    assert [p.name for p in folder.iterdir() if p.name not in (".credits.lock", "bank.jpg", "credits.json", "coin.jpg")] == []


def test_if_the_entry_cannot_be_saved_the_old_picture_is_untouched(project, site):
    folder = project / "gen" / "photos"
    folder.mkdir(parents=True)
    (folder / "bank.jpg").write_bytes(b"the old picture")
    (folder / "credits.json").mkdir()   # the record cannot be written here
    url = site.put("/a.jpg", encode(picture(), "JPEG"))
    r = fetch(project, "bank", url)
    assert r.returncode in (1, 2) and "Traceback" not in r.stderr
    assert (folder / "bank.jpg").read_bytes() == b"the old picture"


@pytest.mark.parametrize("url", [
    "https://127.0.0.1:1/x.jpg", "https://localhost/x.jpg", "https://[::1]/x.jpg", "https://10.0.0.5/x.jpg",
    "https://192.168.1.20/x.jpg", "https://169.254.169.254/latest/", "https://0.0.0.0/x.jpg",
    "https://224.0.0.1/x.jpg", "https://[::ffff:127.0.0.1]/x.jpg", "https://[fe80::1]/x.jpg",
])
def test_an_https_url_to_a_local_or_private_address_is_refused(project, url):
    started = time.monotonic()
    refused(fetch(project, "bank", url), project, "private or local address")
    assert time.monotonic() - started < 10


def test_the_page_url_must_be_public_too(project, site):
    url = site.put("/a.jpg", encode(picture(), "JPEG"))
    r = run(project, "bank", url, "--page", "https://192.168.0.7/page")
    refused(r, project, "page URL", "private or local address")
    assert site.hits == []


def test_a_redirect_to_a_private_address_is_refused(project, site):
    site.routes["/go.jpg"] = lambda h: (h.send_response(302), h.send_header("Location", "https://10.1.2.3/x.jpg"),
                                        h.send_header("Content-Length", "0"), h.end_headers())
    started = time.monotonic()
    refused(fetch(project, "bank", site.base + "/go.jpg"), project, "redirect target", "private or local address")
    assert time.monotonic() - started < 10


def test_a_picture_with_too_many_pixels_is_refused_whatever_its_file_size(project, site):
    big = Image.new("L", (7000, 7000), 128)   # 49 M pixels, a few KB as a PNG
    data = encode(big, "PNG")
    assert len(data) < 200_000
    refused(fetch(project, "bank", site.put("/big.png", data, "image/png")), project, "7000x7000", "too large")


def test_a_large_jpeg_is_decoded_at_a_reduced_size_and_still_comes_out_right(project, site):
    url = site.put("/huge.jpg", encode(picture((4000, 3600)), "JPEG"))
    r = fetch(project, "bank", url)
    assert r.returncode == 0, r.stderr
    assert r.stdout.strip() == "OK bank 1600x1440 license=unknown"


def test_an_unresolvable_https_host_is_reported_as_unreachable_not_a_crash(project):
    r = fetch(project, "bank", "https://no-such-host.invalid/x.jpg")
    assert r.returncode == 1 and "could not download" in r.stderr and "Traceback" not in r.stderr
    assert nothing_written(project)
