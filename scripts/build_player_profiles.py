#!/usr/bin/env python3
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any
import argparse
import json
import urllib.parse
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
GAMES_FILE = ROOT / "data" / "games.json"
OUTPUT_FILE = ROOT / "data" / "players.json"

MLB_API_BASE = "https://statsapi.mlb.com/api/v1"

PITCHER_WEIGHTS = {
    "era": 1.25,
    "whip": 1.10,
    "fip": 1.35,
    "xfip": 1.35,
    "avg_against": 0.90,
    "k_rate": 0.90,
    "bb_rate": 0.80,
    "go_ao": 0.50,
}

HITTER_WEIGHTS = {
    "avg": 0.70,
    "obp": 1.10,
    "slg": 1.10,
    "ops": 1.40,
    "home_runs": 0.55,
    "k_rate": 0.70,
    "bb_rate": 0.70,
}

HITTER_HIGHER_IS_BETTER = {
    "avg": True,
    "obp": True,
    "slg": True,
    "ops": True,
    "home_runs": True,
    "k_rate": False,
    "bb_rate": True,
}


def load_json(path: Path) -> Any:
    return json.loads(
        path.read_text(
            encoding="utf-8"
        )
    )


def get_json(
    url: str,
) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent":
                "BoringBets/1.0 player-profile-builder"
        },
    )

    with urllib.request.urlopen(
        request,
        timeout=40,
    ) as response:
        return json.loads(
            response.read()
        )


def games_from_payload(
    payload: Any,
) -> list[dict[str, Any]]:
    if isinstance(payload, dict):
        games = payload.get("games", [])
        return (
            games
            if isinstance(games, list)
            else []
        )

    return (
        payload
        if isinstance(payload, list)
        else []
    )


def empty_player(
    player_id: int,
    season: int,
) -> dict[str, Any]:
    return {
        "id": player_id,
        "name": f"Player {player_id}",
        "season": season,
        "team": {},
        "positions": [],
        "primary_position": None,
        "bats": None,
        "throws": None,
        "age": None,
        "height": None,
        "weight": None,
        "birth_date": None,
        "birth_city": None,
        "birth_state": None,
        "birth_country": None,
        "mlb_debut": None,
        "roles": {
            "pitching": {
                "available": False,
                "stats": {},
                "ranks": {},
                "rank_pool_size": {},
                "signal": neutral_signal(
                    "Pitching"
                ),
            },
            "hitting": {
                "available": False,
                "stats": {},
                "ranks": {},
                "rank_pool_size": {},
                "signal": neutral_signal(
                    "Hitting"
                ),
            },
        },
    }


def neutral_signal(
    label: str,
) -> dict[str, Any]:
    return {
        "score": 0,
        "tone": "neutral",
        "class_name":
            "player-signal-neutral",
        "label":
            f"{label} rating unavailable",
    }


def player_record(
    players: dict[str, dict[str, Any]],
    player_id: Any,
    season: int,
) -> dict[str, Any] | None:
    try:
        numeric_id = int(player_id)
    except (TypeError, ValueError):
        return None

    key = str(numeric_id)

    if key not in players:
        players[key] = empty_player(
            numeric_id,
            season,
        )

    return players[key]


