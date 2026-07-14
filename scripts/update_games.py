#!/usr/bin/env python3

from __future__ import annotations

from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any
import json
import sys

from mlb.schedule import (
    fetch_schedule,
    parse_schedule,
)


ROOT = Path(__file__).resolve().parents[1]
GAMES_FILE = ROOT / "data/games.json"


def load_games_file() -> dict[str, Any]:
    if not GAMES_FILE.exists():
        return {
            "schema_version": "3.0",
            "default_controls": {
                "timeframe": "last_30",
                "location": "all",
            },
            "games": [],
        }

    return json.loads(
        GAMES_FILE.read_text(
            encoding="utf-8"
        )
    )


def create_default_workflow() -> dict[str, Any]:
    """
    Stable lifecycle states for one game.

    Detailed data remains inside pitchers, lineups,
    weather, market and other game modules.
    """

    return {
        "research_state": "pending",
        "publication_state": "unpublished",
        "grading_state": "not_applicable",
        "archive_state": "active",
        "official_play_ids": [],
        "best_bet_id": None,
        "published_at": None,
        "graded_at": None,
        "archived_at": None,
    }


def normalize_workflow(
    workflow: dict[str, Any] | None,
) -> dict[str, Any]:
    """
    Fill missing workflow fields without overwriting
    existing lifecycle data.
    """

    normalized = create_default_workflow()
    normalized.update(workflow or {})

    if not isinstance(
        normalized.get("official_play_ids"),
        list,
    ):
        normalized["official_play_ids"] = []

    return normalized


def merge_schedule_game(
    existing: dict[str, Any] | None,
    schedule_game: dict[str, Any],
) -> dict[str, Any]:
    """
    Update schedule-controlled fields while preserving
    existing research, statistics, notes and editorial data.
    """

    game = dict(existing or {})

    game["id"] = schedule_game["id"]
    game["mlb_game_pk"] = schedule_game.get(
        "mlb_game_pk"
    )
    game["date"] = schedule_game.get(
        "date"
    )
    game["game_time"] = schedule_game.get(
        "game_time"
    )
    game["sport"] = "MLB"
    game["status"] = schedule_game.get(
        "status",
        "scheduled",
    )
    game["venue"] = schedule_game.get(
        "venue",
        {},
    )
    game["away_team"] = schedule_game.get(
        "away_team",
        {},
    )
    game["home_team"] = schedule_game.get(
        "home_team",
        {},
    )

    game.setdefault(
        "controls",
        {
            "default_timeframe": "last_30",
            "default_location": "all",
        },
    )

    existing_pitchers = game.get(
        "pitchers",
        {},
    )

    game["pitchers"] = {
        "away": merge_pitcher(
            existing_pitchers.get("away"),
            schedule_game
            .get("pitchers", {})
            .get("away", {}),
        ),
        "home": merge_pitcher(
            existing_pitchers.get("home"),
            schedule_game
            .get("pitchers", {})
            .get("home", {}),
        ),
    }

    game["workflow"] = normalize_workflow(
        game.get("workflow")
    )

    game.setdefault("offense", {})
    game.setdefault("lineups", {})
    game.setdefault(
        "pitcher_vs_lineup",
        game.get(
            "pitcher_vs_projected_lineup",
            {},
        ),
    )
    game.setdefault("bullpens", {})
    game.setdefault("weather", {})
    game.setdefault("market", {})
    game.setdefault("injuries", [])
    game.setdefault("notes", "")

    game["last_updated"] = datetime.now(
        timezone.utc
    ).isoformat()

    return game


def merge_pitcher(
    existing: dict[str, Any] | None,
    incoming: dict[str, Any],
) -> dict[str, Any]:
    pitcher = dict(existing or {})

    incoming_id = incoming.get("id")
    existing_id = pitcher.get("id")

    if incoming_id and incoming_id != existing_id:
        pitcher = {}

    pitcher["id"] = incoming_id
    pitcher["name"] = incoming.get(
        "name",
        "Starter TBD",
    )
    pitcher["status"] = incoming.get(
        "status",
        "unknown",
    )

    pitcher.setdefault("age", None)
    pitcher.setdefault("throws", None)
    pitcher.setdefault("profile_url", "#")
    pitcher.setdefault(
        "stats",
        {
            "last_7": {
                "all": {},
                "home": {},
                "away": {},
            },
            "last_30": {
                "all": {},
                "home": {},
                "away": {},
            },
            "season": {
                "all": {},
                "home": {},
                "away": {},
            },
            "vs_lhh": {},
            "vs_rhh": {},
        },
    )

    return pitcher


def migrate_existing_games(
    games: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Add current schema defaults to every stored game
    while preserving all existing research data.
    """

    migrated = []

    for stored_game in games:
        game = dict(stored_game)

        game["workflow"] = normalize_workflow(
            game.get("workflow")
        )

        game.setdefault("offense", {})
        game.setdefault("lineups", {})
        game.setdefault(
            "pitcher_vs_lineup",
            game.get(
                "pitcher_vs_projected_lineup",
                {},
            ),
        )
        game.setdefault("bullpens", {})
        game.setdefault("weather", {})
        game.setdefault("market", {})
        game.setdefault("injuries", [])
        game.setdefault("notes", "")

        migrated.append(game)

    return migrated


def main() -> None:
    target_date = (
        sys.argv[1]
        if len(sys.argv) > 1
        else date.today().isoformat()
    )

    current = load_games_file()

    current["games"] = migrate_existing_games(
        current.get("games", [])
    )

    existing_games = {
        game["id"]: game
        for game in current.get(
            "games",
            [],
        )
        if game.get("id")
    }

    raw_schedule = fetch_schedule(
        target_date
    )

    schedule_games = parse_schedule(
        raw_schedule
    )

    merged_games = []

    for schedule_game in schedule_games:
        existing = existing_games.get(
            schedule_game["id"]
        )

        merged_games.append(
            merge_schedule_game(
                existing,
                schedule_game,
            )
        )

    other_dates = [
        game
        for game in current.get(
            "games",
            [],
        )
        if game.get("date") != target_date
    ]

    current["games"] = (
        other_dates + merged_games
    )

    current["games"].sort(
        key=lambda game: (
            game.get("date", ""),
            game.get("game_time", ""),
        )
    )

    current["schema_version"] = "3.0"

    GAMES_FILE.write_text(
        json.dumps(
            current,
            indent=2,
        ) + "\n",
        encoding="utf-8",
    )

    print(
        f"Updated {len(merged_games)} MLB game(s) "
        f"for {target_date}."
    )

    print(
        f"games.json now contains "
        f"{len(current['games'])} total game(s)."
    )


if __name__ == "__main__":
    main()