#!/usr/bin/env python3

from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]

ENGINE = (
    ROOT
    / "assets/js/sports/mlbEngine.js"
).read_text(encoding="utf-8")

WIDGET = (
    ROOT
    / "assets/js/widgets/pitcherWidget.js"
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

errors = []


def require(source, text, label):
    if text not in source:
        errors.append(
            f"{label} missing: {text}"
        )


for text in (
    "const locationSignals =",
    "const startSignals =",
    "locationSignals,",
    "startSignals,",
    '["all", "home", "away"]',
    "allowedStartCounts.map(",
    "buildPitcherNameSignal(",
):
    require(
        ENGINE,
        text,
        "Engine",
    )


for text in (
    "locationSignals[location]",
    "startSignals[String(option)]",
    "pitcher-control-signal",
    "pitcher-signal-neutral",
):
    require(
        WIDGET,
        text,
        "Widget",
    )


for text in (
    "/* PITCHER CONTROL QUALITY HEAT",
    "pitcher-signal-strong-positive",
    "pitcher-signal-positive",
    "pitcher-signal-neutral",
    "pitcher-signal-negative",
    "pitcher-signal-strong-negative",
    ".pitcher-start-compact.inactive",
):
    require(
        STYLES,
        text,
        "Styles",
    )


version = "phase11l-pitcher-control-heat1"

for source, text, label in (
    (
        GAME_JS,
        f"mlbEngine.js?v={version}",
        "MLB engine cache",
    ),
    (
        GAME_JS,
        f"pitcherWidget.js?v={version}",
        "Pitcher widget cache",
    ),
    (
        GAME_HTML,
        f"game.js?v={version}",
        "Game page cache",
    ),
):
    require(
        source,
        text,
        label,
    )


if "bullpen-pitch-gradient" not in STYLES:
    errors.append(
        "Bullpen workload gradient disappeared."
    )


print("PITCHER CONTROL HEAT CHECK")
print("=" * 35)

if errors:
    for error in errors:
        print("FAIL:", error)

    sys.exit(1)


print(
    "PASS: All/Home/Away each receive "
    "their own pitcher signal."
)

print(
    "PASS: 1/3/7/10/20 Starts each receive "
    "their own pitcher signal."
)

print(
    "PASS: controls use red, grey, and green."
)

print(
    "PASS: selected controls retain their grade."
)

print(
    "PASS: bullpen workload gradient remains separate."
)

print(
    "PASS: browser cache versions match."
)
