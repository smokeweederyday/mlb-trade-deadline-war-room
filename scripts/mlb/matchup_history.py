from __future__ import annotations

from collections import defaultdict
from pathlib import Path
from typing import Any
import json
import urllib.parse
import urllib.request


MLB_LIVE_API_BASE = "https://statsapi.mlb.com/api/v1.1/game"

ROOT = Path(__file__).resolve().parents[2]
MATCHUP_CACHE_DIR = (
    ROOT
    / "data"
    / "cache"
    / "matchup-history"
    / "games"
)


HIT_BASES = {
    "single": 1,
    "double": 2,
    "triple": 3,
    "home_run": 4,
}

WALK_EVENTS = {
    "walk",
    "intent_walk",
}

STRIKEOUT_EVENTS = {
    "strikeout",
    "strikeout_double_play",
}

SAC_FLY_EVENTS = {
    "sac_fly",
}

SAC_BUNT_EVENTS = {
    "sac_bunt",
}

HIT_BY_PITCH_EVENTS = {
    "hit_by_pitch",
}

NON_AT_BAT_EVENTS = (
    WALK_EVENTS
    | SAC_FLY_EVENTS
    | SAC_BUNT_EVENTS
    | HIT_BY_PITCH_EVENTS
    | {"catcher_interf"}
)


def fetch_live_game(game_pk: int) -> dict[str, Any]:
    url = f"{MLB_LIVE_API_BASE}/{game_pk}/feed/live"
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "BoringBets/1.0",
            "Accept": "application/json",
        },
    )

    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read())


def empty_totals(
    batter_id: int,
    pitcher_id: int,
    batter_name: str | None = None,
    pitcher_name: str | None = None,
) -> dict[str, Any]:
    return {
        "batter_id": batter_id,
        "batter_name": batter_name,
        "pitcher_id": pitcher_id,
        "pitcher_name": pitcher_name,
        "plate_appearances": 0,
        "at_bats": 0,
        "hits": 0,
        "singles": 0,
        "doubles": 0,
        "triples": 0,
        "home_runs": 0,
        "total_bases": 0,
        "strikeouts": 0,
        "walks": 0,
        "intentional_walks": 0,
        "hit_by_pitch": 0,
        "sac_flies": 0,
        "sac_bunts": 0,
        "catcher_interference": 0,
    }


def add_plate_appearance(
    totals: dict[str, Any],
    event_type: str,
) -> None:
    totals["plate_appearances"] += 1

    if event_type not in NON_AT_BAT_EVENTS:
        totals["at_bats"] += 1

    if event_type in HIT_BASES:
        bases = HIT_BASES[event_type]
        totals["hits"] += 1
        totals["total_bases"] += bases

        if event_type == "single":
            totals["singles"] += 1
        elif event_type == "double":
            totals["doubles"] += 1
        elif event_type == "triple":
            totals["triples"] += 1
        elif event_type == "home_run":
            totals["home_runs"] += 1

    if event_type in STRIKEOUT_EVENTS:
        totals["strikeouts"] += 1

    if event_type in WALK_EVENTS:
        totals["walks"] += 1

    if event_type == "intent_walk":
        totals["intentional_walks"] += 1

    if event_type in HIT_BY_PITCH_EVENTS:
        totals["hit_by_pitch"] += 1

    if event_type in SAC_FLY_EVENTS:
        totals["sac_flies"] += 1

    if event_type in SAC_BUNT_EVENTS:
        totals["sac_bunts"] += 1

    if event_type == "catcher_interf":
        totals["catcher_interference"] += 1


def calculate_rates(
    totals: dict[str, Any],
) -> dict[str, Any]:
    row = dict(totals)

    pa = int(row.get("plate_appearances") or 0)
    ab = int(row.get("at_bats") or 0)
    hits = int(row.get("hits") or 0)
    walks = int(row.get("walks") or 0)
    hbp = int(row.get("hit_by_pitch") or 0)
    sac_flies = int(row.get("sac_flies") or 0)
    total_bases = int(row.get("total_bases") or 0)
    strikeouts = int(row.get("strikeouts") or 0)

    avg = hits / ab if ab else None

    obp_denominator = (
        ab
        + walks
        + hbp
        + sac_flies
    )

    obp = (
        (hits + walks + hbp) / obp_denominator
        if obp_denominator
        else None
    )

    slg = total_bases / ab if ab else None

    row["avg"] = round(avg, 3) if avg is not None else None
    row["obp"] = round(obp, 3) if obp is not None else None
    row["slg"] = round(slg, 3) if slg is not None else None
    row["ops"] = (
        round(obp + slg, 3)
        if obp is not None and slg is not None
        else None
    )
    row["strikeout_rate"] = round(strikeouts / pa, 3) if pa else None
    row["walk_rate"] = round(walks / pa, 3) if pa else None
    row["available"] = pa > 0

    return row


