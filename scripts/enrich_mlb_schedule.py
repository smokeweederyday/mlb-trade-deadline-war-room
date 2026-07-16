#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GAMES_FILE = ROOT / "data" / "games.json"
CACHE_DIR = ROOT / "data" / "cache"


def load_games() -> list[dict]:
    raw = json.loads(GAMES_FILE.read_text(encoding="utf-8"))
    return raw.get("games", []) if isinstance(raw, dict) else raw


def date_needs_core_data(games: list[dict], target_date: str) -> bool:
    for game in games:
        if game.get("date") != target_date:
            continue
        offense = game.get("offense") or {}
        pitchers = game.get("pitchers") or {}
        offense_ready = bool(offense.get("away")) and bool(offense.get("home"))
        probable_ids = [
            (pitchers.get("away") or {}).get("id"),
            (pitchers.get("home") or {}).get("id"),
        ]
        pitcher_ready = True
        for side, pitcher_id in zip(("away", "home"), probable_ids):
            if pitcher_id and not (pitchers.get(side) or {}).get("stats"):
                pitcher_ready = False
        if not offense_ready or not pitcher_ready:
            return True
    return False


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Resumably enrich scheduled MLB dates through the existing Boring Bets updater."
    )
    parser.add_argument("--season", type=int, default=2026)
    parser.add_argument("--start")
    parser.add_argument("--end")
    parser.add_argument("--max-dates", type=int, default=0,
                        help="0 processes every eligible date; use a small number for a test batch.")
    parser.add_argument("--include-future", action="store_true",
                        help="Attempt future dates. Future probable pitchers and lineups may still be unavailable.")
    parser.add_argument("--force", action="store_true",
                        help="Re-run dates even when core pitcher/offense data already exists.")
    args = parser.parse_args()

    games = load_games()
    today = date.today().isoformat()
    start = args.start or f"{args.season}-03-25"
    end = args.end or (f"{args.season}-10-01" if args.include_future else today)

    dates = sorted({
        game.get("date") for game in games
        if game.get("date") and start <= game["date"] <= end
    })
    if not args.include_future:
        dates = [item for item in dates if item <= today]
    if not args.force:
        dates = [item for item in dates if date_needs_core_data(games, item)]
    if args.max_dates > 0:
        dates = dates[:args.max_dates]

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    progress_file = CACHE_DIR / f"mlb-enrichment-progress-{args.season}.json"
    completed: list[str] = []
    failed: dict[str, str] = {}
    if progress_file.exists():
        try:
            prior = json.loads(progress_file.read_text(encoding="utf-8"))
            completed = list(prior.get("completed", []))
            failed = dict(prior.get("failed", {}))
        except Exception:
            pass

    print(f"Eligible dates: {len(dates)}")
    for index, target_date in enumerate(dates, start=1):
        print(f"\n[{index}/{len(dates)}] Enriching {target_date}")
        command = [sys.executable, "-u", str(ROOT / "scripts" / "update_games.py"), target_date]
        result = subprocess.run(command, cwd=ROOT)
        if result.returncode == 0:
            if target_date not in completed:
                completed.append(target_date)
            failed.pop(target_date, None)
        else:
            failed[target_date] = f"update_games.py exited {result.returncode}"

        progress_file.write_text(json.dumps({
            "season": args.season,
            "completed": sorted(completed),
            "failed": failed,
        }, indent=2) + "\n", encoding="utf-8")

    print(f"\nCompleted dates recorded: {len(completed)}")
    print(f"Failed dates recorded: {len(failed)}")
    return 1 if failed and not completed else 0


if __name__ == "__main__":
    raise SystemExit(main())
