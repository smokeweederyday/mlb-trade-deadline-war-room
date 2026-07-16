#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
payload = json.loads((ROOT / "data" / "games.json").read_text(encoding="utf-8"))
games = payload.get("games", payload) if isinstance(payload, dict) else payload

checked = 0
failures: list[str] = []
for game in games:
    for side in ("away", "home"):
        pitcher = (game.get("pitchers") or {}).get(side) or {}
        if not pitcher.get("id"):
            continue
        stats = pitcher.get("stats") or {}
        season_all = ((stats.get("season") or {}).get("all") or {})
        lhh = season_all.get("vs_lhh") or stats.get("vs_lhh") or {}
        rhh = season_all.get("vs_rhh") or stats.get("vs_rhh") or {}
        checked += 1
        print(
            f"{pitcher.get('name','Pitcher')}: "
            f"vs LHH ERA={lhh.get('era')} | vs RHH ERA={rhh.get('era')}"
        )
        if lhh.get("era") is None:
            failures.append(f"{pitcher.get('name')}: missing vs LHH ERA")
        if rhh.get("era") is None:
            failures.append(f"{pitcher.get('name')}: missing vs RHH ERA")

if checked == 0:
    raise SystemExit("FAIL: no enriched pitchers found in games.json")
if failures:
    print("FAIL:")
    for failure in failures[:12]:
        print(" -", failure)
    raise SystemExit(1)
print(f"PASS: checked {checked} pitcher snapshots with season vs LHH/RHH ERA data.")