def summarize_game_matchups(
    raw_game: dict[str, Any],
) -> dict[tuple[int, int], dict[str, Any]]:
    totals_by_matchup: dict[
        tuple[int, int],
        dict[str, Any],
    ] = {}

    plays = (
        raw_game
        .get("liveData", {})
        .get("plays", {})
        .get("allPlays", [])
    )

    for play in plays:
        result = play.get("result") or {}

        if result.get("type") != "atBat":
            continue

        event_type = str(
            result.get("eventType") or ""
        ).strip()

        matchup = play.get("matchup") or {}
        batter = matchup.get("batter") or {}
        pitcher = matchup.get("pitcher") or {}

        batter_id = batter.get("id")
        pitcher_id = pitcher.get("id")

        if not batter_id or not pitcher_id or not event_type:
            continue

        key = (int(batter_id), int(pitcher_id))

        if key not in totals_by_matchup:
            totals_by_matchup[key] = empty_totals(
                batter_id=int(batter_id),
                pitcher_id=int(pitcher_id),
                batter_name=batter.get("fullName"),
                pitcher_name=pitcher.get("fullName"),
            )

        add_plate_appearance(
            totals_by_matchup[key],
            event_type,
        )

    return {
        key: calculate_rates(totals)
        for key, totals in totals_by_matchup.items()
    }


def merge_matchup_totals(
    existing: dict[str, Any],
    incoming: dict[str, Any],
) -> dict[str, Any]:
    merged = empty_totals(
        batter_id=int(incoming["batter_id"]),
        pitcher_id=int(incoming["pitcher_id"]),
        batter_name=incoming.get("batter_name"),
        pitcher_name=incoming.get("pitcher_name"),
    )

    count_fields = (
        "plate_appearances",
        "at_bats",
        "hits",
        "singles",
        "doubles",
        "triples",
        "home_runs",
        "total_bases",
        "strikeouts",
        "walks",
        "intentional_walks",
        "hit_by_pitch",
        "sac_flies",
        "sac_bunts",
        "catcher_interference",
    )

    for field in count_fields:
        merged[field] = (
            int(existing.get(field) or 0)
            + int(incoming.get(field) or 0)
        )

    return calculate_rates(merged)


def build_history_entering_games(
    games: list[dict[str, Any]],
) -> dict[str, dict[tuple[int, int], dict[str, Any]]]:
    ordered_games = sorted(
        games,
        key=lambda game: (
            game.get("date") or "",
            game.get("game_time") or "",
            game.get("id") or "",
        ),
    )

    cumulative: dict[
        tuple[int, int],
        dict[str, Any],
    ] = {}

    history_by_game: dict[
        str,
        dict[tuple[int, int], dict[str, Any]],
    ] = {}

    for game in ordered_games:
        game_id = str(game.get("id") or "")
        game_pk = game.get("mlb_game_pk")

        if not game_id:
            continue

        game_keys = relevant_matchup_keys(game)

        history_by_game[game_id] = {
            key: dict(cumulative[key])
            for key in game_keys
            if key in cumulative
        }

        if game.get("status") != "final" or not game_pk:
            continue

        raw = fetch_live_game(int(game_pk))
        game_rows = summarize_game_matchups(raw)

        for key, row in game_rows.items():
            if key in cumulative:
                cumulative[key] = merge_matchup_totals(
                    cumulative[key],
                    row,
                )
            else:
                cumulative[key] = dict(row)

    return history_by_game


def relevant_matchup_keys(
    game: dict[str, Any],
) -> set[tuple[int, int]]:
    keys: set[tuple[int, int]] = set()

    pitchers = game.get("pitchers") or {}
    lineups = game.get("lineups") or {}

    matchups = (
        (
            pitchers.get("away") or {},
            lineups.get("home") or {},
        ),
        (
            pitchers.get("home") or {},
            lineups.get("away") or {},
        ),
    )

    for pitcher, lineup in matchups:
        pitcher_id = pitcher.get("id")

        if not pitcher_id:
            continue

        for player in lineup.get("players") or []:
            batter_id = player.get("id")

            if batter_id:
                keys.add(
                    (
                        int(batter_id),
                        int(pitcher_id),
                    )
                )

    return keys


