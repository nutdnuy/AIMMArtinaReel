import pytest
from PIL import Image, ImageDraw

from key_sprite import KeyFailed, key

MAGENTA = (255, 0, 255)
ORANGE = (0xF5, 0x82, 0x0B)
GREEN = (0x14, 0x85, 0x6D)


def make_raw(path, bg=MAGENTA, disc=ORANGE, square=GREEN, mode="RGB"):
    """512x512 background, a disc (r 120, centre 200,256) and a 100 px square (centre 380,256)."""
    im = Image.new(mode, (512, 512), bg)
    d = ImageDraw.Draw(im)
    d.ellipse((80, 136, 320, 376), fill=disc)
    d.rectangle((330, 206, 429, 305), fill=square)
    im.save(path)
    return path


def test_key_magenta(tmp_path):
    raw = make_raw(tmp_path / "raw.png")
    out = tmp_path / "out.png"
    info = key(raw, out)
    im = Image.open(out)
    assert im.mode == "RGBA" and 340 <= im.width <= 380 and 240 <= im.height <= 270   # bbox 350 x 240, plus 8 px each side
    assert info["size"] == im.size
    assert im.getpixel((0, 0))[3] == 0
    r, g, b, a = im.getpixel((308, 128))   # centre of the green square: (380 - 72, 256 - 128) after the trim
    assert a == 255 and abs(r - 0x14) < 12 and abs(g - 0x85) < 12 and abs(b - 0x6D) < 12
    assert info["on_palette"] >= 0.95 and 0.02 < info["opaque"] < 0.90


def test_key_soft_edge_loses_the_magenta_tint(tmp_path):
    """A half-magenta edge pixel becomes partly transparent and no longer reads as magenta."""
    raw = make_raw(tmp_path / "raw.png")
    im = Image.open(raw)
    im.putpixel((380, 206), tuple((g + m) // 2 for g, m in zip(GREEN, MAGENTA)))
    im.save(raw)
    out = tmp_path / "out.png"
    key(raw, out)
    r, g, b, a = Image.open(out).getpixel((380 - 72, 206 - 128))
    assert 0 < a < 255
    assert min(r, b) - g < 25


def test_key_keeps_real_alpha(tmp_path):
    raw = tmp_path / "raw.png"
    im = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    ImageDraw.Draw(im).ellipse((80, 136, 320, 376), fill=ORANGE + (255,))
    ImageDraw.Draw(im).rectangle((330, 206, 429, 305), fill=GREEN + (255,))
    im.putpixel((200, 256), ORANGE + (200,))   # partial alpha must survive untouched
    im.save(raw)
    out = tmp_path / "out.png"
    info = key(raw, out)
    res = Image.open(out)
    assert res.mode == "RGBA" and 340 <= res.width <= 380 and 240 <= res.height <= 270
    assert res.getpixel((0, 0))[3] == 0
    assert res.getpixel((200 - 72, 256 - 128)) == ORANGE + (200,)
    assert res.getpixel((308, 128)) == GREEN + (255,)
    assert info["on_palette"] >= 0.95


def test_key_all_background(tmp_path):
    raw = tmp_path / "raw.png"
    Image.new("RGB", (256, 256), MAGENTA).save(raw)
    with pytest.raises(KeyFailed):
        key(raw, tmp_path / "out.png")
    assert not (tmp_path / "out.png").exists()


def test_key_no_background(tmp_path):
    raw = tmp_path / "raw.png"
    Image.new("RGB", (256, 256), ORANGE).save(raw)
    with pytest.raises(KeyFailed):
        key(raw, tmp_path / "out.png")


def test_off_palette(tmp_path):
    raw = make_raw(tmp_path / "raw.png", disc=(0x20, 0x40, 0xFF), square=(0x20, 0x40, 0xFF))
    info = key(raw, tmp_path / "out.png")
    assert info["on_palette"] < 0.2


@pytest.mark.parametrize("content", [b"<html>429 error page</html>", b"\x89PNG\r\n\x1a\ntruncated", b""])
def test_key_unreadable_file(tmp_path, content):
    raw = tmp_path / "raw.png"
    raw.write_bytes(content)
    with pytest.raises(KeyFailed, match="not a readable image"):
        key(raw, tmp_path / "out.png")