def collect_saved_players(
    games: list[dict[str, Any]],
    season: int,
) -> dict[str, dict[str, Any]]:
    players: dict[str, dict[str, Any]] = {}

    ordered_games = sorted(
        games,
        key=lambda game:
            str(game.get("date") or ""),
    )

    for game in ordered_games:
        teams = {
            "away":
                game.get("away_team") or {},
            "home":
                game.get("home_team") or {},
        }

        pitchers = (
            game.get("pitchers") or {}
        )

        for side in ("away", "home"):
            pitcher = (
                pitchers.get(side) or {}
            )

            record = player_record(
                players,
                pitcher.get("id"),
                season,
            )

            if record is None:
                continue

            record["name"] = (
                pitcher.get("name")
                or record["name"]
            )

            record["age"] = (
                pitcher.get("age")
                if pitcher.get("age")
                is not None
                else record.get("age")
            )

            record["throws"] = (
                pitcher.get("throws")
                or record.get("throws")
            )

            record["team"] = normalize_team(
                teams.get(side)
            )

            record["primary_position"] = (
                record.get(
                    "primary_position"
                )
                or "P"
            )

            add_position(
                record,
                "P",
            )

            season_all = (
                pitcher.get("stats", {})
                .get("season", {})
                .get("all", {})
            )

            role = record["roles"][
                "pitching"
            ]

            role["available"] = True

            if season_all:
                role["stats"] = {
                    key: value
                    for key, value
                    in season_all.items()
                    if not isinstance(
                        value,
                        dict,
                    )
                }

                role["ranks"] = dict(
                    season_all.get(
                        "ranks"
                    ) or {}
                )

                role[
                    "rank_pool_size"
                ] = dict(
                    season_all.get(
                        "rank_pool_size"
                    ) or {}
                )

        lineups = (
            game.get("lineups") or {}
        )

        for side in ("away", "home"):
            players_block = (
                lineups.get(side) or {}
            ).get("players") or []

            for hitter in players_block:
                record = player_record(
                    players,
                    hitter.get("id"),
                    season,
                )

                if record is None:
                    continue

                record["name"] = (
                    hitter.get("name")
                    or record["name"]
                )

                record["bats"] = (
                    hitter.get("bats")
                    or record.get("bats")
                )

                position = (
                    hitter.get("position")
                    or "H"
                )

                record["primary_position"] = (
                    record.get(
                        "primary_position"
                    )
                    or position
                )

                add_position(
                    record,
                    position,
                )

                record["team"] = normalize_team(
                    teams.get(side)
                )

                role = record["roles"][
                    "hitting"
                ]

                role["available"] = True
                role["position"] = position

    return players


def normalize_team(
    team: Any,
) -> dict[str, Any]:
    if not isinstance(team, dict):
        return {}

    return {
        "id":
            team.get("id")
            or team.get("team_id"),
        "name":
            team.get("name"),
        "abbr":
            team.get("abbr")
            or team.get("abbreviation"),
        "logo_url":
            team.get("logo_url"),
    }


def add_position(
    player: dict[str, Any],
    position: Any,
) -> None:
    text = str(
        position or ""
    ).strip()

    if (
        text and
        text not in player["positions"]
    ):
        player["positions"].append(
            text
        )


def enrich_people(
    players: dict[str, dict[str, Any]],
) -> None:
    ids = sorted(
        int(player_id)
        for player_id in players
    )

    chunk_size = 75

    for start in range(
        0,
        len(ids),
        chunk_size,
    ):
        chunk = ids[
            start:start + chunk_size
        ]

        query = urllib.parse.urlencode({
            "personIds":
                ",".join(
                    str(value)
                    for value in chunk
                ),
            "hydrate":
                "currentTeam,team,position",
        })

        url = (
            f"{MLB_API_BASE}/people?"
            f"{query}"
        )

        try:
            payload = get_json(url)
        except Exception as error:
            print(
                "Player bio batch failed:",
                error,
            )
            continue

        for person in (
            payload.get("people") or []
        ):
            record = players.get(
                str(person.get("id"))
            )

            if record is None:
                continue

            record["name"] = (
                person.get("fullName")
                or record["name"]
            )

            record["age"] = (
                person.get("currentAge")
                if person.get(
                    "currentAge"
                ) is not None
                else record.get("age")
            )

            record["height"] = (
                person.get("height")
            )

            record["weight"] = (
                person.get("weight")
            )

            record["birth_date"] = (
                person.get("birthDate")
            )

            record["birth_city"] = (
                person.get("birthCity")
            )

            record["birth_state"] = (
                person.get(
                    "birthStateProvince"
                )
            )

            record["birth_country"] = (
                person.get(
                    "birthCountry"
                )
            )

            record["mlb_debut"] = (
                person.get(
                    "mlbDebutDate"
                )
            )

            record["bats"] = (
                (
                    person.get(
                        "batSide"
                    ) or {}
                ).get("code")
                or record.get("bats")
            )

            record["throws"] = (
                (
                    person.get(
                        "pitchHand"
                    ) or {}
                ).get("code")
                or record.get("throws")
            )

            primary_position = (
                person.get(
                    "primaryPosition"
                ) or {}
            ).get("abbreviation")

            if primary_position:
                record[
                    "primary_position"
                ] = primary_position

                add_position(
                    record,
                    primary_position,
                )

            current_team = (
                person.get(
                    "currentTeam"
                ) or {}
            )

            if current_team:
                record["team"] = {
                    "id":
                        current_team.get(
                            "id"
                        ),
                    "name":
                        current_team.get(
                            "name"
                        ),
                    "abbr":
                        record.get(
                            "team",
                            {},
                        ).get("abbr"),
                    "logo_url":
                        record.get(
                            "team",
                            {},
                        ).get("logo_url"),
                }


