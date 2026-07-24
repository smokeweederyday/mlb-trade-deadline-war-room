#!/usr/bin/env python3
"""Refresh current MLB offense data across every remaining scheduled game."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
GAMES_DIRECTORY = ROOT / "data" / "games"
EASTERN = ZoneInfo("America/New_York")

sys.path.insert(0, str(SCRIPTS))

from mlb.offense import (  # noqa: E402
    apply_league_offense_cache,
    build_league_offense_cache,
    build_team_offense_snapshot,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Build one current MLB offense snapshot and apply it to all "
            "remaining per-date game files."
        )
    )
    parser.add_argument(
        "--date",
        default=datetime.now(EASTERN).date().isoformat(),
        help="Current operations date in YYYY-MM-DD format.",
    )
    parser.add_argument(
        "--skip-card-data",
        action="store_true",
        help="Do not rebuild lightweight Today’s Card files.",
    )
    return parser.parse_args()


def read_document(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object.")
    return value


def write_document(path: Path, value: dict[str, Any]) -> None:
    path.write_text(
        json.dumps(value, indent=2) + "\n",
        encoding="utf-8",
    )


def nested_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def first_value(*values: Any) -> Any:
    for value in values:
        if value not in (None, ""):
            return value
    return None


def team_id_for(
    game: dict[str, Any],
    side: str,
    existing: dict[str, Any],
) -> int | None:
    team_block = nested_dict(game.get(f"{side}_team"))
    teams_block = nested_dict(game.get("teams"))
    generic_team = nested_dict(teams_block.get(side))
    side_block = nested_dict(game.get(side))

    value = first_value(
        existing.get("team_id"),
        game.get(f"{side}_team_id"),
        team_block.get("team_id"),
        team_block.get("id"),
        generic_team.get("team_id"),
        generic_team.get("id"),
        side_block.get("team_id"),
        side_block.get("id"),
    )

    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def opponent_throws_for(
    game: dict[str, Any],
    batting_side: str,
    existing: dict[str, Any],
) -> str | None:
    pitching_side = "home" if batting_side == "away" else "away"

    pitchers = nested_dict(game.get("pitchers"))
    pitcher = nested_dict(pitchers.get(pitching_side))

    probable_pitchers = nested_dict(game.get("probable_pitchers"))
    probable = nested_dict(probable_pitchers.get(pitching_side))

    value = first_value(
        pitcher.get("throws"),
        pitcher.get("throwing_hand"),
        pitcher.get("hand"),
        probable.get("throws"),
        probable.get("throwing_hand"),
        probable.get("hand"),
        existing.get("opponent_throws"),
    )

    text = str(value or "").strip().upper()
    return text if text in {"L", "R"} else None


def remaining_game_files(first_date: str) -> list[Path]:
    paths: list[Path] = []

    for path in sorted(GAMES_DIRECTORY.glob("????-??-??.json")):
        if path.stem >= first_date:
            paths.append(path)

    return paths


def metric_values(snapshot: dict[str, Any], metric: str) -> list[float]:
    values: list[float] = []
    stats = nested_dict(snapshot.get("stats"))

    for timeframe in ("season", "last_30", "last_7"):
        locations = nested_dict(stats.get(timeframe))

        for location in ("all", "home", "away"):
            metric_row = nested_dict(
                nested_dict(locations.get(location)).get(metric)
            )

            for key in ("overall", "vs_hand"):
                value = metric_row.get(key)

                if isinstance(value, (int, float)):
                    values.append(float(value))

    return values


def rebuild_card_data(dates: list[str]) -> None:
    if not dates:
        return

    command = [
        sys.executable,
        "-u",
        str(SCRIPTS / "build_todays_card_data.py"),
    ]

    for target_date in dates:
        command.extend(["--date", target_date])

    print(
        "Rebuilding Today’s Card offense summaries for "
        f"{len(dates)} dates.",
        flush=True,
    )

    completed = subprocess.run(
        command,
        cwd=ROOT,
        check=False,
    )

    if completed.returncode != 0:
        raise SystemExit(
            "Today’s Card data rebuild failed with exit code "
            f"{completed.returncode}."
        )


def main() -> int:
    args = parse_args()
    first_date = args.date

    print(
        "Building current MLB offense matrix with latest completed data.",
        flush=True,
    )

    # Force one fresh provider fetch. Every future game then receives this
    # same matrix instead of pretending future games have already occurred.
    os.environ["BORING_BETS_REBUILD_RANK_CACHE"] = "1"
    league_cache = build_league_offense_cache(first_date)
    os.environ.pop("BORING_BETS_REBUILD_RANK_CACHE", None)

    paths = remaining_game_files(first_date)

    if not paths:
        print("No remaining MLB date files were found.", flush=True)
        return 0

    games_updated = 0
    teams_updated = 0
    iso_populated = 0
    wrc_populated = 0
    refreshed_dates: list[str] = []

    for path in paths:
        document = read_document(path)
        games = document.get("games")

        if not isinstance(games, list):
            continue

        file_changed = False

        for game in games:
            if not isinstance(game, dict):
                continue

            game_date = str(game.get("date") or path.stem)
            offense = nested_dict(game.get("offense"))
            updated_sides = 0

            for side in ("away", "home"):
                existing = nested_dict(offense.get(side))
                team_id = team_id_for(game, side, existing)

                if team_id is None:
                    continue

                opponent_throws = opponent_throws_for(
                    game,
                    side,
                    existing,
                )

                snapshot = build_team_offense_snapshot(
                    team_id,
                    opponent_throws,
                    first_date,
                )

                # Preserve harmless metadata that another module may have added.
                for key, value in existing.items():
                    if key not in snapshot:
                        snapshot[key] = value

                refreshed = apply_league_offense_cache(
                    snapshot,
                    league_cache,
                )

                offense[side] = refreshed
                updated_sides += 1
                teams_updated += 1

                if metric_values(refreshed, "ISO"):
                    iso_populated += 1

                if metric_values(refreshed, "wRC+"):
                    wrc_populated += 1

            if updated_sides:
                game["offense"] = offense
                games_updated += 1
                file_changed = True

        if file_changed:
            document["games"] = games
            write_document(path, document)
            refreshed_dates.append(path.stem)

            print(
                f"Updated offense: {path.name}",
                flush=True,
            )

    if not args.skip_card_data:
        rebuild_card_data(refreshed_dates)

    print()
    print("Future MLB offense refresh complete.")
    print(f"Date files: {len(refreshed_dates)}")
    print(f"Games updated: {games_updated}")
    print(f"Team offense modules updated: {teams_updated}")
    print(f"Team modules with ISO: {iso_populated}")
    print(f"Team modules with wRC+: {wrc_populated}")

    if teams_updated and (
        iso_populated < teams_updated
        or wrc_populated < teams_updated
    ):
        print(
            "WARNING: Some team modules remain incomplete. "
            "Review provider warnings above.",
            flush=True,
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
