import json
import re
import subprocess
import sys
from pathlib import Path

import pytest

from prep_voice import VoiceError, prep

PREP_PY = Path(__file__).resolve().parents[2] / "skills" / "paim-reel" / "scripts" / "prep_voice.py"


def ffprobe(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
         "stream=channels,sample_rate,codec_name", "-of", "json", str(path)],
        capture_output=True, text=True, check=True).stdout
    s = json.loads(out)["streams"][0]
    return {"channels": s["channels"], "sample_rate": int(s["sample_rate"]), "codec_name": s["codec_name"]}


def max_volume(path):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(path), "-af", "volumedetect", "-f", "null", "-"],
                       capture_output=True, text=True, check=True)
    return float(re.search(r"max_volume:\s*(-?[\d.]+) dB", r.stderr).group(1))


def build_audio(dest, gap, extra=()):
    """sine 1 s, silence `gap` s, sine 1 s, stereo 44.1 kHz."""
    fmt = "aformat=sample_rates=44100:channel_layouts=stereo"
    graph = (f"sine=frequency=440:duration=1,{fmt}[a];"
             f"anullsrc=r=44100:cl=stereo,atrim=duration={gap}[g];"
             f"sine=frequency=440:duration=1,{fmt}[b];"
             "[a][g][b]concat=n=3:v=0:a=1[out]")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-filter_complex", graph, "-map", "[out]",
                    *extra, str(dest)], check=True)
    return dest


@pytest.fixture
def tone_gap_tone(tmp_path):
    return build_audio(tmp_path / "เสียง ทดสอบ.m4a", 3, ["-c:a", "aac"])


def test_prep_output_format(tone_gap_tone, tmp_path):
    d = prep(tone_gap_tone, tmp_path / "p")
    info = ffprobe(tmp_path / "p/voice/voice.wav")
    assert info["channels"] == 1 and info["sample_rate"] == 48000 and info["codec_name"] == "pcm_s16le"
    assert 2.5 <= d <= 3.1          # 0.25 lead-in + 1 + 0.45 pause + 1, the 3 s gap is gone


def test_prep_peak(tone_gap_tone, tmp_path):
    prep(tone_gap_tone, tmp_path / "p")
    assert max_volume(tmp_path / "p/voice/voice.wav") <= -1.0


def test_prep_peak_limits_spiky_audio(tmp_path):
    # Quiet tone with loud clicks: loudnorm raises the gain and the clicks must still stay under -1 dBFS.
    src = tmp_path / "spiky.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i",
                    "aevalsrc=if(lt(mod(t\\,0.5)\\,0.002)\\,0.9\\,0.02*sin(2*PI*300*t)):s=48000:d=3",
                    str(src)], check=True)
    prep(src, tmp_path / "p")
    assert max_volume(tmp_path / "p/voice/voice.wav") <= -1.0


@pytest.mark.parametrize("gap,lo,hi", [
    (0.4, 2.60, 2.70),    # shorter than 0.45 s: untouched, 0.25 + 1 + 0.4 + 1
    (0.45, 2.65, 2.75),   # exactly 0.45 s: untouched
    (0.5, 2.68, 2.76),    # 0.45-0.60 s band: shortened to 0.45 s, 0.25 + 1 + 0.45 + 1
    (2.0, 2.68, 2.76),    # long pause: shortened to 0.45 s
])
def test_prep_pause_rule(tmp_path, gap, lo, hi):
    src = build_audio(tmp_path / "gap.wav", gap)
    assert lo <= prep(src, tmp_path / "p") <= hi


@pytest.mark.parametrize("tail", [0.0, 0.1, 0.3, 0.5, 1.5])
def test_prep_trims_tail(tmp_path, tail):
    # 1 s tone then `tail` s of silence: result is 0.25 lead-in + 1 s tone + at most 0.15 s of tail
    fmt = "aformat=sample_rates=44100:channel_layouts=stereo"
    graph = (f"sine=frequency=440:duration=1,{fmt}[a];"
             f"anullsrc=r=44100:cl=stereo,atrim=duration={max(tail, 0.01)}[g];"
             "[a][g]concat=n=2:v=0:a=1[out]")
    src = tmp_path / "tail.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-filter_complex", graph, "-map", "[out]", str(src)],
                   check=True)
    d = prep(src, tmp_path / "p")
    assert 1.20 <= d <= 1.25 + 0.15 + 0.02


def test_prep_mov_with_video(tmp_path):
    src = tmp_path / "clip.mov"
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=gray:s=160x90:d=2.5:r=10",
         "-f", "lavfi", "-i", "sine=frequency=440:duration=2.5", "-c:v", "mpeg4", "-c:a", "aac",
         "-shortest", str(src)], check=True)
    d = prep(src, tmp_path / "p")
    assert 2.5 <= d <= 3.1
    assert ffprobe(tmp_path / "p/voice/voice.wav")["codec_name"] == "pcm_s16le"


def test_prep_silent_raises(tmp_path):
    src = tmp_path / "silent.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono",
                    "-t", "3", str(src)], check=True)
    with pytest.raises(VoiceError, match="no speech"):
        prep(src, tmp_path / "p")


def test_prep_missing_file_raises(tmp_path):
    missing = tmp_path / "ไม่มี.m4a"
    with pytest.raises(VoiceError, match="ไม่มี.m4a"):
        prep(missing, tmp_path / "p")


def test_prep_cli_exit_codes(tone_gap_tone, tmp_path):
    ok = subprocess.run([sys.executable, str(PREP_PY), str(tone_gap_tone), str(tmp_path / "p")],
                        capture_output=True, text=True)
    assert ok.returncode == 0 and "WARN" not in ok.stdout
    bad = subprocess.run([sys.executable, str(PREP_PY), str(tmp_path / "nope.m4a"), str(tmp_path / "q")],
                         capture_output=True, text=True)
    assert bad.returncode == 2 and "nope.m4a" in bad.stderr


def test_prep_cli_warns_over_90s(tmp_path):
    src = tmp_path / "long.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=95",
                    str(src)], check=True)
    r = subprocess.run([sys.executable, str(PREP_PY), str(src), str(tmp_path / "p")],
                       capture_output=True, text=True)
    assert r.returncode == 0 and "WARN longer than 90 s" in r.stdout
