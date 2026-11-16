import math
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[2]
MAKE = ROOT / "skills" / "paim-reel" / "scripts" / "make_sfx.py"
COMMITTED = ROOT / "skills" / "paim-reel" / "assets" / "sfx"

DURATIONS = {"pop": 0.12, "whoosh": 0.35, "tick": 0.05, "thud": 0.25, "paper": 0.40, "chime": 0.90}
# Where the spectral centroid of each sound should sit (Hz): low for a knock, high for a click.
CENTROID_BAND = {
    "pop": (400, 1500), "whoosh": (500, 3000), "tick": (1500, 6000),
    "thud": (40, 400), "paper": (1500, 6000), "chime": (500, 1500),
}


def run(*args):
    return subprocess.run([sys.executable, str(MAKE), *args], capture_output=True, text=True, timeout=120)


def read(path):
    with wave.open(str(path), "rb") as w:
        params = (w.getnchannels(), w.getsampwidth(), w.getframerate())
        data = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2")
    return params, data


@pytest.fixture(scope="module")
def made(tmp_path_factory):
    out = tmp_path_factory.mktemp("sfx")
    r = run("--out", str(out))
    assert r.returncode == 0, r.stderr
    return out


def test_six_files_with_the_stated_format(made):
    assert sorted(p.name for p in made.iterdir()) == sorted(f"{n}.wav" for n in DURATIONS)
    for name, seconds in DURATIONS.items():
        params, data = read(made / f"{name}.wav")
        assert params == (1, 2, 48000), name
        assert abs(len(data) / 48000 - seconds) <= 0.005, f"{name}: {len(data) / 48000} s"


def test_peak_is_minus_three_dbfs(made):
    for name in DURATIONS:
        _, data = read(made / f"{name}.wav")
        peak = 20 * math.log10(np.abs(data.astype(float)).max() / 32768)
        assert abs(peak - -3) <= 0.5, f"{name}: peak {peak:.2f} dBFS"


def test_fades_start_and_end_at_silence(made):
    for name in DURATIONS:
        _, data = read(made / f"{name}.wav")
        assert abs(int(data[0])) <= 40 and abs(int(data[-1])) <= 40, f"{name}: {data[0]} .. {data[-1]}"


def test_no_dc_offset_and_no_clipping(made):
    for name in DURATIONS:
        _, data = read(made / f"{name}.wav")
        assert abs(data.astype(float).mean()) / 32768 < 0.002, f"{name}: DC {data.mean()}"
        assert np.abs(data.astype(int)).max() < 32000, f"{name} is too close to full scale"


def test_spectral_centroid_fits_the_name(made):
    for name, (lo, hi) in CENTROID_BAND.items():
        _, data = read(made / f"{name}.wav")
        spectrum = np.abs(np.fft.rfft(data.astype(float))) ** 2
        freqs = np.fft.rfftfreq(len(data), 1 / 48000)
        centroid = float((freqs * spectrum).sum() / spectrum.sum())
        assert lo <= centroid <= hi, f"{name}: centroid {centroid:.0f} Hz, expected {lo} to {hi}"


def test_files_are_small(made):
    for name in DURATIONS:
        assert (made / f"{name}.wav").stat().st_size < 100_000, name


def test_two_runs_are_byte_identical(made, tmp_path):
    again = tmp_path / "again"
    assert run("--out", str(again)).returncode == 0
    for name in DURATIONS:
        assert (made / f"{name}.wav").read_bytes() == (again / f"{name}.wav").read_bytes(), name


def test_check_passes_on_the_committed_files():
    r = run("--check")
    assert r.returncode == 0, r.stdout + r.stderr


def test_check_fails_after_one_byte_changes(made, tmp_path):
    copy = tmp_path / "copy"
    copy.mkdir()
    for name in DURATIONS:
        (copy / f"{name}.wav").write_bytes((made / f"{name}.wav").read_bytes())
    assert run("--check", "--out", str(copy)).returncode == 0
    target = copy / "thud.wav"
    raw = bytearray(target.read_bytes())
    raw[len(raw) // 2] ^= 0x01
    target.write_bytes(bytes(raw))
    r = run("--check", "--out", str(copy))
    assert r.returncode == 1
    assert "thud.wav" in r.stdout + r.stderr
    assert (copy / "thud.wav").read_bytes() == bytes(raw), "--check must not rewrite the file"


def test_check_fails_when_a_file_is_missing(made, tmp_path):
    copy = tmp_path / "copy"
    copy.mkdir()
    for name in DURATIONS:
        if name != "pop":
            (copy / f"{name}.wav").write_bytes((made / f"{name}.wav").read_bytes())
    r = run("--check", "--out", str(copy))
    assert r.returncode == 1
    assert "pop.wav" in r.stdout + r.stderr


def test_the_committed_files_are_the_ones_the_script_makes(made):
    for name in DURATIONS:
        assert (COMMITTED / f"{name}.wav").read_bytes() == (made / f"{name}.wav").read_bytes(), name
