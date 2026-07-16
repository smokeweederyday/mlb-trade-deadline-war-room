#!/usr/bin/env python3
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
DRAFT_FILE = ROOT / "data/publish-play.json"
TODAYS_CARD_FILE = ROOT / "data/todays-card.json"
PLAYS_ARCHIVE_FILE = ROOT / "data/plays.json"

REQUIRED_FIELDS = {
    "id", "game_id", "date", "sport", "game",
    "away_team", "away_team_id", "home_team",
    "home_team_id", "play", "odds", "units",
    "rating", "handicapper", "analysis",
}

def load_json(path: Path, default: dict[str, Any]) -> dict[str, Any]:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as error:
        raise SystemExit(f"Could not read {path}: {error}")

def validate_play(play: dict[str, Any]) -> None:
    missing = sorted(
        field for field in REQUIRED_FIELDS
        if play.get(field) in {None, ""}
    )
    if missing:
        raise SystemExit(
            "Missing required field(s): " + ", ".join(missing)
        )

    try:
        units = float(play["units"])
    except (TypeError, ValueError):
        raise SystemExit("units must be a number.")

    if units <= 0:
        raise SystemExit("units must be greater than 0.")

    try:
        rating = int(play["rating"])
    except (TypeError, ValueError):
        raise SystemExit("rating must be a whole number.")

    if not 1 <= rating <= 5:
        raise SystemExit("rating must be between 1 and 5.")

def normalize_play(play: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(play)
    normalized["units"] = float(normalized["units"])
    normalized["rating"] = int(normalized["rating"])
    normalized["is_best_bet"] = bool(
        normalized.get("is_best_bet", False)
    )
    normalized.setdefault("status", "published")
    normalized.setdefault(
        "published_at",
        datetime.now(timezone.utc).isoformat(),
    )
    normalized.setdefault("result", "pending")
    normalized.setdefault("units_result", None)
    normalized.setdefault("final_score", None)
    normalized.setdefault("graded_at", None)
    normalized.setdefault("closing_odds", None)
    normalized.setdefault("closing_line", None)
    normalized.setdefault("evaluation_id", None)
    normalized.setdefault("tags", [])

    if not isinstance(normalized["tags"], list):
        normalized["tags"] = []

    return normalized

def upsert_play(
    plays: list[dict[str, Any]],
    incoming: dict[str, Any],
) -> list[dict[str, Any]]:
    output = []
    found = False

    for play in plays:
        if play.get("id") == incoming["id"]:
            merged = dict(play)
            merged.update(incoming)
            output.append(normalize_play(merged))
            found = True
        else:
            output.append(play)

    if not found:
        output.append(incoming)

    output.sort(
        key=lambda play: (
            play.get("date") or "",
            play.get("sport") or "",
            play.get("game_id") or "",
            play.get("id") or "",
        )
    )
    return output

def publish_to_todays_card(play: dict[str, Any]) -> None:
    card = load_json(
        TODAYS_CARD_FILE,
        {
            "schema_version": "1.2",
            "date": play["date"],
            "status": "draft",
            "updated_at": None,
            "notes": "",
            "plays": [],
        },
    )

    current_plays = card.get("plays", [])
    if not isinstance(current_plays, list):
        current_plays = []

    if card.get("date") != play["date"]:
        current_plays = []

    card["schema_version"] = "1.2"
    card["date"] = play["date"]
    card["status"] = "published"
    card["updated_at"] = datetime.now(timezone.utc).isoformat()
    card["plays"] = upsert_play(current_plays, play)

    TODAYS_CARD_FILE.write_text(
        json.dumps(card, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

def publish_to_archive(play: dict[str, Any]) -> None:
    archive = load_json(
        PLAYS_ARCHIVE_FILE,
        {
            "schema_version": "1.2",
            "updated_at": None,
            "plays": [],
        },
    )

    archived_plays = archive.get("plays", [])
    if not isinstance(archived_plays, list):
        archived_plays = []

    archive["schema_version"] = "1.2"
    archive["updated_at"] = datetime.now(timezone.utc).isoformat()
    archive["plays"] = upsert_play(archived_plays, play)

    PLAYS_ARCHIVE_FILE.write_text(
        json.dumps(archive, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

def main() -> None:
    draft_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DRAFT_FILE
    draft = load_json(draft_path, {})
    play = draft.get("play", draft)

    if not isinstance(play, dict):
        raise SystemExit("Draft must contain one play object.")

    validate_play(play)
    normalized = normalize_play(play)
    publish_to_todays_card(normalized)
    publish_to_archive(normalized)

    print(f"Published: {normalized['play']}")
    print(f"Game: {normalized['game_id']}")
    print("Updated data/todays-card.json")
    print("Updated data/plays.json")

if __name__ == "__main__":
    main()
