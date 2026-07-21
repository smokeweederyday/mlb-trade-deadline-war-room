#!/usr/bin/env python3

from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]

WIDGET = (
    ROOT
    / "assets/js/widgets/bullpenWidget.js"
).read_text(encoding="utf-8")

GAME_JS = (
    ROOT / "game.js"
).read_text(encoding="utf-8")

GAME_HTML = (
    ROOT / "game.html"
).read_text(encoding="utf-8")

active_function = WIDGET[
    WIDGET.index("function renderPitchCount"):
    WIDGET.index("function renderBullpenMetric")
]

failures = []

for requirement in (
    "if (pitches === 0)",
    'class="bullpen-pitches bullpen-zero"',
    "bullpen-pitch-gradient",
    "120 * (1 - workloadRatio)",
):
    if requirement not in active_function:
        failures.append(
            "Missing workload rule: " + requirement
        )

for forbidden in (
    '"metric-average"',
    '"metric-good"',
    '"metric-poor"',
    '"metric-awful"',
):
    if forbidden in active_function:
        failures.append(
            "Old discrete class remains: " + forbidden
        )

if (
    "bullpenWidget.js?v="
    "phase11h-zero-gray-gradient1"
    not in GAME_JS
):
    failures.append(
        "Bullpen widget cache version is stale."
    )

if (
    "game.js?v="
    "phase11h-zero-gray-gradient1"
    not in GAME_HTML
):
    failures.append(
        "Game-page cache version is stale."
    )

print("BULLPEN WORKLOAD COLOR CONTRACT")
print("=" * 36)

if failures:
    for failure in failures:
        print("FAIL:", failure)

    sys.exit(1)

print("PASS: zero pitches remains grey.")
print("PASS: one or more pitches begins green.")
print("PASS: positive workloads move directly toward red.")
print("PASS: no grey midpoint is used.")
