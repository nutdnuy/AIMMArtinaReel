"""Clean a voice recording into <project>/voice/voice.wav.

  prep_voice.py <audio> <project>

Mono 48 kHz, head silence trimmed to a 0.25 s lead-in, pauses over 0.60 s shortened
to 0.45 s (see the note in prep()), loudness -14 LUFS, true peak under -1 dBFS. Any audio or video container
ffmpeg can read is accepted; only the first audio stream is used.
"""
import subprocess
import sys
import tempfile
from pathlib import Path

SAMPLE_RATE = 48000
LEAD_IN = 0.25
PAUSE_KEEP = 0.45
SILENCE_DB = -45
MIN_SPEECH = 1.0
WARN_LONGER = 90.0
TARGET_LUFS = -14
TRUE_PEAK = -1
# Limiter ceiling a little under the -1 dBFS target so rounding cannot read above it.
LIMIT = 10 ** (-1.2 / 20)


class VoiceError(Exception):
    pass


def _run(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True)


def _duration(path: Path) -> float:
    r = _run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
              "-of", "default=nw=1:nk=1", str(path)])
    try:
        return float(r.stdout.strip())
    except ValueError:
        return 0.0


def _has_audio(path: Path) -> bool:
    r = _run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries",
              "stream=index", "-of", "csv=p=0", str(path)])
    return r.returncode == 0 and bool(r.stdout.strip())


def _ffmpeg(args: list[str], what: str) -> None:
    r = _run(["ffmpeg", "-v", "error", "-y", *args])
    if r.returncode != 0:
        tail = r.stderr.strip().splitlines()[-1:] or ["unknown error"]
        raise VoiceError(f"ffmpeg failed to {what}: {tail[0]}")


def prep(src: Path, project: Path) -> float:
    """Write <project>/voice/voice.wav from `src`; return its duration in seconds."""
    src, project = Path(src), Path(project)
    if not src.is_file():
        raise VoiceError(f"audio file not found: {src}")
    if not _has_audio(src):
        raise VoiceError(f"no audio stream in {src}")

    # ffmpeg's silenceremove keeps stop_duration + stop_silence of a long pause, so the
    # 0.45 s target is stop_duration itself. Side effect: pauses of 0.45-0.60 s are also
    # clamped to 0.45 s; shorter ones are untouched.
    trim = (f"aresample={SAMPLE_RATE},"
            f"silenceremove=start_periods=1:start_threshold={SILENCE_DB}dB,"
            f"silenceremove=stop_periods=-1:stop_duration={PAUSE_KEEP}"
            f":stop_threshold={SILENCE_DB}dB:stop_silence=0")
    finish = (f"loudnorm=I={TARGET_LUFS}:TP={TRUE_PEAK}:LRA=11,aresample={SAMPLE_RATE},"
              f"alimiter=limit={LIMIT:.4f}:level=disabled,adelay={round(LEAD_IN * 1000)}:all=1")
    out = project / "voice" / "voice.wav"
    out.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp:
        trimmed = Path(tmp) / "trimmed.wav"
        _ffmpeg(["-i", str(src), "-vn", "-map", "0:a:0", "-ac", "1", "-af", trim,
                 "-c:a", "pcm_s16le", str(trimmed)], "trim silence")
        if not trimmed.is_file() or _duration(trimmed) < MIN_SPEECH:
            raise VoiceError(f"no speech found in {src} (less than {MIN_SPEECH:.0f} s above {SILENCE_DB} dB)")
        staged = Path(tmp) / "voice.wav"
        _ffmpeg(["-i", str(trimmed), "-af", finish, "-ar", str(SAMPLE_RATE), "-ac", "1",
                 "-c:a", "pcm_s16le", str(staged)], "normalise loudness")
        staged.replace(out)
    return round(_duration(out), 3)


def main(argv) -> int:
    if len(argv) != 3:
        print("usage: prep_voice.py <audio> <project>", file=sys.stderr)
        return 1
    try:
        d = prep(Path(argv[1]), Path(argv[2]))
    except VoiceError as e:
        print(str(e), file=sys.stderr)
        return 2
    print(f"voice {d:.2f} s -> {Path(argv[2]) / 'voice' / 'voice.wav'}")
    if d > WARN_LONGER:
        print("WARN longer than 90 s")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