def fetch_pitcher_game_log(
    pitcher_id: int,
    season: int,
) -> list[dict[str, Any]]:
    params = urllib.parse.urlencode(
        {
            "stats": "gameLog",
            "group": "pitching",
            "season": season,
        }
    )

    url = (
        f"https://statsapi.mlb.com/api/v1/people/"
        f"{pitcher_id}/stats?{params}"
    )

    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "BoringBets/1.0",
            "Accept": "application/json",
        },
    )

    with urllib.request.urlopen(request, timeout=30) as response:
        raw = json.loads(response.read())

    groups = raw.get("stats", [])

    if not groups:
        return []

    return groups[0].get("splits", []) or []


def pitcher_game_index(
    pitcher_id: int,
    start_season: int,
    end_season: int,
    cutoff_date: str | None = None,
) -> list[dict[str, Any]]:
    indexed: dict[int, dict[str, Any]] = {}

    for season in range(start_season, end_season + 1):
        for split in fetch_pitcher_game_log(
            pitcher_id=pitcher_id,
            season=season,
        ):
            game = split.get("game") or {}
            game_pk = game.get("gamePk")
            game_date = split.get("date") or ""

            if not game_pk:
                continue

            if cutoff_date and game_date >= cutoff_date:
                continue

            indexed[int(game_pk)] = {
                "game_pk": int(game_pk),
                "date": game_date,
                "season": season,
            }

    return sorted(
        indexed.values(),
        key=lambda row: (
            row.get("date") or "",
            row.get("game_pk") or 0,
        ),
    )


def build_pitcher_career_history(
    pitcher_id: int,
    start_season: int,
    end_season: int,
    cutoff_date: str,
    batter_ids: set[int] | None = None,
) -> dict[int, dict[str, Any]]:
    career: dict[int, dict[str, Any]] = {}

    games = pitcher_game_index(
        pitcher_id=pitcher_id,
        start_season=start_season,
        end_season=end_season,
        cutoff_date=cutoff_date,
    )

    for game_number, indexed_game in enumerate(
        games,
        start=1,
    ):
        game_pk = int(
            indexed_game["game_pk"]
        )

        rows = load_or_build_game_matchups(
            game_pk
        )

        if (
            game_number == 1
            or game_number % 25 == 0
            or game_number == len(games)
        ):
            print(
                f"  Matchup history pitcher {pitcher_id}: "
                f"{game_number}/{len(games)} games"
            )

        for (batter_id, row_pitcher_id), row in rows.items():
            if row_pitcher_id != pitcher_id:
                continue

            if batter_ids is not None and batter_id not in batter_ids:
                continue

            if batter_id in career:
                career[batter_id] = merge_matchup_totals(
                    career[batter_id],
                    row,
                )
            else:
                career[batter_id] = dict(row)

    return career


def pitcher_debut_season(
    pitcher: dict[str, Any],
    fallback_season: int,
) -> int:
    debut_date = str(
        pitcher.get("mlb_debut_date")
        or pitcher.get("debut_date")
        or ""
    )

    if len(debut_date) >= 4 and debut_date[:4].isdigit():
        return int(debut_date[:4])

    return fallback_season


