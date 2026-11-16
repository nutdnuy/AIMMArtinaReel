"""Turn a sticker drawn on a flat magenta (#FF00FF) background into a transparent PNG.

  key_sprite.py <raw.png> <out.png>

If the generator already returned real transparency (more than 5% of pixels with alpha < 128)
that alpha is kept. Otherwise magenta is keyed out with a soft edge and the object's own colour
is recovered from the blended edge pixels. The result is trimmed to the object plus 8 px.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

KEY_FLOOR = 25        # magenta-ness below this is fully opaque
KEY_SPAN = 55         # ... and above FLOOR + SPAN fully transparent
REAL_ALPHA_SHARE = 0.05
MIN_OPAQUE = 0.02
MAX_OPAQUE = 0.90
TRIM_PAD = 8
PALETTE_DISTANCE = 60
PALETTE = np.array([
    (0xF5, 0x82, 0x0B),   # orange
    (0x14, 0x85, 0x6D),   # green
    (0x25, 0x2B, 0x31),   # charcoal
    (0xFF, 0xFA, 0xF0),   # cream
    (0xFF, 0xFF, 0xFF),   # white
], dtype=np.float64)


class KeyFailed(Exception):
    pass


def key(raw: Path, out: Path) -> dict:
    """Write the keyed, trimmed sticker to `out`; return {"size", "opaque", "on_palette"}."""
    px = np.asarray(Image.open(raw).convert("RGBA"), dtype=np.float64)
    rgb, alpha = px[..., :3], px[..., 3] / 255.0

    if (alpha < 128 / 255.0).mean() <= REAL_ALPHA_SHARE:
        magenta = np.minimum(rgb[..., 0], rgb[..., 2]) - rgb[..., 1]
        alpha = 1.0 - np.clip((magenta - KEY_FLOOR) / KEY_SPAN, 0.0, 1.0)
        soft = (alpha > 0) & (alpha < 1)
        a = alpha[soft][:, None]
        rgb = rgb.copy()
        rgb[soft] = np.clip((rgb[soft] - (1.0 - a) * np.array([255.0, 0.0, 255.0])) / a, 0, 255)
        rgb[alpha == 0] = 0

    opaque = float((alpha > 0.5).mean())
    if opaque < MIN_OPAQUE:
        raise KeyFailed(f"almost nothing left after removing the background ({opaque:.1%} opaque)")
    if opaque > MAX_OPAQUE:
        raise KeyFailed(f"the background was not removed ({opaque:.1%} opaque); "
                        "the image has no flat magenta background")

    ys, xs = np.nonzero(alpha > 0.05)
    h, w = alpha.shape
    box = (max(int(xs.min()) - TRIM_PAD, 0), max(int(ys.min()) - TRIM_PAD, 0),
           min(int(xs.max()) + 1 + TRIM_PAD, w), min(int(ys.max()) + 1 + TRIM_PAD, h))

    solid = rgb[alpha > 0.5]
    dist = np.linalg.norm(solid[:, None, :] - PALETTE[None, :, :], axis=2).min(axis=1)
    on_palette = float((dist <= PALETTE_DISTANCE).mean())

    result = np.dstack([np.rint(rgb), np.rint(alpha * 255.0)]).astype(np.uint8)
    img = Image.fromarray(result, "RGBA").crop(box)
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    img.save(out)
    return {"size": img.size, "opaque": opaque, "on_palette": on_palette}


def main(argv) -> int:
    if len(argv) != 3:
        print("usage: key_sprite.py <raw.png> <out.png>", file=sys.stderr)
        return 1
    try:
        info = key(Path(argv[1]), Path(argv[2]))
    except KeyFailed as e:
        print(str(e), file=sys.stderr)
        return 2
    print(f"keyed {info['size'][0]}x{info['size'][1]} opaque {info['opaque']:.2f} "
          f"on-palette {info['on_palette']:.2f} -> {argv[2]}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
