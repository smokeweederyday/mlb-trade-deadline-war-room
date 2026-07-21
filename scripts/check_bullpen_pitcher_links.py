#!/usr/bin/env python3

from pathlib import Path
import json
import re
import sys


ROOT = Path(__file__).resolve().parents[1]

ENGINE = (
    ROOT
    / "assets/js/sports/mlbEngine.js"
).read_text(encoding="utf-8")

WIDGET = (
    ROOT
    / "assets/js/widgets/bullpenWidget.js"
).read_text(encoding="utf-8")

STYLES = (
    ROOT / "styles.css"
).read_text(encoding="utf-8")

GAME_JS = (
    ROOT / "game.js"
).read_text(encoding="utf-8")

GAME_HTML = (
    ROOT / "game.html"
).read_text(encoding="utf-8")

failures = []


engine_requirements = (
    "function buildBullpenArmNameSignal(",
    "nameSignalClass:",
    "nameSignalLabel:",
    "nameSignalScore:",
    "player.html?id=${",
    "}&role=pitching",
)

for requirement in engine_requirements:
    if requirement not in ENGINE:
        failures.append(
            "Engine requirement missing: "
            + requirement
        )


widget_requirements = (
    "function renderBullpenArmName(",
    "${renderBullpenArmName(arm)}",
    "bullpen-arm-player-link",
    "pitcher-name-signal",
    "arm.detailsUrl",
)

for requirement in widget_requirements:
    if requirement not in WIDGET:
        failures.append(
            "Widget requirement missing: "
            + requirement
        )


for signal_class in (
    "pitcher-signal-strong-positive",
    "pitcher-signal-positive",
    "pitcher-signal-neutral",
    "pitcher-signal-negative",
    "pitcher-signal-strong-negative",
):
    if signal_class not in ENGINE:
        failures.append(
            "Pitcher signal class missing: "
            + signal_class
        )


if "/* BULLPEN PITCHER SIGNAL LINKS */" not in STYLES:
    failures.append(
        "Bullpen link CSS is missing."
    )


if (
    "bullpenWidget.js?v="
    "phase11f-bullpen-pitcher-links1"
    not in GAME_JS
):
    failures.append(
        "Bullpen widget cache version is stale."
    )


if (
    "mlbEngine.js?v="
    "phase11f-bullpen-pitcher-links1"
    not in GAME_JS
):
    failures.append(
        "MLB engine cache version is stale."
    )


if (
    "game.js?v="
    "phase11f-bullpen-pitcher-links1"
    not in GAME_HTML
):
    failures.append(
        "Game-page cache version is stale."
    )


data_path = (
    ROOT
    / "data/games/2026-07-21.json"
)

if data_path.exists():
    payload = json.loads(
        data_path.read_text(
            encoding="utf-8"
        )
    )

    roster_rows = []

    for game in payload.get("games") or []:
        for side in ("away", "home"):
            roster_rows.extend(
                (
                    (game.get("bullpens") or {})
                    .get(side, {})
                    .get("roster", [])
                )
                or []
            )

    missing_ids = [
        row.get("name") or "Unknown reliever"
        for row in roster_rows
        if not row.get("id")
    ]

    if missing_ids:
        failures.append(
            "Bullpen roster rows missing player IDs: "
            + ", ".join(missing_ids[:10])
        )


print("BULLPEN PITCHER LINK AND SIGNAL CHECK")
print("=" * 42)

if failures:
    for failure in failures:
        print("FAIL:", failure)

    sys.exit(1)

print(
    "PASS: bullpen pitchers use starter-style "
    "green, neutral and red signal classes."
)

print(
    "PASS: bullpen pitcher names link to "
    "their pitching player pages."
)

print(
    "PASS: populated bullpen roster rows "
    "contain MLB player IDs."
)

print(
    "PASS: browser cache versions were updated."
)