def fetch_hitting_rows(
    season: int,
    player_pool: str = "ALL",
) -> list[dict[str, Any]]:
    query = urllib.parse.urlencode({
        "stats": "season",
        "group": "hitting",
        "season": season,
        "playerPool": player_pool,
        "limit": 5000,
    })

    payload = get_json(
        f"{MLB_API_BASE}/stats?{query}"
    )

    for group in (
        payload.get("stats") or []
    ):
        splits = (
            group.get("splits") or []
        )

        if splits:
            return splits

    return []



def normalize_hitting_stat(
    split: dict[str, Any],
) -> tuple[str, dict[str, Any]] | None:
    player = split.get("player") or {}
    stat = split.get("stat") or {}

    player_id = player.get("id")

    if player_id is None:
        return None

    pa = to_float(
        stat.get("plateAppearances")
    )

    strikeouts = to_float(
        stat.get("strikeOuts")
    )

    walks = to_float(
        stat.get("baseOnBalls")
    )

    return str(player_id), {
        "avg": to_float(
            stat.get("avg")
        ),
        "obp": to_float(
            stat.get("obp")
        ),
        "slg": to_float(
            stat.get("slg")
        ),
        "ops": to_float(
            stat.get("ops")
        ),
        "home_runs": to_float(
            stat.get("homeRuns")
        ),
        "rbi": to_float(
            stat.get("rbi")
        ),
        "plate_appearances": pa,
        "strikeouts": strikeouts,
        "walks": walks,
        "k_rate": (
            round(
                strikeouts / pa * 100,
                1,
            )
            if pa and strikeouts is not None
            else None
        ),
        "bb_rate": (
            round(
                walks / pa * 100,
                1,
            )
            if pa and walks is not None
            else None
        ),
    }


def apply_hitting_stats(
    players: dict[str, dict[str, Any]],
    season: int,
) -> None:
    try:
        all_splits = fetch_hitting_rows(
            season,
            "ALL",
        )

        qualified_splits = fetch_hitting_rows(
            season,
            "QUALIFIED",
        )
    except Exception as error:
        print(
            "Hitting leaderboard unavailable:",
            error,
        )
        return

    all_rows: dict[str, dict[str, Any]] = {}
    qualified_rows: dict[str, dict[str, Any]] = {}

    for split in all_splits:
        normalized = normalize_hitting_stat(
            split
        )

        if normalized is None:
            continue

        player_id, stats = normalized
        all_rows[player_id] = stats

    for split in qualified_splits:
        normalized = normalize_hitting_stat(
            split
        )

        if normalized is None:
            continue

        player_id, stats = normalized
        qualified_rows[player_id] = stats

    rankings = rank_hitting_rows(
        qualified_rows
    )

    matched = 0

    for player_id, stats in all_rows.items():
        record = players.get(
            player_id
        )

        if record is None:
            continue

        matched += 1

        role = record["roles"][
            "hitting"
        ]

        role["available"] = True
        role["stats"] = stats

        ranking = rankings.get(
            player_id,
            {},
        )

        role["ranks"] = dict(
            ranking.get("ranks") or {}
        )

        role["rank_pool_size"] = dict(
            ranking.get(
                "rank_pool_size"
            ) or {}
        )

        role["ranking_eligible"] = (
            player_id in qualified_rows
        )

    print(
        f"Applied hitting stats to "
        f"{matched} saved players."
    )

    print(
        f"Qualified hitting rank pool: "
        f"{len(qualified_rows)} players."
    )



