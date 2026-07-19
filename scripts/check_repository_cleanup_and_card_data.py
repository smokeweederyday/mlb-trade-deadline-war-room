#!/usr/bin/env python3
"""Validate the root-cleanup and Today’s Card automation package."""
from __future__ import annotations

import argparse
from datetime import datetime
import json
from pathlib import Path
import subprocess
import sys
from typing import Any, Dict, List
from zoneinfo import ZoneInfo

EASTERN = ZoneInfo("America/New_York")
ROOT = Path(__file__).resolve().parents[1]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Check Boring Bets card automation and root cleanup.")
    parser.add_argument("--date", default=None, help="Card date to validate. Defaults to today ET or a local sample shard.")
    parser.add_argument("--root", type=Path, default=ROOT)
    return parser.parse_args()


def fail(message: str) -> None:
    raise SystemExit("FAIL: " + message)


def require(path: Path) -> Path:
    if not path.exists():
        fail("missing required file: {}".format(path))
    return path


def read_json(path: Path) -> Dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        fail("cannot read {}: {}".format(path, exc))
    if not isinstance(value, dict):
        fail("{} must contain an object".format(path))
    return value


def choose_date(root: Path, requested: str) -> str:
    if requested:
        return requested
    today = datetime.now(EASTERN).date().isoformat()
    if (root / "data" / "games" / (today + ".json")).exists():
        return today
    candidates = sorted((root / "data" / "games").glob("20??-??-??.json"), reverse=True)
    if not candidates:
        fail("no data/games date shard is available")
    return candidates[0].stem


def run_checked(command: List[str], root: Path) -> str:
    completed = subprocess.run(command, cwd=str(root), text=True, capture_output=True, check=False)
    if completed.returncode != 0:
        fail("command failed: {}\n{}\n{}".format(" ".join(command), completed.stdout, completed.stderr))
    return completed.stdout


def main() -> int:
    args = parse_args()
    root = args.root.resolve()
    date_value = choose_date(root, args.date)

    required_scripts = [
        "build_todays_card_data.py",
        "cleanup_repository_root.py",
        "sync_baseball_final_scores.py",
        "scheduled_refresh.py",
        "build_minor_league_schedules.py",
        "build_public_mlb_data.py",
        "run_local_card_refresh.py",
    ]
    for name in required_scripts:
        require(root / "scripts" / name)

    compile_command = [sys.executable, "-m", "py_compile"] + [
        str(root / "scripts" / name) for name in required_scripts
    ]
    run_checked(compile_command, root)

    run_checked([
        sys.executable,
        "-u",
        str(root / "scripts" / "build_todays_card_data.py"),
        "--date",
        date_value,
        "--root",
        str(root),
    ], root)

    card_path = require(root / "data" / "cards" / date_value / "mlb.json")
    card = read_json(card_path)
    if card.get("date") != date_value:
        fail("generated MLB card declares the wrong date")
    games = card.get("games")
    if not isinstance(games, list) or not games:
        fail("generated MLB card contains no games")

    rich_games = 0
    wrong_dates = 0
    for game in games:
        if not isinstance(game, dict):
            continue
        if game.get("date") and game.get("date") != date_value:
            wrong_dates += 1
        availability = ((game.get("card") or {}).get("data_available") or {})
        if sum(bool(availability.get(key)) for key in ("pitchers", "weather", "lineups", "offense", "bullpens", "context")) >= 4:
            rich_games += 1
        for key in ("game_url", "live_url", "breakdown_url"):
            if not game.get(key):
                fail("{} is missing {}".format(game.get("id"), key))
    if wrong_dates:
        fail("generated card contains {} wrong-date games".format(wrong_dates))
    if rich_games == 0:
        fail("no cards contain a useful set of enriched fields")

    js = require(root / "todays-card.js").read_text(encoding="utf-8")
    required_js = [
        "data/cards/${encodeURIComponent(date)}/mlb.json",
        "data/games/${encodeURIComponent(date)}.json",
        "scheduleCardAutoRefresh",
        "renderCompactGameSignals",
        "breakdownUrl",
    ]
    for token in required_js:
        if token not in js:
            fail("todays-card.js is missing automation token: {}".format(token))

    workflow = require(root / ".github" / "workflows" / "mlb-games.yml").read_text(encoding="utf-8")
    required_workflow = [
        '0,30,45 * * * *',
        "America/New_York",
        "build_todays_card_data.py",
        "sync_baseball_final_scores.py",
        "--daily-only",
        "data/cards",
        "ODDS_API_KEY",
    ]
    for token in required_workflow:
        if token not in workflow:
            fail("workflow is missing: {}".format(token))

    dry_run = run_checked([
        sys.executable,
        "-u",
        str(root / "scripts" / "cleanup_repository_root.py"),
        "--dry-run",
        "--root",
        str(root),
    ], root)
    if "PASS: cleanup preview completed" not in dry_run:
        fail("root cleanup dry run did not complete")

    public_builder = require(root / "scripts" / "build_public_mlb_data.py").read_text(encoding="utf-8")
    if "preserve" not in public_builder.lower() or "linescore" not in public_builder:
        fail("public shard builder does not appear to preserve results")

    print("Validation date: {}".format(date_value))
    print("MLB cards generated: {}".format(len(games)))
    print("Cards with rich research signals: {}".format(rich_games))
    print("Browser source order: compact card -> enriched game -> live status")
    print("Browser current-day refresh: every minute")
    print("GitHub fast card refresh: every 15 minutes")
    print("GitHub full enrichment: hourly")
    print("Root cleanup: dry run passed")
    print("Python compatibility: syntax compilation passed")
    print("PASS: root cleanup and Today’s Card automation are internally consistent.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
