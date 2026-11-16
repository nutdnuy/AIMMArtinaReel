import json
import os
import shlex
import subprocess
import sys
import time
from pathlib import Path

import pytest
from PIL import Image

import image_cli
from image_cli import ASK, STYLE, ImageCliError, QuotaError, build_command, generate, load_profile, resolve_provider

FAKE = Path(__file__).resolve().parents[1] / "fixtures" / "fake_image_cli.py"
IMAGE_CLI_PY = Path(__file__).resolve().parents[2] / "skills" / "paim-reel" / "scripts" / "image_cli.py"


@pytest.fixture
def fake(tmp_path, monkeypatch):
    """Point the adapter at the fake CLI; returns a function that counts its calls."""
    calls = tmp_path / "calls.txt"
    monkeypatch.setenv("PAIM_IMAGE_CMD", f"{sys.executable} {FAKE}")
    monkeypatch.setenv("PAIM_IMAGE_BACKOFF", "0")
    monkeypatch.setenv("PAIM_CONFIG_DIR", str(tmp_path / "config"))
    monkeypatch.setenv("FAKE_CALLS", str(calls))
    monkeypatch.delenv("FAKE_MODE", raising=False)
    return lambda: len(calls.read_text().splitlines()) if calls.exists() else 0


def test_commands_exact(monkeypatch):
    monkeypatch.delenv("PAIM_IMAGE_CMD", raising=False)
    assert build_command("codex", "A", Path("/p")) == [
        "codex", "exec", "--skip-git-repo-check", "-s", "workspace-write", "-C", "/p", "A"]
    assert build_command("gemini", "A", Path("/p")) == ["gemini", "-p", "A", "--yolo", "--skip-trust"]
    monkeypatch.setenv("PAIM_IMAGE_CMD", "agy --dangerously-skip-permissions")
    assert build_command("gemini", "A", Path("/p")) == ["agy", "--dangerously-skip-permissions", "-p", "A"]


def test_generate_with_relative_folder(tmp_path, fake, monkeypatch):
    """The command runs with cwd=folder, so a relative -C or file path would point at nothing."""
    monkeypatch.chdir(tmp_path)
    seen = {}
    real_popen = subprocess.Popen

    def spy(cmd, **kw):
        seen["cmd"], seen["cwd"] = cmd, kw["cwd"]
        return real_popen(cmd, **kw)

    monkeypatch.setattr(subprocess, "Popen", spy)
    out = generate("codex", Path("proj/gen/sprites"), "a-raw.png", "x", wait=10)
    assert out.is_absolute() and out.is_file() and out == tmp_path.resolve() / "proj/gen/sprites/a-raw.png"
    assert Path(seen["cwd"]).is_absolute()


def test_build_command_codex_folder_is_absolute_when_generate_calls_it(tmp_path, monkeypatch):
    monkeypatch.delenv("PAIM_IMAGE_CMD", raising=False)
    monkeypatch.chdir(tmp_path)
    captured = {}

    def fake_popen(cmd, **kw):
        captured["cmd"] = cmd
        raise FileNotFoundError

    monkeypatch.setattr(subprocess, "Popen", fake_popen)
    with pytest.raises(ImageCliError):
        generate("codex", Path("rel/dir"), "a-raw.png", "x")
    assert captured["cmd"][captured["cmd"].index("-C") + 1] == str(tmp_path.resolve() / "rel/dir")


def test_profile_image_cmd_and_env_wins(monkeypatch):
    monkeypatch.delenv("PAIM_IMAGE_CMD", raising=False)
    profile = {"image_cmd": "mycli --yes"}
    assert build_command("codex", "A", Path("/p"), profile) == ["mycli", "--yes", "-p", "A"]
    monkeypatch.setenv("PAIM_IMAGE_CMD", "other")
    assert build_command("codex", "A", Path("/p"), profile) == ["other", "-p", "A"]


def test_resolve_provider():
    assert resolve_provider(None, "codex") == "codex"
    assert resolve_provider({"image_cli": "gemini"}, "claude") == "gemini"
    with pytest.raises(ImageCliError, match="onboarding"):
        resolve_provider(None, "claude")
    with pytest.raises(ImageCliError, match="onboarding"):
        resolve_provider({"image_cli": None}, "claude")


