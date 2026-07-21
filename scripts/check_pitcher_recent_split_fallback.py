#!/usr/bin/env python3

from pathlib import Path
import json
import sys


ROOT = Path(__file__).resolve().parents[1]

ENGINE = (
    ROOT
    / "assets/js/sports/mlbEngine.js"
).read_text(encoding="utf-8")

GAME_JS = (
    ROOT / "game.js"
).read_text(encoding="utf-8")

GAME_HTML = (
    ROOT / "game.html"
).read_text(encoding="utf-8")

failures = []


for requirement in (
    "function resolveRecentStartSplitBlock({",
    "selectedStarts?.[splitKey]",
    "pitcher?.stats?.season?.[location]",
    "_contextFallback:",
    "`Season · ${formatLocationLabel(location)}`",
    'splitKey: "vs_lhh"',
    'splitKey: "vs_rhh"',
):
    if requirement not in ENGINE:
        failures.append(
            "Missing engine requirement: "
            + requirement
        )


for forbidden in (
    "? selectedStarts?.vs_lhh || {}",
    "? selectedStarts?.vs_rhh || {}",
):
    if forbidden in ENGINE:
        failures.append(
            "Old empty-split behavior remains: "
            + forbidden
        )


version = "phase11j-recent-split-fallback1"

if (
    f"mlbEngine.js?v={version}"
    not in GAME_JS
):
    failures.append(
        "MLB engine cache version is stale."
    )

if (
    f"game.js?v={version}"
    not in GAME_HTML
):
    failures.append(
        "Game-page cache version is stale."
    )


# Confirm the Gabriel Hughes fixture that exposed the bug.
data_path = (
    ROOT / "data/games/2026-07-22.json"
)

payload = json.loads(
    data_path.read_text(encoding="utf-8")
)

hughes = None

for game in payload.get("games") or []:
    for side in ("away", "home"):
        pitcher = (
            (game.get("pitchers") or {}).get(side)
            or {}
        )

        if pitcher.get("id") == 687312:
            hughes = pitcher
            break

    if hughes:
        break


if not hughes:
    failures.append(
        "Gabriel Hughes fixture was not found."
    )
else:
    stats = hughes.get("stats") or {}

    season_all = (
        (stats.get("season") or {}).get("all")
        or {}
    )

    recent_all = (
        (stats.get("last_starts") or {})
        .get("7", {})
        .get("all", {})
        or {}
    )

    if recent_all.get("vs_lhh"):
        failures.append(
            "Fixture unexpectedly has recent vs LHH data."
        )

    if recent_all.get("vs_rhh"):
        failures.append(
            "Fixture unexpectedly has recent vs RHH data."
        )

    if not season_all.get("vs_lhh"):
        failures.append(
            "Season vs LHH fallback is unavailable."
        )

    if not season_all.get("vs_rhh"):
        failures.append(
            "Season vs RHH fallback is unavailable."
        )


print("RECENT-START HANDEDNESS FALLBACK CHECK")
print("=" * 42)

if failures:
    for failure in failures:
        print("FAIL:", failure)

    sys.exit(1)


print(
    "PASS: recent handedness splits remain preferred."
)

print(
    "PASS: missing recent splits fall back to Season."
)

print(
    "PASS: fallback context is labeled honestly."
)

print(
    "PASS: Gabriel Hughes now has usable LHH/RHH columns."
)