def build_game_career_bvp(
    game: dict[str, Any],
    debut_seasons: dict[int, int] | None = None,
) -> dict[str, Any]:
    game_date = str(game.get("date") or "")

    if len(game_date) < 4:
        return {
            "away_pitcher": {},
            "home_pitcher": {},
        }

    end_season = int(game_date[:4])
    debut_seasons = debut_seasons or {}

    output: dict[str, Any] = {
        "away_pitcher": {},
        "home_pitcher": {},
    }

    configurations = (
        (
            "away_pitcher",
            "away",
            "home",
        ),
        (
            "home_pitcher",
            "home",
            "away",
        ),
    )

    for output_key, pitcher_side, lineup_side in configurations:
        pitcher = (
            (game.get("pitchers") or {})
            .get(pitcher_side)
            or {}
        )

        lineup = (
            (game.get("lineups") or {})
            .get(lineup_side)
            or {}
        )

        pitcher_id = pitcher.get("id")

        players = [
            player
            for player in lineup.get("players") or []
            if player.get("id")
        ][:9]

        if not pitcher_id or not players:
            continue

        pitcher_id = int(pitcher_id)

        start_season = debut_seasons.get(
            pitcher_id,
            pitcher_debut_season(
                pitcher,
                fallback_season=max(
                    1876,
                    end_season - 20,
                ),
            ),
        )

        batter_ids = {
            int(player["id"])
            for player in players
        }

        career = build_pitcher_career_history(
            pitcher_id=pitcher_id,
            start_season=start_season,
            end_season=end_season,
            cutoff_date=game_date,
            batter_ids=batter_ids,
        )

        batter_rows: dict[str, Any] = {}

        for player in players:
            batter_id = int(player["id"])

            row = career.get(batter_id)

            if row:
                formatted = dict(row)
            else:
                formatted = calculate_rates(
                    empty_totals(
                        batter_id=batter_id,
                        pitcher_id=pitcher_id,
                        batter_name=player.get("name"),
                        pitcher_name=pitcher.get("name"),
                    )
                )

            formatted["name"] = (
                player.get("name")
                or formatted.get("batter_name")
                or "Unknown hitter"
            )
            formatted["order"] = player.get("order")
            formatted["source"] = (
                "MLB play-by-play career history entering game"
            )
            formatted["as_of_date"] = game_date

            batter_rows[str(batter_id)] = formatted

        output[output_key] = {
            "pitcher_id": pitcher_id,
            "pitcher_name": pitcher.get("name"),
            "batters": batter_rows,
            "source": "MLB play-by-play career history",
            "as_of_date": game_date,
            "history_scope": "career_entering_game",
        }

    return output


def matchup_game_cache_path(
    game_pk: int,
) -> Path:
    return (
        MATCHUP_CACHE_DIR
        / f"{int(game_pk)}.json"
    )


def serialize_matchup_rows(
    rows: dict[
        tuple[int, int],
        dict[str, Any],
    ],
) -> list[dict[str, Any]]:
    return [
        dict(row)
        for _, row in sorted(
            rows.items(),
            key=lambda item: (
                item[0][1],
                item[0][0],
            ),
        )
    ]


def deserialize_matchup_rows(
    rows: list[dict[str, Any]],
) -> dict[
    tuple[int, int],
    dict[str, Any],
]:
    output: dict[
        tuple[int, int],
        dict[str, Any],
    ] = {}

    for raw_row in rows:
        if not isinstance(raw_row, dict):
            continue

        batter_id = raw_row.get("batter_id")
        pitcher_id = raw_row.get("pitcher_id")

        try:
            key = (
                int(batter_id),
                int(pitcher_id),
            )
        except (
            TypeError,
            ValueError,
        ):
            continue

        output[key] = dict(raw_row)

    return output


def load_cached_game_matchups(
    game_pk: int,
) -> dict[
    tuple[int, int],
    dict[str, Any],
] | None:
    path = matchup_game_cache_path(
        game_pk
    )

    if not path.exists():
        return None

    try:
        payload = json.loads(
            path.read_text(
                encoding="utf-8"
            )
        )
    except (
        json.JSONDecodeError,
        OSError,
    ):
        return None

    if int(
        payload.get("game_pk")
        or 0
    ) != int(game_pk):
        return None

    rows = payload.get("matchups")

    if not isinstance(rows, list):
        return None

    return deserialize_matchup_rows(
        rows
    )


def save_cached_game_matchups(
    game_pk: int,
    rows: dict[
        tuple[int, int],
        dict[str, Any],
    ],
) -> None:
    MATCHUP_CACHE_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    path = matchup_game_cache_path(
        game_pk
    )

    payload = {
        "schema_version": "1.0",
        "game_pk": int(game_pk),
        "matchups": serialize_matchup_rows(
            rows
        ),
    }

    path.write_text(
        json.dumps(
            payload,
            indent=2,
        ) + "\n",
        encoding="utf-8",
    )


def load_or_build_game_matchups(
    game_pk: int,
) -> dict[
    tuple[int, int],
    dict[str, Any],
]:
    cached = load_cached_game_matchups(
        game_pk
    )

    if cached is not None:
        return cached

    raw = fetch_live_game(
        int(game_pk)
    )

    rows = summarize_game_matchups(
        raw
    )

    save_cached_game_matchups(
        game_pk,
        rows,
    )

    return rows
