#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

MLB_API_BASE = "https://statsapi.mlb.com/api/v1"


def get_json(url: str) -> dict:
    request = urllib.request.Request(url, headers={"User-Agent": "Boring Bets/1.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read())


def inspect_mode(pitcher_id: int, season: int, stats_mode: str, sit_code: str) -> None:
    params = {
        "stats": stats_mode,
        "group": "pitching",
        "season": season,
        "sitCodes": sit_code,
    }
    url = f"{MLB_API_BASE}/people/{pitcher_id}/stats?{urllib.parse.urlencode(params)}"
    print("\n" + "=" * 72)
    print(f"MODE={stats_mode} SIT={sit_code}")
    print(url)
    try:
        raw = get_json(url)
    except Exception as error:
        print("REQUEST ERROR:", error)
        return

    groups = raw.get("stats", [])
    print("groups:", len(groups))
    for group_index, group in enumerate(groups):
        splits = group.get("splits", [])
        print(f" group {group_index}: type={group.get('type')} splits={len(splits)}")
        for split_index, split in enumerate(splits[:5]):
            stat = split.get("stat") or {}
            print(f"  split {split_index} keys:", sorted(stat.keys()))
            print(
                "  values:",
                {
                    "era": stat.get("era"),
                    "whip": stat.get("whip"),
                    "avg": stat.get("avg") or stat.get("avgAgainst"),
                    "inningsPitched": stat.get("inningsPitched"),
                    "earnedRuns": stat.get("earnedRuns"),
                    "strikeOuts": stat.get("strikeOuts"),
                    "baseOnBalls": stat.get("baseOnBalls"),
                    "hits": stat.get("hits"),
                },
            )
            if split_index == 0:
                print("  first split metadata:", {k: v for k, v in split.items() if k != "stat"})


def main() -> None:
    pitcher_id = int(sys.argv[1]) if len(sys.argv) > 1 else 605400  # Aaron Nola
    season = int(sys.argv[2]) if len(sys.argv) > 2 else 2026
    for mode in ("statSplits", "season", "byDateRange"):
        for sit in ("vl", "vr"):
            inspect_mode(pitcher_id, season, mode, sit)


if __name__ == "__main__":
    main()
