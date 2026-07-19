#!/usr/bin/env python3
"""Split the enriched MLB season document into browser-friendly date shards.

Official result fields already synchronized into per-date files are preserved so
rebuilding the research data cannot erase final scores or live status.
"""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

ROOT = Path(__file__).resolve().parents[1]
GAMES_FILE = ROOT / "data" / "games.json"
DATE_DIR = ROOT / "data" / "games"
LIVE_DIR = ROOT / "data" / "live-games"
INDEX_FILE = ROOT / "data" / "games-index.json"
META_FILE = ROOT / "data" / "games-meta.json"
RESULT_FIELDS = (
    "status",
    "abstract_status",
    "score",
    "linescore",
    "decisions",
)


def write_compact(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )


def read_optional(path: Path) -> Optional[Dict[str, Any]]:
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def team_summary(team: Any) -> Dict[str, Any]:
    team = team if isinstance(team, dict) else {}
    return {
        key: team.get(key)
        for key in ("team_id", "abbr", "name")
        if team.get(key) is not None
    }


def venue_summary(venue: Any) -> Dict[str, Any]:
    venue = venue if isinstance(venue, dict) else {}
    return {
        key: venue.get(key)
        for key in ("id", "name", "city", "state", "timezone", "latitude", "longitude")
        if venue.get(key) is not None
    }


def index_game(game: Dict[str, Any]) -> Dict[str, Any]:
    result = {
        key: game.get(key)
        for key in (
            "id",
            "date",
            "game_time",
            "sport",
            "status",
            "mlb_game_pk",
            "game_number",
            "doubleheader",
            "score",
        )
        if game.get(key) is not None
    }
    result["away_team"] = team_summary(game.get("away_team"))
    result["home_team"] = team_summary(game.get("home_team"))
    result["venue"] = venue_summary(game.get("venue"))
    return result


def sort_key(game: Dict[str, Any]) -> Tuple[str, str, str]:
    return (
        str(game.get("date") or ""),
        str(game.get("game_time") or ""),
        str(game.get("id") or ""),
    )


def identity(game: Dict[str, Any]) -> str:
    game_pk = game.get("mlb_game_pk") or game.get("game_pk") or game.get("gamePk")
    if game_pk is not None:
        return f"pk:{game_pk}"
    return f"id:{game.get('id') or ''}"


def overlay_results(target: Dict[str, Any], source: Dict[str, Any]) -> None:
    for key in RESULT_FIELDS:
        value = source.get(key)
        if value is not None:
            target[key] = value

    # Game-time changes and official team/venue corrections are safe to preserve too.
    if source.get("game_time") is not None:
        target["game_time"] = source["game_time"]

    for side in ("away_team", "home_team"):
        incoming = source.get(side)
        if not isinstance(incoming, dict):
            continue
        current = target.get(side) if isinstance(target.get(side), dict) else {}
        for key in ("team_id", "id", "abbr", "abbreviation", "name", "record"):
            if incoming.get(key) is not None:
                current[key] = incoming[key]
        target[side] = current

    incoming_venue = source.get("venue")
    if isinstance(incoming_venue, dict):
        venue = target.get("venue") if isinstance(target.get("venue"), dict) else {}
        venue.update({key: value for key, value in incoming_venue.items() if value is not None})
        target["venue"] = venue


def preserve_date_results(game_date: str, games: List[Dict[str, Any]]) -> int:
    overlays: Dict[str, Dict[str, Any]] = {}
    for path in (DATE_DIR / f"{game_date}.json", LIVE_DIR / f"{game_date}.json"):
        document = read_optional(path)
        for game in ((document or {}).get("games") or []):
            if isinstance(game, dict):
                overlays[identity(game)] = game

    preserved = 0
    for game in games:
        overlay = overlays.get(identity(game))
        if overlay is None:
            continue
        before = {key: game.get(key) for key in RESULT_FIELDS}
        overlay_results(game, overlay)
        after = {key: game.get(key) for key in RESULT_FIELDS}
        if before != after:
            preserved += 1
    return preserved


def main() -> None:
    payload = json.loads(GAMES_FILE.read_text(encoding="utf-8"))
    games = payload.get("games", [])
    if not isinstance(games, list):
        raise SystemExit("data/games.json does not contain a games list.")

    by_date: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for raw_game in games:
        if not isinstance(raw_game, dict):
            continue
        game = dict(raw_game)
        game_date = game.get("date")
        if game_date:
            by_date[str(game_date)].append(game)

    DATE_DIR.mkdir(parents=True, exist_ok=True)
    expected_files: Set[Path] = set()
    preserved_results = 0

    for game_date, date_games in sorted(by_date.items()):
        preserved_results += preserve_date_results(game_date, date_games)
        date_games.sort(key=sort_key)
        output_path = DATE_DIR / f"{game_date}.json"
        expected_files.add(output_path)
        write_compact(
            output_path,
            {
                "schema_version": payload.get("schema_version"),
                "updated_at": payload.get("updated_at"),
                "date": game_date,
                "default_controls": payload.get("default_controls", {}),
                "games": date_games,
            },
        )

    removed = 0
    for existing_path in DATE_DIR.glob("*.json"):
        if existing_path not in expected_files:
            existing_path.unlink()
            removed += 1

    metadata = {key: value for key, value in payload.items() if key != "games"}
    write_compact(META_FILE, metadata)

    indexed_games = [
        index_game(game)
        for game in sorted(
            [game for date_games in by_date.values() for game in date_games],
            key=sort_key,
        )
    ]
    write_compact(
        INDEX_FILE,
        {
            "schema_version": payload.get("schema_version"),
            "updated_at": payload.get("updated_at"),
            "games": indexed_games,
        },
    )

    date_size = sum(path.stat().st_size for path in expected_files)
    print(f"Wrote {len(expected_files)} date files.")
    print(f"Wrote {len(indexed_games)} games to games-index.json.")
    print("Date files total:", f"{date_size / 1024 / 1024:.2f} MB")
    print("Metadata size:", f"{META_FILE.stat().st_size / 1024:.2f} KB")
    print("Index size:", f"{INDEX_FILE.stat().st_size / 1024 / 1024:.2f} MB")
    print(f"Preserved official result fields for {preserved_results} games.")
    print(f"Removed {removed} stale date files.")


if __name__ == "__main__":
    main()