def test_load_profile(tmp_path, monkeypatch):
    monkeypatch.setenv("PAIM_CONFIG_DIR", str(tmp_path))
    assert load_profile() is None
    (tmp_path / "profile.json").write_text(json.dumps({"image_cli": "codex"}))
    assert load_profile()["image_cli"] == "codex"
    (tmp_path / "profile.json").write_text("{nope")
    with pytest.raises(ImageCliError, match="profile.json"):
        load_profile()


def test_prompt_carries_the_brand():
    for needle in ("#F5820B", "#14856D", "#252B31", "#FFFAF0", "#FF00FF", "no logos", "no real people"):
        assert needle in STYLE
    assert "{filename}" in ASK and "{subject}" in ASK and "{size}" in ASK and "{style}" in ASK


def test_generate_ok(tmp_path, fake):
    out = generate("codex", tmp_path / "s", "basket-raw.png", "a shopping basket", wait=10)
    assert out == tmp_path / "s" / "basket-raw.png" and out.is_file()
    assert Image.open(out).size == (512, 512)
    assert fake() == 1
    assert (tmp_path / "s" / "basket.log").is_file()


def test_generate_late_file(tmp_path, fake, monkeypatch):
    monkeypatch.setenv("FAKE_MODE", "late")
    out = generate("gemini", tmp_path, "a-raw.png", "x", wait=10)
    assert out.is_file() and fake() == 1


def test_generate_quota_no_retry(tmp_path, fake, monkeypatch):
    monkeypatch.setenv("FAKE_MODE", "quota")
    with pytest.raises(QuotaError):
        generate("gemini", tmp_path, "a-raw.png", "x", wait=10)
    assert fake() == 1


def test_generate_429_retries(tmp_path, fake, monkeypatch):
    monkeypatch.setenv("FAKE_MODE", "429-once")
    out = generate("gemini", tmp_path, "a-raw.png", "x", wait=10)
    assert out.is_file() and fake() == 2


def test_generate_429_gives_up(tmp_path, fake, monkeypatch):
    monkeypatch.setenv("PAIM_IMAGE_CMD", f"{sys.executable} -c print('429')")
    with pytest.raises(ImageCliError, match="429") as e:
        generate("gemini", tmp_path, "a-raw.png", "x", wait=3)
    assert str(tmp_path / "a.log") in str(e.value)


def test_generate_failed_command_does_not_wait(tmp_path, fake, monkeypatch):
    monkeypatch.setenv("PAIM_IMAGE_CMD", f"{sys.executable} -c import\\ sys;sys.exit(3)")
    started = time.monotonic()
    with pytest.raises(ImageCliError, match="exit code 3") as e:
        generate("gemini", tmp_path, "a-raw.png", "x", wait=60)
    assert time.monotonic() - started < 10
    assert str(tmp_path / "a.log") in str(e.value)


def test_generate_nothing(tmp_path, fake, monkeypatch):
    monkeypatch.setenv("FAKE_MODE", "nothing")
    with pytest.raises(ImageCliError) as e:
        generate("gemini", tmp_path, "a-raw.png", "x", wait=3)
    assert str(tmp_path / "a.log") in str(e.value)


def test_generate_not_installed(tmp_path, monkeypatch):
    monkeypatch.delenv("PAIM_IMAGE_CMD", raising=False)
    monkeypatch.setenv("PATH", str(tmp_path / "empty"))
    with pytest.raises(ImageCliError, match="npm install -g @google/gemini-cli"):
        generate("gemini", tmp_path, "a-raw.png", "x", wait=3)
    with pytest.raises(ImageCliError, match="npm install -g @openai/codex"):
        generate("codex", tmp_path, "a-raw.png", "x", wait=3)


def test_stale_raw_is_not_taken_for_a_new_drawing(tmp_path, fake, monkeypatch):
    (tmp_path / "a-raw.png").write_bytes(b"stale")
    monkeypatch.setenv("FAKE_MODE", "nothing")
    with pytest.raises(ImageCliError):
        generate("gemini", tmp_path, "a-raw.png", "x", wait=3)


def run_test_command(tmp_path, *args, env_extra=None):
    env = {**os.environ, "PAIM_CONFIG_DIR": str(tmp_path / "config"), **(env_extra or {})}
    return subprocess.run([sys.executable, str(IMAGE_CLI_PY), "test", *args], env=env,
                          capture_output=True, text=True)


