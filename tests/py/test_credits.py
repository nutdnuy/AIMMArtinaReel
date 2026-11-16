import json
import subprocess
import sys
from pathlib import Path

import pytest

CREDITS = Path(__file__).resolve().parents[2] / "skills" / "paim-reel" / "scripts" / "credits.py"


def entry(name, license="unknown", credit="", page=None):
    return {"name": name, "image_url": f"https://img.example/{name}.jpg", "page_url": page or f"https://page.example/{name}",
            "license": license, "credit": credit, "fetched_at": "2026-11-16T10:00:00+00:00",
            "sha256": "0" * 64, "width": 1200, "height": 900}


def photo_item(item_id, name):
    return {"id": item_id, "type": "photo", "photo": name, "at": "l01"}


@pytest.fixture
def project(tmp_path):
    p = tmp_path / "proj"
    (p / "gen" / "photos").mkdir(parents=True)
    return p


def write(project, items, entries, slug="money-talk"):
    story = {"slug": slug, "title": "Money talk",
             "scenes": [{"id": "s1", "from": "l01", "layout": "row", "items": items}]}
    (project / "story.json").write_text(json.dumps(story), encoding="utf-8")
    (project / "gen" / "photos" / "credits.json").write_text(json.dumps(entries), encoding="utf-8")


def run(project):
    return subprocess.run([sys.executable, str(CREDITS), str(project)], capture_output=True, text=True, timeout=60)


def test_lists_every_used_photo_with_unknown_licences_first(project):
    write(project,
          [photo_item("a", "bank"), photo_item("b", "coin"), photo_item("c", "note"), photo_item("d", "bank")],
          [entry("coin", "CC0", "Jane Doe", "https://commons.example/Coin"), entry("bank"), entry("note", "unknown", "A. Writer"),
           entry("unused", "CC0")])
    r = run(project)
    assert r.returncode == 0, r.stderr
    assert r.stdout.strip() == "credits: 3 photos, 2 with unknown licence"
    text = (project / "renders" / "money-talk-credits.md").read_text(encoding="utf-8")
    assert text.index("Licence unknown (2)") < text.index("bank") < text.index("note") < text.index("Licence stated")
    assert text.index("Licence stated") < text.index("coin")
    assert "https://commons.example/Coin" in text and "CC0" in text and "Jane Doe" in text and "A. Writer" in text
    assert "may be copyrighted" in text and "unused" not in text
    assert text.count("**bank**") == 1   # a photo used twice is listed once


def test_a_story_with_licences_only_has_no_unknown_heading(project):
    write(project, [photo_item("a", "coin")], [entry("coin", "CC0")])
    r = run(project)
    assert r.returncode == 0 and r.stdout.strip() == "credits: 1 photos, 0 with unknown licence"
    text = (project / "renders" / "money-talk-credits.md").read_text(encoding="utf-8")
    assert "Licence unknown" not in text


def test_a_story_without_photos_still_reports(project):
    write(project, [{"id": "a", "type": "icon", "icon": "coins", "color": "orange", "at": "l01"}], [])
    r = run(project)
    assert r.returncode == 0 and r.stdout.strip() == "credits: 0 photos, 0 with unknown licence"


def test_a_photo_without_an_entry_is_exit_2_and_writes_nothing(project):
    write(project, [photo_item("a", "bank"), photo_item("b", "coin")], [entry("coin", "CC0")])
    r = run(project)
    assert r.returncode == 2
    assert "bank" in r.stderr and "coin" not in r.stderr and "fetch_photo.py" in r.stderr
    assert not (project / "renders").exists()


def test_no_credits_file_at_all_is_exit_2_when_a_photo_is_used(project):
    write(project, [photo_item("a", "bank")], [])
    (project / "gen" / "photos" / "credits.json").unlink()
    r = run(project)
    assert r.returncode == 2 and "bank" in r.stderr


def test_a_missing_story_is_exit_2(tmp_path):
    r = run(tmp_path)
    assert r.returncode == 2 and "story.json" in r.stderr


def test_a_damaged_credits_file_is_exit_2(project):
    write(project, [photo_item("a", "bank")], [])
    (project / "gen" / "photos" / "credits.json").write_text("[{", encoding="utf-8")
    r = run(project)
    assert r.returncode == 2 and "credits.json" in r.stderr
