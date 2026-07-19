from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_json(path: Path):
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def main() -> int:
    required = [
        ROOT / "live.html",
        ROOT / "live.css",
        ROOT / "live.js",
        ROOT / "data/live-game-index.json",
        ROOT / "data/live-lineups.json",
        ROOT / "data/ballparks/index.json",
    ]
    missing = [str(path.relative_to(ROOT)) for path in required if not path.exists()]
    if missing:
        print("FAIL: missing required files:")
        for item in missing:
            print(f"- {item}")
        return 1

    index = load_json(ROOT / "data/live-game-index.json")
    dates = index.get("dates", [])
    daily_files = list((ROOT / "data/live-games").glob("*.json"))
    parks = load_json(ROOT / "data/ballparks/index.json").get("parks", [])
    park_files = list((ROOT / "data/ballparks").glob("venue-*.json"))
    lineups = load_json(ROOT / "data/live-lineups.json").get("lineups", {})

    html = (ROOT / "live.html").read_text(encoding="utf-8")
    javascript = (ROOT / "live.js").read_text(encoding="utf-8")
    html_ids = set(re.findall(r'id="([^"]+)"', html))
    js_ids = set(re.findall(r'\$\("([^"]+)"\)', javascript))
    missing_ids = sorted(js_ids - html_ids)

    print(f"Schedule dates indexed: {len(dates)}")
    print(f"Daily live files: {len(daily_files)}")
    print(f"Ballpark configurations: {len(parks)}")
    print(f"Individual park files: {len(park_files)}")
    print(f"Archived confirmed team lineups: {len(lineups)}")
    print(f"Live HTML element IDs: {len(html_ids)}")

    failures = []
    if len(dates) != len(daily_files):
        failures.append("daily live file count does not match the live index")
    if len(parks) != len(park_files):
        failures.append("ballpark index count does not match individual park files")
    if missing_ids:
        failures.append(f"live.js references missing HTML IDs: {', '.join(missing_ids)}")
    if not index.get("recommended_demo_game_id"):
        failures.append("recommended demo game is missing")

    for entry in dates:
        path = ROOT / entry.get("file", "")
        if not path.exists():
            failures.append(f"missing indexed slate file: {entry.get('file')}")
            break

    if failures:
        print("FAIL:")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print("PASS: Live Game Center Phase 1 files are internally consistent.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