def test_cli_test_draws_and_keys(tmp_path):
    env = {"PAIM_IMAGE_CMD": f"{sys.executable} {FAKE}", "FAKE_CALLS": str(tmp_path / "calls.txt")}
    r = run_test_command(tmp_path, "--agent", "codex", env_extra=env)
    assert r.returncode == 0, r.stderr
    keyed = tmp_path / "config" / "test" / "sample.png"
    assert r.stdout.strip() == str(keyed)
    assert Image.open(keyed).mode == "RGBA"
    assert (tmp_path / "calls.txt").read_text().strip() == "sample-raw.png"


def test_cli_test_one_sentence_on_error(tmp_path):
    env = {"FAKE_MODE": "quota", "PAIM_IMAGE_CMD": f"{sys.executable} {FAKE}",
           "FAKE_CALLS": str(tmp_path / "calls.txt")}
    r = run_test_command(tmp_path, "--agent", "codex", env_extra=env)
    assert r.returncode == 2
    assert len(r.stderr.strip().splitlines()) == 1 and r.stdout == ""


@pytest.mark.parametrize("log_text, expect", [
    ("Error authenticating: IneligibleTierError: This client is no longer supported", "agy --dangerously-skip-permissions"),
    ("Gemini CLI is not running in a trusted directory. To proceed, use --skip-trust", "GEMINI_CLI_TRUST_WORKSPACE=true"),
])
def test_cli_test_explains_gemini_failure(tmp_path, log_text, expect):
    stub = tmp_path / "gemini_stub.py"
    stub.write_text(f"import sys\nprint({log_text!r})\nsys.exit(41)\n")
    env = {"PAIM_IMAGE_CMD": f"{sys.executable} {stub}"}
    r = run_test_command(tmp_path, "--agent", "codex", env_extra=env)
    assert r.returncode == 2 and r.stdout == ""
    assert r.stderr.startswith("Gemini CLI on this machine cannot draw yet: ") and expect in r.stderr
    assert len(r.stderr.strip().splitlines()) == 1


def test_cli_test_no_provider(tmp_path):
    env = {k: v for k, v in os.environ.items() if k != "PAIM_IMAGE_CMD"}
    r = subprocess.run([sys.executable, str(IMAGE_CLI_PY), "test"],
                       env={**env, "PAIM_CONFIG_DIR": str(tmp_path / "config")}, capture_output=True, text=True)
    assert r.returncode == 2 and "onboarding" in r.stderr


@pytest.mark.skipif(not os.environ.get("PAIM_RUN_IMAGE"), reason="opt-in, spends image quota")
def test_real_provider_draws(tmp_path):
    """Draws one sticker with the provider named in the real profile."""
    env = {k: v for k, v in os.environ.items() if k != "PAIM_IMAGE_CMD"}
    r = subprocess.run([sys.executable, str(IMAGE_CLI_PY), "test"], env=env, capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    from key_sprite import key
    info = key(Path(r.stdout.strip()), tmp_path / "again.png")
    assert info["on_palette"] >= 0.6


HANGER = """\
import subprocess, sys, time
# a background writer (what an image CLI's sub-process looks like), then a hang
subprocess.Popen([sys.executable, "-c",
                  "import pathlib, sys, time; time.sleep(3); pathlib.Path(sys.argv[1]).write_text('late')", sys.argv[1]])
open(sys.argv[2], "w").write(str(__import__("os").getpid()))
time.sleep(60)
"""


def test_a_timed_out_command_is_stopped_with_everything_it_started(tmp_path, monkeypatch):
    """subprocess.run(timeout=) kills only the direct child: its background writer lived on and wrote later."""
    script = tmp_path / "hang.py"
    script.write_text(HANGER, encoding="utf-8")
    marker, pidfile = tmp_path / "late-write.txt", tmp_path / "hang.pid"
    monkeypatch.setenv("PAIM_IMAGE_CMD", f"{shlex.quote(sys.executable)} {script} {marker} {pidfile}")
    monkeypatch.setenv("PAIM_IMAGE_BACKOFF", "0")
    monkeypatch.setenv("PAIM_CONFIG_DIR", str(tmp_path / "config"))
    with pytest.raises(ImageCliError):
        generate("codex", tmp_path / "out", "a-raw.png", "x", wait=1)
    hung = int(pidfile.read_text())
    time.sleep(4)   # the background writer would have written at 3 s
    assert not marker.exists(), "the child of the timed-out command survived and wrote its file"
    with pytest.raises(ProcessLookupError):
        os.kill(hung, 0)   # the hung command itself is gone and reaped
