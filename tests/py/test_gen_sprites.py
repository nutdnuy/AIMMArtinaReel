import os
import subprocess
import sys
from pathlib import Path

import pytest
from PIL import Image

FAKE = Path(__file__).resolve().parents[1] / "fixtures" / "fake_image_cli.py"
GEN = Path(__file__).resolve().parents[2] / "skills" / "paim-reel" / "scripts" / "gen_sprites.py"
ROWS = "# name<TAB>subject\nbasket\ta shopping basket\n\ncoin\ta gold coin\npiggy\ta piggy bank\n"


@pytest.fixture
def project(tmp_path):
    p = tmp_path / "proj"
    p.mkdir()
    (p / "sprites.tsv").write_text(ROWS, encoding="utf-8")
    return p


def run(project, tmp_path, *args, mode=None, extra=None, fake=True):
    env = {k: v for k, v in os.environ.items() if k not in ("PAIM_IMAGE_CMD", "FAKE_MODE")}
    env.update({"PAIM_CONFIG_DIR": str(tmp_path / "config"), "PAIM_IMAGE_BACKOFF": "0",
                "FAKE_CALLS": str(tmp_path / "calls.txt")})
    if fake:
        env["PAIM_IMAGE_CMD"] = f"{sys.executable} {FAKE}"
    if mode:
        env["FAKE_MODE"] = mode
    env.update(extra or {})
    return subprocess.run([sys.executable, str(GEN), str(project), *args], env=env,
                          capture_output=True, text=True, timeout=120)


def calls(tmp_path):
    f = tmp_path / "calls.txt"
    return f.read_text().splitlines() if f.exists() else []


def test_batch(project, tmp_path):
    r = run(project, tmp_path)
    assert r.returncode == 0, r.stdout + r.stderr
    assert sorted(r.stdout.split()) == sorted("OK basket OK coin OK piggy".split())
    for name in ("basket", "coin", "piggy"):
        d = project / "gen" / "sprites"
        assert Image.open(d / f"{name}.png").mode == "RGBA"
        assert (d / f"{name}-raw.png").is_file() and (d / f"{name}.log").is_file()
    assert len(calls(tmp_path)) == 3


def test_batch_rerun_skips(project, tmp_path):
    run(project, tmp_path)
    r = run(project, tmp_path)
    assert r.returncode == 0
    assert sorted(r.stdout.split()) == sorted("SKIP basket SKIP coin SKIP piggy".split())
    assert len(calls(tmp_path)) == 3   # no new calls


def test_batch_only(project, tmp_path):
    r = run(project, tmp_path, "--only", "coin")
    assert r.returncode == 0 and r.stdout.split() == ["OK", "coin"]
    assert calls(tmp_path) == ["coin-raw.png"]
    assert not (project / "gen" / "sprites" / "basket.png").exists()


def test_batch_only_unknown_name(project, tmp_path):
    r = run(project, tmp_path, "--only", "nope")
    assert r.returncode == 2 and "nope" in r.stderr and calls(tmp_path) == []


def test_batch_stdin_not_swallowed(project, tmp_path):
    r = run(project, tmp_path, mode="reads-stdin")
    assert r.returncode == 0, r.stdout + r.stderr
    assert len(list((project / "gen" / "sprites").glob("*-raw.png"))) == 3
    assert len([p for p in (project / "gen" / "sprites").glob("*.png") if "-raw" not in p.name]) == 3


def test_batch_quota(project, tmp_path):
    r = run(project, tmp_path, "--parallel", "1", mode="quota")
    assert r.returncode == 3
    assert len([l for l in r.stdout.splitlines() if l.startswith("QUOTA")]) == 1
    assert len(calls(tmp_path)) == 1   # nothing started after the first failure


def test_batch_fail_exit_1(project, tmp_path):
    r = run(project, tmp_path, "--parallel", "1", mode="nothing", extra={"PAIM_IMAGE_WAIT": "1"})
    assert r.returncode == 1
    lines = r.stdout.splitlines()
    assert len(lines) == 3 and all(l.startswith("FAIL ") and l.endswith(".log)") for l in lines)
    assert "FAIL basket (" in lines[0]


def test_batch_off_palette_keeps_file(project, tmp_path, monkeypatch):
    # the fake draws on-palette colours; a blue thing is simulated by a stub command
    stub = tmp_path / "blue_cli.py"
    stub.write_text(
        "import re, sys\nfrom PIL import Image, ImageDraw\n"
        "name = re.search(r'current directory as (\\S+?)\\. Do nothing', sys.argv[sys.argv.index('-p') + 1]).group(1)\n"
        "im = Image.new('RGB', (256, 256), (255, 0, 255))\n"
        "ImageDraw.Draw(im).ellipse((60, 60, 200, 200), fill=(0x20, 0x40, 0xFF))\nim.save(name)\n")
    r = run(project, tmp_path, "--only", "coin", extra={"PAIM_IMAGE_CMD": f"{sys.executable} {stub}"})
    assert r.returncode == 0
    lines = r.stdout.splitlines()
    assert lines[0] == "OK coin" and lines[1].startswith("OFF-PALETTE coin 0.")
    assert (project / "gen" / "sprites" / "coin.png").is_file()


def test_batch_key_failure_is_a_fail(project, tmp_path):
    stub = tmp_path / "plain_cli.py"
    stub.write_text(
        "import re, sys\nfrom PIL import Image\n"
        "name = re.search(r'current directory as (\\S+?)\\. Do nothing', sys.argv[sys.argv.index('-p') + 1]).group(1)\n"
        "Image.new('RGB', (256, 256), (245, 130, 11)).save(name)\n")
    r = run(project, tmp_path, "--only", "coin", extra={"PAIM_IMAGE_CMD": f"{sys.executable} {stub}"})
    assert r.returncode == 1 and r.stdout.startswith("FAIL coin (")
    assert "background" in (project / "gen" / "sprites" / "coin.log").read_text()


@pytest.mark.parametrize("row", ["Basket!\tx", "has space\tx", "ok\t", "ok", "\tx"])
def test_batch_bad_row(project, tmp_path, row):
    (project / "sprites.tsv").write_text(f"coin\ta coin\n{row}\n", encoding="utf-8")
    r = run(project, tmp_path)
    assert r.returncode == 2 and "sprites.tsv" in r.stderr
    assert calls(tmp_path) == []


def test_batch_duplicate_name(project, tmp_path):
    (project / "sprites.tsv").write_text("coin\ta coin\ncoin\tanother coin\n", encoding="utf-8")
    r = run(project, tmp_path)
    assert r.returncode == 2 and "twice" in r.stderr and calls(tmp_path) == []


def test_batch_missing_tsv(tmp_path):
    p = tmp_path / "empty"
    p.mkdir()
    r = run(p, tmp_path)
    assert r.returncode == 2 and "sprites.tsv" in r.stderr


def test_batch_no_provider(project, tmp_path):
    r = run(project, tmp_path, fake=False)
    assert r.returncode == 2 and "onboarding" in r.stderr
    assert calls(tmp_path) == []


def test_batch_uses_profile_provider(project, tmp_path):
    """With a profile naming the provider and a custom command in it, the batch needs no env override."""
    cfg = tmp_path / "config"
    cfg.mkdir()
    import json
    (cfg / "profile.json").write_text(json.dumps(
        {"image_cli": "gemini", "image_cmd": f"{sys.executable} {FAKE}"}))
    r = run(project, tmp_path, "--only", "coin", fake=False)
    assert r.returncode == 0, r.stdout + r.stderr
    assert calls(tmp_path) == ["coin-raw.png"]