def rank_hitting_rows(
    rows: dict[str, dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    output = {
        player_id: {
            "ranks": {},
            "rank_pool_size": {},
        }
        for player_id in rows
    }

    for metric, higher_is_better in (
        HITTER_HIGHER_IS_BETTER.items()
    ):
        candidates = [
            (
                player_id,
                stats.get(metric),
            )
            for player_id, stats
            in rows.items()
            if isinstance(
                stats.get(metric),
                (int, float),
            )
        ]

        candidates.sort(
            key=lambda item: item[1],
            reverse=higher_is_better,
        )

        prior_value = None
        prior_rank = 0

        for index, (
            player_id,
            value,
        ) in enumerate(
            candidates,
            start=1,
        ):
            rank = (
                prior_rank
                if value == prior_value
                else index
            )

            output[player_id][
                "ranks"
            ][metric] = rank

            output[player_id][
                "rank_pool_size"
            ][metric] = len(
                candidates
            )

            prior_value = value
            prior_rank = rank

    return output


def build_signal(
    role: dict[str, Any],
    weights: dict[str, float],
    label: str,
) -> dict[str, Any]:
    ranks = role.get("ranks") or {}
    pools = (
        role.get("rank_pool_size")
        or {}
    )

    total = 0.0
    weight_total = 0.0
    metrics_used = 0

    for metric, weight in (
        weights.items()
    ):
        rank = to_float(
            ranks.get(metric)
        )

        pool = to_float(
            pools.get(metric)
        )

        if (
            rank is None
            or pool is None
            or rank < 1
            or pool < 2
        ):
            continue

        score = (
            1
            - (
                2
                * (rank - 1)
                / (pool - 1)
            )
        )

        total += score * weight
        weight_total += weight
        metrics_used += 1

    if not weight_total:
        return neutral_signal(label)

    score = max(
        -1.0,
        min(
            1.0,
            total / weight_total,
        ),
    )

    if score >= 0.45:
        tone = "strong-positive"
        description = (
            f"Strong positive {label.lower()} profile"
        )
    elif score >= 0.14:
        tone = "positive"
        description = (
            f"Positive {label.lower()} profile"
        )
    elif score <= -0.45:
        tone = "strong-negative"
        description = (
            f"Strong negative {label.lower()} profile"
        )
    elif score <= -0.14:
        tone = "negative"
        description = (
            f"Negative {label.lower()} profile"
        )
    else:
        tone = "neutral"
        description = (
            f"League-average {label.lower()} profile"
        )

    return {
        "score": round(score, 3),
        "tone": tone,
        "class_name":
            f"player-signal-{tone}",
        "label":
            f"{description} · "
            f"{metrics_used} ranked metrics used",
    }


def finalize_signals(
    players: dict[str, dict[str, Any]],
) -> None:
    for player in players.values():
        pitching = player[
            "roles"
        ]["pitching"]

        hitting = player[
            "roles"
        ]["hitting"]

        pitching["signal"] = (
            build_signal(
                pitching,
                PITCHER_WEIGHTS,
                "Pitching",
            )
        )

        hitting["signal"] = (
            build_signal(
                hitting,
                HITTER_WEIGHTS,
                "Hitting",
            )
        )


def to_float(
    value: Any,
) -> float | None:
    if value in (
        None,
        "",
        "-",
    ):
        return None

    try:
        return float(value)
    except (
        TypeError,
        ValueError,
    ):
        return None


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Build the reusable Boring Bets "
            "MLB player profile index."
        )
    )

    parser.add_argument(
        "--season",
        type=int,
        default=datetime.now().year,
    )

    parser.add_argument(
        "--skip-network",
        action="store_true",
        help=(
            "Use only saved game data and "
            "skip MLB bio/hitting enrichment."
        ),
    )

    args = parser.parse_args()

    payload = load_json(
        GAMES_FILE
    )

    games = games_from_payload(
        payload
    )

    players = collect_saved_players(
        games,
        args.season,
    )

    print(
        f"Discovered {len(players)} "
        f"MLB players in saved games."
    )

    if not args.skip_network:
        print(
            "Fetching MLB player bios..."
        )
        enrich_people(players)

        print(
            "Fetching qualified hitter "
            "season leaderboard..."
        )
        apply_hitting_stats(
            players,
            args.season,
        )

    finalize_signals(
        players
    )

    output = {
        "schema_version": "1.0",
        "season": args.season,
        "updated_at":
            datetime.now(
                timezone.utc
            ).isoformat(),
        "players": dict(
            sorted(
                players.items(),
                key=lambda item:
                    (
                        item[1].get(
                            "name"
                        ) or "",
                        item[0],
                    ),
            )
        ),
    }

    OUTPUT_FILE.write_text(
        json.dumps(
            output,
            ensure_ascii=False,
            separators=(",", ":"),
        ) + "\n",
        encoding="utf-8",
    )

    print(
        f"Wrote {len(players)} profiles "
        f"to {OUTPUT_FILE}."
    )


if __name__ == "__main__":
    main()
