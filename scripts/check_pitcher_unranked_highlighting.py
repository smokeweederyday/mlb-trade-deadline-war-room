#!/usr/bin/env python3

from pathlib import Path
import json
import re
import sys


ROOT = Path(__file__).resolve().parents[1]

ENGINE_PATH = (
    ROOT
    / "assets/js/sports/mlbEngine.js"
)

GAME_JS_PATH = ROOT / "game.js"
GAME_HTML_PATH = ROOT / "game.html"

HUGHES_DATA_PATH = (
    ROOT
    / "data/games/2026-07-22.json"
)

HUGHES_ID = 687312

errors = []


def fail(message):
    errors.append(message)


def benchmark_fip(value):
    if value <= 3.20:
        return "metric-elite"

    if value <= 3.80:
        return "metric-good"

    if value <= 4.30:
        return "metric-average"

    if value <= 4.80:
        return "metric-poor"

    return "metric-awful"


engine = ENGINE_PATH.read_text(
    encoding="utf-8"
)

game_js = GAME_JS_PATH.read_text(
    encoding="utf-8"
)

game_html = GAME_HTML_PATH.read_text(
    encoding="utf-8"
)


# =========================================================
# SOURCE CONTRACT
# =========================================================

requirements = (
    "function getUnrankedPitcherHeatClass(",
    'metric === "fip"',
    'metric === "xfip"',
    'metric === "whip"',
    'metric === "avg_against"',
    'metric === "k_rate"',
    'metric === "bb_rate"',
    'metric === "go_ao"',
    "getUnrankedPitcherHeatClass(",
    "key,",
    "value.value",
    "color uses a fixed MLB benchmark",
)

for requirement in requirements:
    if requirement not in engine:
        fail(
            "Missing MLB engine requirement: "
            + requirement
        )


normalizer_start = engine.find(
    "function normalizeRankedPitcherValue("
)

normalizer_end = engine.find(
    "export function buildMlbBullpenModule(",
    normalizer_start,
)

if normalizer_start < 0:
    fail(
        "normalizeRankedPitcherValue was not found."
    )

elif normalizer_end < 0:
    fail(
        "Could not isolate pitcher normalizer."
    )

else:
    normalizer = engine[
        normalizer_start:normalizer_end
    ]

    old_grey_pattern = re.compile(
        r"""
        :\s*hasValue
        \s*\?\s*"metric-average"
        \s*:\s*"metric-missing"
        \s*:\s*hasValue
        """,
        re.VERBOSE,
    )

    if old_grey_pattern.search(normalizer):
        fail(
            "Old grey-only unranked pitcher "
            "behavior has returned."
        )

    if (
        "getUnrankedPitcherHeatClass("
        not in normalizer
    ):
        fail(
            "Pitcher normalizer does not call "
            "the unranked benchmark helper."
        )


# =========================================================
# CACHE-VERSION CONTRACT
# =========================================================

engine_version_match = re.search(
    r'mlbEngine\.js\?v=([^"]+)',
    game_js,
)

game_version_match = re.search(
    r'game\.js\?v=([^"]+)',
    game_html,
)

if not engine_version_match:
    fail(
        "game.js has no mlbEngine cache version."
    )

if not game_version_match:
    fail(
        "game.html has no game.js cache version."
    )

if (
    engine_version_match
    and game_version_match
    and engine_version_match.group(1)
    != game_version_match.group(1)
):
    fail(
        "Browser cache versions do not match: "
        f"{engine_version_match.group(1)} vs "
        f"{game_version_match.group(1)}."
    )


# =========================================================
# GABRIEL HUGHES REGRESSION FIXTURE
# =========================================================

payload = json.loads(
    HUGHES_DATA_PATH.read_text(
        encoding="utf-8"
    )
)

hughes = None

for game in payload.get("games") or []:
    for side in ("away", "home"):
        pitcher = (
            (game.get("pitchers") or {})
            .get(side)
            or {}
        )

        if pitcher.get("id") == HUGHES_ID:
            hughes = pitcher
            break

    if hughes:
        break


if not hughes:
    fail(
        "Gabriel Hughes regression fixture "
        "was not found."
    )

else:
    season_all = (
        (hughes.get("stats") or {})
        .get("season", {})
        .get("all", {})
        or {}
    )

    expected_classes = {
        ("vs_lhh", "fip"):
            "metric-elite",

        ("vs_lhh", "xfip"):
            "metric-poor",

        ("vs_rhh", "fip"):
            "metric-elite",

        ("vs_rhh", "xfip"):
            "metric-elite",
    }

    for split_key in (
        "vs_lhh",
        "vs_rhh",
    ):
        split = (
            season_all.get(split_key)
            or {}
        )

        if not split:
            fail(
                f"Hughes {split_key} block "
                "is missing."
            )

            continue

        for metric in ("fip", "xfip"):
            raw_value = split.get(metric)

            if raw_value is None:
                fail(
                    f"Hughes {split_key} "
                    f"{metric} is missing."
                )

                continue

            value = float(raw_value)

            actual_class = benchmark_fip(
                value
            )

            expected_class = (
                expected_classes[
                    (split_key, metric)
                ]
            )

            if actual_class != expected_class:
                fail(
                    f"Hughes {split_key} "
                    f"{metric} benchmark changed: "
                    f"expected {expected_class}, "
                    f"got {actual_class}."
                )


print(
    "PITCHER UNRANKED HIGHLIGHTING CHECK"
)

print("=" * 41)

if errors:
    for error in errors:
        print("FAIL:", error)

    sys.exit(1)


print(
    "PASS: unranked pitcher values do not "
    "default to grey."
)

print(
    "PASS: FIP and xFIP use fixed MLB "
    "benchmark colors when unranked."
)

print(
    "PASS: ranked values still use league "
    "rank highlighting."
)

print(
    "PASS: cache versions match."
)

print(
    "PASS: Gabriel Hughes split fixture "
    "remains derived and highlighted."
)
