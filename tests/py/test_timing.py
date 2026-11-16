import copy
import json
import subprocess
import sys
from pathlib import Path

from paim_script import parse_script
from timing import align, estimate

TIMING_PY = Path(__file__).resolve().parents[2] / "skills" / "paim-reel" / "scripts" / "timing.py"

L1 = parse_script("l01: ETF กับหุ้น ต่างกันยังไง\nl02: กขค งจ")
W = [dict(w="ETF", t0=0.30, t1=0.80), dict(w="กับ", t0=0.80, t1=1.00), dict(w="หุ้น", t0=1.00, t1=1.40),
     dict(w="ต่างกัน", t0=1.50, t1=2.00), dict(w="ยังไง", t0=2.00, t1=2.50),
     dict(w="กขค", t0=3.00, t1=3.60), dict(w="งจ", t0=3.60, t1=4.00)]

# A longer script, so unrelated audio cannot match by coincidence of a few characters.
LONG_SCRIPT = (
    "l01: ETF กับหุ้น ต่างกันยังไง\n"
    "l02: หุ้นคือ การซื้อ บริษัทเดียว\n"
    "l03: ส่วน ETF คือ กองทุน ที่รวมหุ้น หลายตัว ไว้ด้วยกัน\n"
    "l04: ความเสี่ยง จึง กระจายออก ไปตามตัว\n"
)
UNRELATED = [
    ("เมื่อวานนี้", 0.0, 0.7), ("ฝนตกหนัก", 0.7, 1.3), ("ตลอดทั้งคืน", 1.3, 2.0),
    ("น้ำท่วม", 2.0, 2.6), ("ถนนสายหลัก", 2.6, 3.4), ("รถติด", 3.4, 3.9),
    ("มากมาย", 3.9, 4.5), ("ทุกคน", 4.5, 5.0), ("เดินทาง", 5.0, 5.6), ("ช้าลง", 5.6, 6.0),
]
UNRELATED_WORDS = [dict(w=w, t0=a, t1=b) for w, a, b in UNRELATED]


def run_cli(*args):
    return subprocess.run([sys.executable, str(TIMING_PY), *map(str, args)],
                          capture_output=True, text=True)


def make_project(tmp_path, script, words=None, duration=6.0):
    (tmp_path / "script.md").write_text(script, encoding="utf-8")
    if words is not None:
        (tmp_path / "voice").mkdir()
        (tmp_path / "voice" / "words.json").write_text(
            json.dumps({"duration": duration, "words": words}), encoding="utf-8")
    return tmp_path


def all_tokens(t):
    return [tk for line in t["lines"] for tk in line["tokens"]]


def test_estimate_exact():
    t = estimate(parse_script("l01: กขค งจ"))
    tk = t["lines"][0]["tokens"]
    assert t["estimated"] is True
    assert [round(x, 2) for x in (tk[0]["t0"], tk[0]["t1"], tk[1]["t0"], tk[1]["t1"])] == [0.25, 0.49, 0.49, 0.65]
    assert round(t["duration"], 2) == 0.90
    assert t["match"] == 1.0 and t["lines"][0]["ratio"] == 1.0


def test_estimate_line_gap():
    t = estimate(parse_script("l01: กขค งจ\nl02: ฉช"))
    first, second = t["lines"]
    assert abs(second["t0"] - (first["t1"] + 0.30)) < 1e-6


def test_align_token_times():
    t = align(L1, W, 4.3)
    tk = t["lines"][0]["tokens"]
    assert abs(tk[0]["t0"] - 0.30) < 0.05 and abs(tk[1]["t0"] - 0.80) < 0.05 and abs(tk[2]["t0"] - 1.50) < 0.05
    assert abs(t["lines"][0]["t1"] - 2.50) < 0.05 and abs(t["lines"][1]["t0"] - 3.00) < 0.05
    assert t["estimated"] is False and t["match"] > 0.95


def test_align_tolerates_misspelling():
    words = copy.deepcopy(W)
    words[2]["w"] = "หุน"
    t = align(L1, words, 4.3)
    assert t["match"] >= 0.9
    assert abs(t["lines"][0]["tokens"][1]["t0"] - 0.80) < 0.10


def test_align_monotonic():
    t = align(L1, W, 4.3)
    toks = all_tokens(t)
    assert all(tk["t0"] < tk["t1"] for tk in toks)
    t0s = [tk["t0"] for tk in toks]
    assert t0s == sorted(t0s)
    assert toks[-1]["t1"] <= 4.3


def test_align_skipped_line_is_low():
    t = align(L1, W[:5], 4.3)
    assert t["lines"][1]["ratio"] < 0.5
    toks = all_tokens(t)
    assert all(tk["t0"] < tk["t1"] for tk in toks)
    assert toks[-1]["t1"] <= 4.3


def test_align_wrong_audio():
    t = align(parse_script(LONG_SCRIPT), UNRELATED_WORDS, 6.0)
    assert t["match"] < 0.60


def test_cli_estimate_writes_timing(tmp_path):
    make_project(tmp_path, "# t\nl01: กขค งจ\n")
    r = run_cli("estimate", tmp_path)
    assert r.returncode == 0, r.stderr
    t = json.loads((tmp_path / "timing.json").read_text(encoding="utf-8"))
    assert t["estimated"] is True and t["lines"][0]["id"] == "l01"


def test_cli_align_writes_timing_and_reports_low(tmp_path):
    make_project(tmp_path, "l01: ETF กับหุ้น ต่างกันยังไง\nl02: กขค งจ\n", words=W[:5], duration=4.3)
    r = run_cli("align", tmp_path)
    assert r.returncode == 0, r.stderr
    assert r.stdout.startswith("LOW l02 ") or "\nLOW l02 " in r.stdout
    assert "กขค งจ" in r.stdout
    t = json.loads((tmp_path / "timing.json").read_text(encoding="utf-8"))
    assert t["estimated"] is False and t["duration"] == 4.3


def test_cli_align_wrong_audio_exit_2(tmp_path):
    make_project(tmp_path, LONG_SCRIPT, words=UNRELATED_WORDS, duration=6.0)
    r = run_cli("align", tmp_path)
    assert r.returncode == 2
    assert not (tmp_path / "timing.json").exists()


def test_cli_long_token_exit_2(tmp_path):
    make_project(tmp_path, "l01: " + "ก" * 15 + " ข\n")
    r = run_cli("estimate", tmp_path)
    assert r.returncode == 2
    assert "l01" in r.stderr + r.stdout
    assert not (tmp_path / "timing.json").exists()
