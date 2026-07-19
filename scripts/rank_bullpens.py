#!/usr/bin/env python3

import json
import math
from collections import defaultdict
from pathlib import Path

DATA_PATH = Path("data/games.json")


def unwrap(value):
    if isinstance(value, dict):
        return value.get("value")
    return value


def numeric(value):
    try:
        number = float(unwrap(value))
    except (TypeError, ValueError):
        return None

    return number if math.isfinite(number) else None


def innings_to_outs(value):
    value = unwrap(value)

    if value is None or value == "":
        return None

    text = str(value).strip()

    try:
        whole_text, _, partial_text = text.partition(".")
        whole = int(whole_text)
        partial = int(partial_text or "0")
    except ValueError:
        return None

    if partial not in (0, 1, 2):
        return None

    return whole * 3 + partial


def per_nine(count, innings):
    count = numeric(count)
    outs = innings_to_outs(innings)

    if count is None or outs is None or outs <= 0:
        return None

    return count * 27 / outs


def get_game_date(game):
    date = (
        game.get("date")
        or game.get("game_date")
        or game.get("official_date")
    )

    if date:
        return str(date)[:10]

    game_id = str(game.get("id") or "")
    return game_id[:10]


def get_team_key(game, side, bullpen):
    team = game.get(f"{side}_team") or {}

    key = (
        bullpen.get("team")
        or team.get("abbr")
        or team.get("id")
    )

    return str(key) if key is not None else ""


def extract_snapshot(bullpen):
    stats = bullpen.get("stats") or {}

    season = (
        stats.get("season", {})
        .get("all", {})
    )

    last_30 = (
        stats.get("last_30", {})
        .get("all", {})
    )

    return {
        "era": numeric(season.get("era")),
        "whip": numeric(season.get("whip")),
        "fip": numeric(season.get("fip")),
        "k_per_9": per_nine(
            season.get("strikeouts"),
            season.get("innings_pitched"),
        ),
        "bb_per_9": per_nine(
            season.get("walks"),
            season.get("innings_pitched"),
        ),
        "last_30_whip": numeric(
            last_30.get("whip")
        ),
    }


def calculate_ranks(latest, metric, higher_is_better=False):
    values = {
        team: snapshot.get(metric)
        for team, snapshot in latest.items()
        if snapshot.get(metric) is not None
    }

    pool_size = len(values)
    ranks = {}

    for team, value in values.items():
        if higher_is_better:
            better = sum(
                other > value
                for other in values.values()
            )
        else:
            better = sum(
                other < value
                for other in values.values()
            )

        ranks[team] = better + 1

    return ranks, pool_size


def install_ranks(bullpen, team, rank_sets):
    stats = bullpen.setdefault("stats", {})

    season = (
        stats.setdefault("season", {})
        .setdefault("all", {})
    )

    last_30 = (
        stats.setdefault("last_30", {})
        .setdefault("all", {})
    )

    season_ranks = season.setdefault(
        "ranks",
        {},
    )

    season_pools = season.setdefault(
        "rank_pool_size",
        {},
    )

    for metric in (
        "era",
        "whip",
        "fip",
        "k_per_9",
        "bb_per_9",
    ):
        ranks, pool = rank_sets[metric]

        season_ranks[metric] = ranks.get(team)
        season_pools[metric] = pool

    l30_ranks, l30_pool = rank_sets[
        "last_30_whip"
    ]

    last_30.setdefault(
        "ranks",
        {},
    )["whip"] = l30_ranks.get(team)

    last_30.setdefault(
        "rank_pool_size",
        {},
    )["whip"] = l30_pool


def main():
    payload = json.loads(
        DATA_PATH.read_text(encoding="utf-8")
    )

    games_container = payload.get(
        "games",
        payload,
    )

    if isinstance(games_container, dict):
        games = list(games_container.values())
    else:
        games = games_container

    by_date = defaultdict(list)

    for game in games:
        date = get_game_date(game)

        if date:
            by_date[date].append(game)

    latest = {}

    for date in sorted(by_date):
        day_games = by_date[date]

        # First update every team playing on this date.
        for game in day_games:
            bullpens = game.get("bullpens") or {}

            for side in ("away", "home"):
                bullpen = bullpens.get(side) or {}
                team = get_team_key(
                    game,
                    side,
                    bullpen,
                )

                if team:
                    latest[team] = extract_snapshot(
                        bullpen
                    )

        # Then rank every latest available MLB bullpen.
        rank_sets = {
            "era": calculate_ranks(
                latest,
                "era",
            ),
            "whip": calculate_ranks(
                latest,
                "whip",
            ),
            "fip": calculate_ranks(
                latest,
                "fip",
            ),
            "k_per_9": calculate_ranks(
                latest,
                "k_per_9",
                higher_is_better=True,
            ),
            "bb_per_9": calculate_ranks(
                latest,
                "bb_per_9",
            ),
            "last_30_whip": calculate_ranks(
                latest,
                "last_30_whip",
            ),
        }

        # Install the date-correct ranks into each game.
        for game in day_games:
            bullpens = game.get("bullpens") or {}

            for side in ("away", "home"):
                bullpen = bullpens.get(side) or {}
                team = get_team_key(
                    game,
                    side,
                    bullpen,
                )

                if team:
                    install_ranks(
                        bullpen,
                        team,
                        rank_sets,
                    )

    DATA_PATH.write_text(
        json.dumps(
            payload,
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )

    print(
        f"SUCCESS: ranked bullpens across "
        f"{len(by_date)} dates."
    )


if __name__ == "__main__":
    main()
