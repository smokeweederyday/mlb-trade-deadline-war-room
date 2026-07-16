#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

SCRIPTS_DIR = Path(__file__).resolve().parent
ROOT = SCRIPTS_DIR.parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import update_games as ug
from mlb.schedule import fetch_schedule, parse_schedule

GAMES_FILE = ROOT / "data" / "games.json"
PROGRESS_DIR = ROOT / "data" / "cache"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fast, resumable historical MLB enrichment without live-only modules."
    )
    parser.add_argument("--season", type=int, default=date.today().year)
    parser.add_argument("--start-date", help="YYYY-MM-DD; defaults to first loaded season date")
    parser.add_argument("--end-date", help="YYYY-MM-DD; defaults to today or final loaded date")
    parser.add_argument("--batch-size", type=int, default=7, help="Write after this many dates")
    parser.add_argument("--workers", type=int, default=10, help="MLB request worker limit")
    parser.add_argument("--max-dates", type=int, default=None, help="Test only this many dates")
    parser.add_argument("--force", action="store_true", help="Reprocess completed dates")
    parser.add_argument("--include-future", action="store_true", help="Enrich dates after today")
    return parser.parse_args()


def load_games() -> dict[str, Any]:
    return ug.load_games_file()


def progress_path(season: int) -> Path:
    PROGRESS_DIR.mkdir(parents=True, exist_ok=True)
    return PROGRESS_DIR / f"mlb-fast-backfill-progress-{season}.json"


def load_progress(season: int) -> dict[str, Any]:
    path = progress_path(season)
    if not path.exists():
        return {"season": season, "completed_dates": [], "failed_dates": {}, "updated_at": None}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"season": season, "completed_dates": [], "failed_dates": {}, "updated_at": None}


def save_progress(progress: dict[str, Any]) -> None:
    progress["updated_at"] = datetime.now(timezone.utc).isoformat()
    progress_path(int(progress["season"])).write_text(
        json.dumps(progress, indent=2) + "\n", encoding="utf-8"
    )


def core_offense_present(game: dict[str, Any]) -> bool:
    for side in ("away", "home"):
        block = game.get("offense", {}).get(side, {}).get("stats", {}).get("season", {}).get("all", {})
        if block.get("AVG", {}).get("overall") is None:
            return False
    return True


def core_pitcher_present(game: dict[str, Any]) -> bool:
    known = 0
    complete = 0
    for side in ("away", "home"):
        pitcher = game.get("pitchers", {}).get(side, {})
        if pitcher.get("id"):
            known += 1
            if pitcher.get("stats", {}).get("season", {}).get("all", {}).get("whip") is not None:
                complete += 1
    return known == 0 or known == complete


def date_is_complete(games: list[dict[str, Any]]) -> bool:
    return bool(games) and all(core_offense_present(g) and core_pitcher_present(g) for g in games)


def candidate_dates(current: dict[str, Any], args: argparse.Namespace) -> list[str]:
    today = date.today().isoformat()
    dates = sorted({
        str(game.get("date"))
        for game in current.get("games", [])
        if str(game.get("date", "")).startswith(f"{args.season}-")
    })
    if args.start_date:
        dates = [d for d in dates if d >= args.start_date]
    if args.end_date:
        dates = [d for d in dates if d <= args.end_date]
    elif not args.include_future:
        dates = [d for d in dates if d <= today]
    if args.max_dates is not None:
        dates = dates[: max(0, args.max_dates)]
    return dates


def write_games(current: dict[str, Any]) -> None:
    current["games"].sort(key=lambda game: (
        game.get("date") or "", game.get("game_time") or "", game.get("id") or ""
    ))
    current["schema_version"] = "3.8"
    GAMES_FILE.write_text(json.dumps(current, indent=2) + "\n", encoding="utf-8")


def enrich_one_date(current: dict[str, Any], target_date: str) -> tuple[dict[str, Any], int]:
    existing_games = {
        game["id"]: game for game in current.get("games", []) if game.get("id")
    }
    raw_schedule = fetch_schedule(target_date)
    schedule_games = parse_schedule(raw_schedule)
    merged = [
        ug.merge_schedule_game(existing_games.get(item["id"]), item)
        for item in schedule_games
    ]

    if not merged:
        return current, 0

    # Historical essentials only. No lineups, weather, markets, or live odds.
    merged = ug.enrich_probable_pitchers(merged, target_date)
    pitcher_rank_cache = ug.build_league_pitcher_cache(target_date)
    merged = ug.apply_league_pitcher_cache(merged, pitcher_rank_cache)
    merged = ug.enrich_team_offenses(merged, target_date)
    merged = ug.enrich_bullpens(merged, target_date)
    merged = ug.enrich_intelligence(merged)

    # Context is cheap once the underlying historical modules are attached.
    merged = ug.enrich_context(merged)

    other_dates = [g for g in current.get("games", []) if g.get("date") != target_date]
    current["games"] = other_dates + merged
    return current, len(merged)


def main() -> int:
    args = parse_args()
    os.environ["BORING_BETS_MLB_FETCH_WORKERS"] = str(max(2, min(args.workers, 16)))

    current = load_games()
    current["games"] = ug.migrate_existing_games(current.get("games", []))
    progress = load_progress(args.season)
    completed = set(progress.get("completed_dates", []))
    failed = dict(progress.get("failed_dates", {}))
    dates = candidate_dates(current, args)

    print(f"Fast historical backfill: {len(dates)} candidate date(s).")
    print("Skipping live lineups, weather, and market requests.")

    processed_since_write = 0
    total_games = 0
    started = time.time()

    for index, target_date in enumerate(dates, start=1):
        date_games = [g for g in current.get("games", []) if g.get("date") == target_date]
        if not args.force and (target_date in completed or date_is_complete(date_games)):
            print(f"[{index}/{len(dates)}] {target_date}: already complete; skipped.")
            completed.add(target_date)
            continue

        print(f"[{index}/{len(dates)}] {target_date}: enriching historical core data...")
        try:
            current, count = enrich_one_date(current, target_date)
            total_games += count
            completed.add(target_date)
            failed.pop(target_date, None)
            processed_since_write += 1
            print(f"  enriched {count} game(s).")
        except Exception as error:
            failed[target_date] = str(error)
            print(f"  FAILED: {error}")

        if processed_since_write >= max(1, args.batch_size):
            write_games(current)
            progress["completed_dates"] = sorted(completed)
            progress["failed_dates"] = failed
            save_progress(progress)
            print(f"  checkpoint written after {processed_since_write} date(s).")
            processed_since_write = 0

    write_games(current)
    progress["completed_dates"] = sorted(completed)
    progress["failed_dates"] = failed
    save_progress(progress)

    elapsed = time.time() - started
    print("\nFast backfill finished.")
    print(f"Games enriched this run: {total_games}")
    print(f"Completed dates recorded: {len(completed)}")
    print(f"Failed dates remaining: {len(failed)}")
    print(f"Elapsed: {elapsed / 60:.1f} minutes")
    print(f"Progress: {progress_path(args.season)}")
    return 0 if not failed else 2


if __name__ == "__main__":
    raise SystemExit(main())
