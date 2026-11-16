"""Stand-in for an image CLI. Used through PAIM_IMAGE_CMD="<python> fake_image_cli.py".

  fake_image_cli.py -p PROMPT

Finds the file name after "current directory as ", appends one line to $FAKE_CALLS and acts on
$FAKE_MODE: ok | late | quota | nothing | 429-once | reads-stdin.
"""
import os
import re
import subprocess
import sys
import time
from pathlib import Path

from PIL import Image, ImageDraw


def draw(path: Path) -> None:
    im = Image.new("RGB", (512, 512), (255, 0, 255))
    d = ImageDraw.Draw(im)
    d.ellipse((80, 136, 320, 376), fill=(0xF5, 0x82, 0x0B))
    d.rectangle((330, 206, 429, 305), fill=(0x14, 0x85, 0x6D))
    im.save(path)


def main(argv) -> int:
    if argv[1:2] == ["--draw-later"]:
        time.sleep(float(argv[3]))
        draw(Path(argv[2]))
        return 0

    prompt = argv[argv.index("-p") + 1]
    filename = re.search(r"current directory as (\S+?)\. Do nothing else", prompt).group(1)
    calls = Path(os.environ["FAKE_CALLS"])
    previous = len(calls.read_text().splitlines()) if calls.exists() else 0
    with calls.open("a") as f:
        f.write(f"{filename}\n")

    mode = os.environ.get("FAKE_MODE", "ok")
    if mode == "reads-stdin":
        sys.stdin.read()
    if mode == "quota":
        print("Error: RESOURCE_EXHAUSTED: you have exhausted your capacity")
        return 1
    if mode == "nothing":
        print("done")
        return 0
    if mode == "429-once" and previous == 0:
        print("429 Too Many Requests")
        return 1
    if mode == "late":
        subprocess.Popen([sys.executable, __file__, "--draw-later", filename, "3"],
                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                         stderr=subprocess.DEVNULL, start_new_session=True)
        return 0
    draw(Path(filename))
    print("saved", filename)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
