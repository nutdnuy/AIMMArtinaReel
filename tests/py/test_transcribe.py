import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest

from prep_voice import prep
from transcribe import chunk_bounds

TRANSCRIBE_PY = Path(__file__).resolve().parents[2] / "skills" / "paim-reel" / "scripts" / "transcribe.py"


def test_chunk_bounds_cuts_only_in_silence():
    sr = 16000
    tone = np.sin(np.arange(13 * sr) * 0.05).astype("float32")
    gap = np.zeros(sr, "float32")
    b = chunk_bounds(np.concatenate([tone, gap, tone, gap, tone]), sr)
    assert b[0] == 0.0 and abs(b[-1] - 41.0) < 0.01 and len(b) == 4
    assert all(13.0 <= x <= 14.0 or 27.0 <= x <= 28.0 for x in b[1:-1])


def test_chunk_bounds_short_audio():
    sr = 16000
    tone = np.sin(np.arange(5 * sr) * 0.05).astype("float32")
    assert chunk_bounds(tone, sr) == [0.0, 5.0]


def test_chunk_bounds_forced_cut_without_silence():
    sr = 16000
    tone = np.sin(np.arange(70 * sr) * 0.05).astype("float32")
    b = chunk_bounds(tone, sr)
    assert b[0] == 0.0 and abs(b[-1] - 70.0) < 0.01 and len(b) >= 3
    assert all(y - x <= 30.5 for x, y in zip(b, b[1:]))


def test_chunk_bounds_no_tiny_last_chunk():
    sr = 16000
    tone = np.sin(np.arange(13 * sr) * 0.05).astype("float32")
    gap = np.zeros(sr, "float32")
    b = chunk_bounds(np.concatenate([tone, gap, tone[: 3 * sr]]), sr)   # 13 + 1 + 3 s
    assert b == [0.0, 17.0]


@pytest.mark.skipif(not os.environ.get("PAIM_RUN_WHISPER") or not shutil.which("say"), reason="opt-in")
def test_transcribe_cli(tmp_path):
    aiff = tmp_path / "thai.aiff"
    subprocess.run(["say", "-v", "Kanya", "-o", str(aiff),
                    "สวัสดีครับ วันนี้เรามาคุยกันเรื่องกองทุนรวม และหุ้นไทย"], check=True)
    project = tmp_path / "proj"
    duration = prep(aiff, project)
    env = {**os.environ, "PAIM_WHISPER_MODEL": "tiny"}
    run = lambda: subprocess.run([sys.executable, str(TRANSCRIBE_PY), str(project)],
                                 capture_output=True, text=True, env=env)
    r = run()
    assert r.returncode == 0, r.stderr
    data = json.loads((project / "voice" / "words.json").read_text(encoding="utf-8"))
    words = data["words"]
    assert len(words) >= 3
    t0s = [w["t0"] for w in words]
    assert t0s == sorted(t0s)
    assert words[-1]["t1"] <= duration + 0.01
    draft = project / "script.draft.md"
    assert draft.is_file()
    # a script.md on disk means the draft is left alone
    draft.write_text("sentinel\n", encoding="utf-8")
    (project / "script.md").write_text("l01: x\n", encoding="utf-8")
    assert run().returncode == 0
    assert draft.read_text(encoding="utf-8") == "sentinel\n"
