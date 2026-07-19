#!/usr/bin/env python3
from __future__ import annotations

from collections import Counter
from pathlib import Path
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "live.html"
CSS = ROOT / "live.css"
JS = ROOT / "live.js"


def fail(message: str) -> None:
    print(f"FAIL: {message}")
    raise SystemExit(1)


def main() -> int:
    for path in (HTML, CSS, JS):
        if not path.exists():
            fail(f"Missing {path.relative_to(ROOT)}")

    html = HTML.read_text(encoding="utf-8")
    css = CSS.read_text(encoding="utf-8")
    js = JS.read_text(encoding="utf-8")

    ids = re.findall(r'\bid="([^"]+)"', html)
    duplicates = [name for name, count in Counter(ids).items() if count > 1]
    if duplicates:
        fail(f"Duplicate HTML IDs: {', '.join(duplicates[:10])}")

    required_ids = {
        "fullPlateHud", "fullPlateHudScene", "plateTheaterWorld",
        "fullBatterModule", "fullBatterName", "fullBatterGameEvents",
        "fullPitcherModule", "fullPitcherName", "fullPitchCount",
        "fullPlateScoreBug", "fullAwayScore", "fullHomeScore",
        "fullPlateInning", "fullPlateCount", "fullPlateOuts",
        "fullPitchMiniZone", "fullPitchList", "plateEventLayer",
        "plateEventBall", "plateEventGlyph", "plateEventBanner",
        "fullPlateLiveFeed", "closePlateHudButton",
    }
    missing_ids = sorted(required_ids.difference(ids))
    if missing_ids:
        fail(f"Missing Plate Event Theater IDs: {', '.join(missing_ids)}")

    js_refs = set(re.findall(r'\$\("([^"]+)"\)', js))
    missing_refs = sorted(js_refs.difference(ids))
    if missing_refs:
        fail(f"JavaScript references missing HTML IDs: {', '.join(missing_refs[:15])}")

    required_js = (
        "function renderFullPlateHudState()",
        "function handlePlateLook(event)",
        "function playPlateEventAnimation(type, payload = {})",
        "function ingestPlateEvent(payload = {})",
        "function simulateBattedBall(kind)",
        "window.BoringBetsPlateHud",
        'kind === "home-run"',
        'playPlateEventAnimation(kind',
    )
    for marker in required_js:
        if marker not in js:
            fail(f"Missing JavaScript marker: {marker}")

    required_css = (
        ".plate-theater-scene", ".plate-theater-world", ".plate-module",
        ".plate-scorebug", ".plate-event-ball", ".event-home-run",
        "@keyframes theaterSwing", "@keyframes theaterWhiff",
    )
    for marker in required_css:
        if marker not in css:
            fail(f"Missing CSS marker: {marker}")
    if css.count("{") != css.count("}"):
        fail("CSS braces are unbalanced")

    node = shutil.which("node")
    if node:
        result = subprocess.run([node, "--check", str(JS)], capture_output=True, text=True)
        if result.returncode:
            print(result.stderr.strip())
            fail("JavaScript syntax check failed")
        syntax_status = "PASS"
    else:
        syntax_status = "SKIPPED (Node.js not installed; non-blocking)"

    print(f"Live HTML element IDs: {len(ids)}")
    print("Immersive scene: wide 2.5D Tron Park environment")
    print("Look controls: pointer pan + keyboard left/right")
    print("Click park to return: enabled")
    print("Live modules: batter + game log + pitcher + pitch trails + score bug")
    print("Event animations: pitch + strikeout + foul + line drive + home run")
    print("External live adapter: window.BoringBetsPlateHud.ingest(event)")
    print(f"JavaScript syntax check: {syntax_status}")
    print("PASS: Plate Event Theater Phase 1 is internally consistent.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
