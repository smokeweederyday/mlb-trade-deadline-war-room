#!/usr/bin/env python3
from __future__ import annotations

import json
from collections import Counter
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
raw = json.loads((ROOT / "data" / "games.json").read_text(encoding="utf-8"))
games = raw.get("games", []) if isinstance(raw, dict) else raw
season_games = [game for game in games if str(game.get("date", "")).startswith("2026-")]
ids = [game.get("id") for game in season_games]
duplicates = [game_id for game_id, count in Counter(ids).items() if game_id and count > 1]
regular = [game for game in season_games if "-" in str(game.get("id", ""))]

past_or_today = [game for game in regular if (game.get("date") or "9999") <= date.today().isoformat()]
offense_ready = sum(
    1 for game in past_or_today
    if (game.get("offense") or {}).get("away") and (game.get("offense") or {}).get("home")
)
probable_sides = 0
pitcher_sides_ready = 0
for game in past_or_today:
    for side in ("away", "home"):
        pitcher = (game.get("pitchers") or {}).get(side) or {}
        if pitcher.get("id"):
            probable_sides += 1
            if pitcher.get("stats"):
                pitcher_sides_ready += 1

print(f"2026 games in website: {len(regular)}")
print(f"Unique schedule dates: {len({g.get('date') for g in regular})}")
print(f"Duplicate game IDs: {len(duplicates)}")
print(f"Past/current games with both offense charts: {offense_ready}/{len(past_or_today)}")
print(f"Identified pitcher sides with pitcher data: {pitcher_sides_ready}/{probable_sides}")

if len(regular) < 2400:
    raise SystemExit("FAIL: fewer than 2,400 regular-season game records are present.")
if duplicates:
    raise SystemExit("FAIL: duplicate schedule game IDs found.")
print("PASS: full-season schedule is loaded; coverage totals are shown above.")
