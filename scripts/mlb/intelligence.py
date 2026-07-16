from __future__ import annotations

from typing import Any
import os

# Rank direction: True means a larger value is better.
OFFENSE_HIGHER_IS_BETTER = {
    "AVG": True,
    "wRC+": True,
    "K%": False,
    "BB%": True,
    "OBP": True,
    "OPS": True,
}

PITCHER_LOWER_IS_BETTER = ("era", "whip", "fip", "xfip", "avg_against")


def innings_to_outs(value: Any) -> int | None:
    if value in (None, "", "-"):
        return None
    text = str(value)
    try:
        whole, _, frac = text.partition(".")
        outs = int(whole) * 3
        if frac:
            outs += int(frac[0])
        return outs
    except (TypeError, ValueError):
        return None


def add_fip(stats: dict[str, Any]) -> None:
    """Add FIP from MLB component stats when enough data exists.

    The FIP constant is configurable because it changes by season. Until a
    season-specific constants feed is installed, the engine uses 3.10 and
    records that provenance in the payload rather than pretending it is exact.
    """
    outs = innings_to_outs(stats.get("innings_pitched"))
    if not outs:
        return
    ip = outs / 3
    hr = stats.get("home_runs")
    bb = stats.get("walks")
    k = stats.get("strikeouts")
    if any(v is None for v in (hr, bb, k)):
        return
    constant = float(os.getenv("BORING_BETS_FIP_CONSTANT", "3.10"))
    stats["fip"] = round(((13 * hr) + (3 * bb) - (2 * k)) / ip + constant, 2)
    stats["fip_source"] = "calculated"
    stats["fip_constant"] = constant


def add_xfip(stats: dict[str, Any]) -> None:
    """Calculate xFIP using configurable league HR/FB and MLB air-outs data."""
    outs = innings_to_outs(stats.get("innings_pitched"))
    air_outs = stats.get("air_outs")
    bb = stats.get("walks")
    k = stats.get("strikeouts")
    if not outs or any(v is None for v in (air_outs, bb, k)):
        return
    ip = outs / 3
    constant = float(os.getenv("BORING_BETS_FIP_CONSTANT", "3.10"))
    league_hr_fb = float(os.getenv("BORING_BETS_LEAGUE_HR_FB", "0.105"))
    expected_hr = float(air_outs) * league_hr_fb
    stats["xfip"] = round(((13 * expected_hr) + (3 * bb) - (2 * k)) / ip + constant, 2)
    stats["xfip_source"] = "calculated_air_outs_league_hr_fb"
    stats["league_hr_fb"] = league_hr_fb


def enrich_pitcher_fip(game: dict[str, Any]) -> None:
    for side in ("away", "home"):
        pitcher = game.get("pitchers", {}).get(side, {})
        stats_root = pitcher.get("stats", {})
        for timeframe in ("last_7", "last_30", "season"):
            for location in ("all", "home", "away"):
                stats = stats_root.get(timeframe, {}).get(location, {})
                if isinstance(stats, dict):
                    add_fip(stats)
                    add_xfip(stats)
                    for split in ("vs_lhh", "vs_rhh"):
                        split_stats = stats.get(split, {})
                        if isinstance(split_stats, dict):
                            add_fip(split_stats)
                            add_xfip(split_stats)
        for split in ("vs_lhh", "vs_rhh"):
            stats = stats_root.get(split, {})
            if isinstance(stats, dict):
                add_fip(stats)
                add_xfip(stats)


def rank_values(rows: list[tuple[dict[str, Any], str, float]], higher_is_better: bool) -> None:
    rows.sort(key=lambda row: row[2], reverse=higher_is_better)
    prior_value: float | None = None
    prior_rank = 0
    for index, (target, rank_key, value) in enumerate(rows, start=1):
        rank = prior_rank if prior_value == value else index
        target[rank_key] = rank
        target[f"{rank_key}_coverage"] = len(rows)
        prior_value = value
        prior_rank = rank


def enrich_offense_ranks(games: list[dict[str, Any]]) -> None:
    """Rank every available team snapshot without inventing missing teams.

    Coverage is written beside each rank. When the all-30-team cache is added,
    coverage becomes 30 automatically; until then the UI can truthfully show
    the size of the comparison pool.
    """
    for timeframe in ("last_7", "last_30", "season"):
        for location in ("all", "home", "away"):
            for metric, higher_is_better in OFFENSE_HIGHER_IS_BETTER.items():
                for value_key, rank_key in (("overall", "overall_rank"), ("vs_hand", "vs_hand_rank")):
                    rows: list[tuple[dict[str, Any], str, float]] = []
                    seen_teams: set[int] = set()
                    for game in games:
                        for side in ("away", "home"):
                            offense = game.get("offense", {}).get(side, {})
                            team_id = offense.get("team_id")
                            if team_id in seen_teams:
                                continue
                            metric_row = (
                                offense.get("stats", {})
                                .get(timeframe, {})
                                .get(location, {})
                                .get(metric, {})
                            )
                            value = metric_row.get(value_key) if isinstance(metric_row, dict) else None
                            if isinstance(value, (int, float)):
                                rows.append((metric_row, rank_key, float(value)))
                                if team_id is not None:
                                    seen_teams.add(team_id)
                    rank_values(rows, higher_is_better)


def enrich_games(games: list[dict[str, Any]]) -> list[dict[str, Any]]:
    for game in games:
        enrich_pitcher_fip(game)
        game["intelligence_meta"] = {
            "engine_version": "0.2.0",
            "fip": "calculated from MLB component stats; constant configurable",
            "xfip": "calculated from air outs using configurable league HR/FB",
            "wrc_plus": "FanGraphs team leaderboard feed; exact active filters",
            "rank_policy": "best value receives rank 1; coverage stored per rank",
        }
    # Offense ranks are supplied by the validated 30-team league cache in
    # scripts/mlb/offense.py. Do not recompute them from only the teams on
    # the current slate, which would collapse ranks to 1..N games.
    return games
