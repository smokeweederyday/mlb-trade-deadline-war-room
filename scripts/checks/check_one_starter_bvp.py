#!/usr/bin/env python3

from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str((ROOT / "scripts").resolve()))

from mlb.batter_vs_pitcher import build_bvp_for_game  # noqa: E402


game = {
    "id": "one-starter-test",
    "pitchers": {
        "away": {
            "id": 657277,
            "name": "Logan Webb",
        },
        "home": {
            "id": None,
            "name": "Starter TBD",
        },
    },
    "lineups": {
        "away": {
            "players": [
                {
                    "id": 592450,
                    "name": "Aaron Judge",
                    "order": 1,
                },
            ],
        },
        "home": {
            "players": [
                {
                    "id": 596019,
                    "name": "Francisco Lindor",
                    "order": 1,
                },
            ],
        },
    },
}

result = build_bvp_for_game(game)

away_rows = (
    result.get("away_pitcher", {})
    .get("batters", {})
)

home_rows = (
    result.get("home_pitcher", {})
    .get("batters", {})
)

print("Away starter rows:", len(away_rows))
print("Home starter rows:", len(home_rows))

if len(away_rows) != 1:
    raise SystemExit(
        "FAIL: known away starter did not populate."
    )

if home_rows:
    raise SystemExit(
        "FAIL: unknown home starter unexpectedly populated."
    )

print(
    "PASS: one known starter populates independently."
)
