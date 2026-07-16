#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCRIPTS = Path(__file__).resolve().parent
ROOT = SCRIPTS.parent
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from mlb.schedule import parse_schedule
from update_games import (
    build_days_index,
    load_games_file,
    merge_schedule_game,
    migrate_existing_games,
)

GAMES_FILE = ROOT / "data" / "games.json"
DAYS_FILE = ROOT / "data" / "days.json"


def fetch_schedule_range(start_date: str, end_date: str) -> dict[str, Any]:
    query = urllib.parse.urlencode({
        "sportId": 1,
        "startDate": start_date,
        "endDate": end_date,
        "hydrate": "probablePitcher,venue",
        "gameType": "R",
    })
    request = urllib.request.Request(
        f"https://statsapi.mlb.com/api/v1/schedule?{query}",
        headers={"User-Agent": "Boring Bets/1.0"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read())


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Merge the complete MLB regular-season schedule into games.json without deleting enriched data."
    )
    parser.add_argument("--season", type=int, default=2026)
    parser.add_argument("--start")
    parser.add_argument("--end")
    args = parser.parse_args()

    start_date = args.start or f"{args.season}-03-25"
    end_date = args.end or f"{args.season}-10-01"

    raw = fetch_schedule_range(start_date, end_date)
    schedule_games = parse_schedule(raw)
    if not schedule_games:
        raise SystemExit("No MLB regular-season games were returned.")

    current = load_games_file()
    migrated = migrate_existing_games(current.get("games", []))
    existing = {game.get("id"): game for game in migrated if game.get("id")}

    merged_by_id = dict(existing)
    added = 0
    updated = 0
    for schedule_game in schedule_games:
        game_id = schedule_game["id"]
        if game_id in merged_by_id:
            updated += 1
        else:
            added += 1
        merged_by_id[game_id] = merge_schedule_game(
            merged_by_id.get(game_id), schedule_game
        )

    games = list(merged_by_id.values())
    games.sort(key=lambda game: (
        game.get("date") or "",
        game.get("game_time") or "",
        game.get("id") or "",
    ))

    current["schema_version"] = "3.9"
    current["schedule_sync"] = {
        "season": args.season,
        "start_date": start_date,
        "end_date": end_date,
        "synced_at": datetime.now(timezone.utc).isoformat(),
        "regular_season_games": len(schedule_games),
    }
    current["games"] = games

    GAMES_FILE.write_text(json.dumps(current, indent=2) + "\n", encoding="utf-8")
    DAYS_FILE.write_text(
        json.dumps({
            "schema_version": "1.1",
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "days": build_days_index(games),
        }, indent=2) + "\n",
        encoding="utf-8",
    )

    unique_dates = len({game.get("date") for game in schedule_games if game.get("date")})
    print(f"Fetched {len(schedule_games)} MLB regular-season games across {unique_dates} dates.")
    print(f"Added {added} new game shells; refreshed {updated} existing games.")
    print(f"games.json now contains {len(games)} total games across all retained dates.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
