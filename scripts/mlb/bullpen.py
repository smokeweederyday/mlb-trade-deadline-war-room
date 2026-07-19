from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any
import json
import sys
import urllib.parse
import urllib.request


MLB_API_BASE = "https://statsapi.mlb.com/api/v1"


_FIP_CONSTANT_CACHE: dict[tuple[int, str], float | None] = {}


def fip_innings_to_outs(
    value: Any,
) -> int | None:
    if value is None or value == "":
        return None

    text = str(value).strip()
    whole_text, separator, partial_text = text.partition(".")

    try:
        whole = int(whole_text)
        partial = int(partial_text) if separator else 0
    except ValueError:
        return None

    if partial not in (0, 1, 2):
        return None

    return whole * 3 + partial


def first_stat_value(
    stat: dict[str, Any],
    *keys: str,
) -> Any:
    for key in keys:
        value = stat.get(key)

        if value is not None and value != "":
            return value

    return None


def calculate_fip(
    stat: dict[str, Any],
    constant: float | None,
) -> float | None:
    if constant is None:
        return None

    home_runs = to_float(
        first_stat_value(
            stat,
            "home_runs",
            "homeRuns",
        )
    )

    walks = to_float(
        first_stat_value(
            stat,
            "walks",
            "baseOnBalls",
        )
    )

    hit_batsmen = to_float(
        first_stat_value(
            stat,
            "hit_batsmen",
            "hitBatsmen",
            "hitByPitch",
        )
    )

    strikeouts = to_float(
        first_stat_value(
            stat,
            "strikeouts",
            "strikeOuts",
        )
    )

    outs = to_int(
        first_stat_value(
            stat,
            "outs",
            "outsPitched",
        )
    )

    if outs is None:
        outs = fip_innings_to_outs(
            first_stat_value(
                stat,
                "innings_pitched",
                "inningsPitched",
            )
        )

    if (
        home_runs is None
        or walks is None
        or hit_batsmen is None
        or strikeouts is None
        or outs is None
        or outs <= 0
    ):
        return None

    innings = outs / 3

    fip = (
        (
            13 * home_runs
            + 3 * (walks + hit_batsmen)
            - 2 * strikeouts
        )
        / innings
        + constant
    )

    return round(fip, 2)


def apply_calculated_fip(
    stat: dict[str, Any],
    constant: float | None,
) -> None:
    if stat:
        stat["fip"] = calculate_fip(
            stat,
            constant,
        )


def fetch_league_fip_constant(
    season: int,
    target_date: str,
) -> float | None:
    requested_date = datetime.strptime(
        target_date,
        "%Y-%m-%d",
    ).date()

    effective_date = min(
        requested_date,
        date.today(),
    )

    end_date = effective_date.isoformat()
    cache_key = (season, end_date)

    if cache_key in _FIP_CONSTANT_CACHE:
        return _FIP_CONSTANT_CACHE[cache_key]

    params = urllib.parse.urlencode(
        {
            "stats": "byDateRange",
            "group": "pitching",
            "sportIds": 1,
            "playerPool": "ALL",
            "season": season,
            "startDate": f"{season}-01-01",
            "endDate": end_date,
            "limit": 5000,
        }
    )

    try:
        raw = get_json(
            f"{MLB_API_BASE}/stats?{params}"
        )
    except Exception as error:
        print(
            "FIP constant unavailable "
            f"for {end_date}: {error}"
        )
        _FIP_CONSTANT_CACHE[cache_key] = None
        return None

    totals = {
        "outs": 0,
        "earned_runs": 0,
        "home_runs": 0,
        "walks": 0,
        "hit_batsmen": 0,
        "strikeouts": 0,
    }

    for group in raw.get("stats", []):
        for split in group.get("splits", []):
            stat = split.get("stat", {})

            outs = to_int(
                stat.get("outs")
                or stat.get("outsPitched")
            )

            if outs is None:
                outs = fip_innings_to_outs(
                    stat.get("inningsPitched")
                )

            if outs is None or outs <= 0:
                continue

            totals["outs"] += outs
            totals["earned_runs"] += (
                to_int(stat.get("earnedRuns")) or 0
            )
            totals["home_runs"] += (
                to_int(stat.get("homeRuns")) or 0
            )
            totals["walks"] += (
                to_int(stat.get("baseOnBalls")) or 0
            )
            totals["hit_batsmen"] += (
                to_int(
                    stat.get("hitBatsmen")
                    or stat.get("hitByPitch")
                )
                or 0
            )
            totals["strikeouts"] += (
                to_int(stat.get("strikeOuts")) or 0
            )

    outs = totals["outs"]

    if outs <= 0:
        _FIP_CONSTANT_CACHE[cache_key] = None
        return None

    league_era = (
        totals["earned_runs"] * 27 / outs
    )

    raw_league_fip = (
        (
            13 * totals["home_runs"]
            + 3 * (
                totals["walks"]
                + totals["hit_batsmen"]
            )
            - 2 * totals["strikeouts"]
        )
        * 3
        / outs
    )

    constant = round(
        league_era - raw_league_fip,
        4,
    )

    _FIP_CONSTANT_CACHE[cache_key] = constant
    return constant


def get_json(
    url: str,
) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Boring Bets/1.0"
        },
    )

    with urllib.request.urlopen(
        request,
        timeout=30,
    ) as response:
        return json.loads(
            response.read()
        )


def fetch_team_pitching_stats(
    team_id: int,
    stat_type: str,
    season: int,
    start_date: str | None = None,
    end_date: str | None = None,
    sit_code: str | None = None,
) -> dict[str, Any]:
    params: dict[str, Any] = {
        "stats": stat_type,
        "group": "pitching",
        "season": season,
    }

    if start_date:
        params["startDate"] = start_date

    if end_date:
        params["endDate"] = end_date

    if sit_code:
        params["sitCodes"] = sit_code

    query = urllib.parse.urlencode(
        params
    )

    raw = get_json(
        f"{MLB_API_BASE}/teams/"
        f"{team_id}/stats?{query}"
    )

    return parse_pitching_stat_block(
        raw
    )


def parse_pitching_stat_block(
    raw: dict[str, Any],
) -> dict[str, Any]:
    for group in raw.get(
        "stats",
        [],
    ):
        splits = group.get(
            "splits",
            [],
        )

        if not splits:
            continue

        stat = splits[0].get(
            "stat",
            {},
        )

        return normalize_pitching_stat(
            stat
        )

    return {}


def normalize_pitching_stat(
    stat: dict[str, Any],
) -> dict[str, Any]:
    return {
        "era": to_float(
            stat.get("era")
        ),
        "whip": to_float(
            stat.get("whip")
        ),
        "fip": None,
        "innings_pitched":
            stat.get("inningsPitched"),
        "games": to_int(
            stat.get("gamesPlayed")
            or stat.get("gamesPitched")
        ),
        "wins": to_int(
            stat.get("wins")
        ),
        "losses": to_int(
            stat.get("losses")
        ),
        "saves": to_int(
            stat.get("saves")
        ),
        "save_opportunities": to_int(
            stat.get("saveOpportunities")
        ),
        "strikeouts": to_int(
            stat.get("strikeOuts")
        ),
        "walks": to_int(
            stat.get("baseOnBalls")
        ),
        "hits": to_int(
            stat.get("hits")
        ),
        "home_runs": to_int(
            stat.get("homeRuns")
        ),
        "hit_batsmen": to_int(
            stat.get("hitBatsmen")
            or stat.get("hitByPitch")
        ),
        "earned_runs": to_int(
            stat.get("earnedRuns")
        ),
    }


def fetch_relief_split(
    team_id: int,
    season: int,
) -> dict[str, Any]:
    return fetch_team_pitching_stats(
        team_id=team_id,
        stat_type="statSplits",
        season=season,
        sit_code="rp",
    )


def fetch_team_games(
    team_id: int,
    game_date: str,
) -> list[dict[str, Any]]:
    params = urllib.parse.urlencode(
        {
            "sportId": 1,
            "teamId": team_id,
            "date": game_date,
        }
    )

    raw = get_json(
        f"{MLB_API_BASE}/schedule?{params}"
    )

    games: list[dict[str, Any]] = []

    for date_block in raw.get(
        "dates",
        [],
    ):
        games.extend(
            date_block.get(
                "games",
                [],
            )
        )

    return games


def fetch_boxscore(
    game_pk: int,
) -> dict[str, Any]:
    return get_json(
        f"{MLB_API_BASE}/game/"
        f"{game_pk}/boxscore"
    )


def find_team_side(
    boxscore: dict[str, Any],
    team_id: int,
) -> str | None:
    teams = boxscore.get(
        "teams",
        {},
    )

    for side in ("away", "home"):
        side_team_id = (
            teams
            .get(side, {})
            .get("team", {})
            .get("id")
        )

        if side_team_id == team_id:
            return side

    return None


def extract_relief_appearances(
    boxscore: dict[str, Any],
    team_id: int,
) -> list[dict[str, Any]]:
    side = find_team_side(
        boxscore,
        team_id,
    )

    if not side:
        return []

    team_box = (
        boxscore
        .get("teams", {})
        .get(side, {})
    )

    pitcher_ids = team_box.get(
        "pitchers",
        [],
    )

    players = team_box.get(
        "players",
        {},
    )

    appearances = []

    for pitcher_id in pitcher_ids:
        player = players.get(
            f"ID{pitcher_id}",
            {},
        )

        pitching = (
            player
            .get("stats", {})
            .get("pitching", {})
        )

        games_started = to_int(
            pitching.get("gamesStarted")
        ) or 0

        outs = to_int(
            pitching.get("outs")
        ) or 0

        batters_faced = to_int(
            pitching.get("battersFaced")
        ) or 0

        if (
            games_started > 0
            or (
                outs <= 0
                and batters_faced <= 0
            )
        ):
            continue

        person = player.get(
            "person",
            {},
        )

        appearances.append(
            {
                "id": pitcher_id,
                "name": person.get(
                    "fullName",
                    f"Pitcher {pitcher_id}",
                ),
                "outs": outs,
                "innings_pitched":
                    pitching.get(
                        "inningsPitched"
                    ),
                "pitches": to_int(
                    pitching.get(
                        "numberOfPitches"
                    )
                ),
                "batters_faced":
                    batters_faced,
            }
        )

    return appearances


def fetch_relief_usage_for_date(
    team_id: int,
    game_date: str,
) -> list[dict[str, Any]]:
    appearances_by_id: dict[
        int,
        dict[str, Any],
    ] = {}

    for game in fetch_team_games(
        team_id,
        game_date,
    ):
        status = str(
            game
            .get("status", {})
            .get("abstractGameState", "")
        ).lower()

        if status not in {
            "final",
            "live",
        }:
            continue

        game_pk = game.get(
            "gamePk"
        )

        if not game_pk:
            continue

        try:
            boxscore = fetch_boxscore(
                int(game_pk)
            )
        except Exception as error:
            print(
                f"Could not load boxscore "
                f"{game_pk}: {error}"
            )
            continue

        for appearance in (
            extract_relief_appearances(
                boxscore,
                team_id,
            )
        ):
            pitcher_id = appearance["id"]
            existing = appearances_by_id.get(
                pitcher_id
            )

            if existing:
                existing["outs"] = (
                    to_int(existing.get("outs")) or 0
                ) + (
                    to_int(appearance.get("outs")) or 0
                )

                existing["pitches"] = (
                    to_int(existing.get("pitches")) or 0
                ) + (
                    to_int(appearance.get("pitches")) or 0
                )

                existing["batters_faced"] = (
                    to_int(
                        existing.get("batters_faced")
                    ) or 0
                ) + (
                    to_int(
                        appearance.get("batters_faced")
                    ) or 0
                )

                whole, partial = divmod(
                    existing["outs"],
                    3,
                )

                existing["innings_pitched"] = (
                    f"{whole}.{partial}"
                )
            else:
                appearances_by_id[
                    pitcher_id
                ] = appearance

    return list(
        appearances_by_id.values()
    )


def summarize_bullpen_usage_day(
    game_date: str,
    appearances: list[dict[str, Any]],
) -> dict[str, Any]:
    rows = [
        row
        for row in appearances
        if isinstance(row, dict)
    ]

    pitcher_ids = {
        to_int(row.get("id"))
        for row in rows
        if to_int(row.get("id")) is not None
    }

    total_pitches = sum(
        to_int(row.get("pitches")) or 0
        for row in rows
    )

    total_outs = sum(
        to_int(row.get("outs")) or 0
        for row in rows
    )

    whole_innings, partial_outs = divmod(
        total_outs,
        3,
    )

    return {
        "date": game_date,
        "pitchers": len(pitcher_ids),
        "pitches": total_pitches,
        "outs": total_outs,
        "innings_pitched":
            f"{whole_innings}.{partial_outs}",
        "appearances": rows,
    }


def build_bullpen_usage(
    team_id: int,
    target_date: str,
) -> dict[str, Any]:
    target = datetime.strptime(
        target_date,
        "%Y-%m-%d",
    ).date()

    day_dates = [
        (
            target - timedelta(days=days_ago)
        ).isoformat()
        for days_ago in (3, 2, 1)
    ]

    usage_days = []

    for game_date in day_dates:
        appearances = (
            fetch_relief_usage_for_date(
                team_id,
                game_date,
            )
        )

        usage_days.append(
            summarize_bullpen_usage_day(
                game_date,
                appearances,
            )
        )

    three_days_ago_day = usage_days[0]
    two_days_ago_day = usage_days[1]
    yesterday_day = usage_days[2]

    yesterday_ids = {
        pitcher["id"]
        for pitcher in yesterday_day["appearances"]
    }

    two_days_ago_ids = {
        pitcher["id"]
        for pitcher in two_days_ago_day["appearances"]
    }

    back_to_back_ids = (
        yesterday_ids
        & two_days_ago_ids
    )

    return {
        "used_yesterday":
            len(yesterday_ids),
        "back_to_back":
            len(back_to_back_ids),
        "fresh_leverage":
            None,
        "usage": {
            "three_days_ago_date":
                three_days_ago_day["date"],
            "two_days_ago_date":
                two_days_ago_day["date"],
            "yesterday_date":
                yesterday_day["date"],
            "used_three_days_ago":
                three_days_ago_day["appearances"],
            "used_two_days_ago":
                two_days_ago_day["appearances"],
            "used_yesterday":
                yesterday_day["appearances"],
            "back_to_back_pitcher_ids":
                sorted(back_to_back_ids),
            "days":
                usage_days,
        },
    }

def fetch_team_roster(
    team_id: int,
    roster_type: str,
) -> list[dict[str, Any]]:
    params = urllib.parse.urlencode(
        {
            "rosterType": roster_type,
        }
    )

    raw = get_json(
        f"{MLB_API_BASE}/teams/"
        f"{team_id}/roster?{params}"
    )

    return [
        row
        for row in raw.get("roster", [])
        if isinstance(row, dict)
    ]


def is_injured_roster_status(
    status: dict[str, Any],
) -> bool:
    code = str(
        status.get("code", "")
    ).upper()

    description = str(
        status.get("description", "")
    ).lower()

    return (
        code.startswith("D")
        or code.startswith("IL")
        or "injured" in description
        or "disabled" in description
    )


def fetch_people_relief_stats(
    pitcher_ids: list[int],
    season: int,
) -> list[dict[str, Any]]:
    if not pitcher_ids:
        return []

    hydrate = (
        "stats("
        "group=[pitching],"
        "type=[statSplits],"
        f"season={season},"
        "sitCodes=rp"
        ")"
    )

    params = urllib.parse.urlencode(
        {
            "personIds": ",".join(
                str(pitcher_id)
                for pitcher_id in pitcher_ids
            ),
            "hydrate": hydrate,
        }
    )

    raw = get_json(
        f"{MLB_API_BASE}/people?{params}"
    )

    return [
        person
        for person in raw.get("people", [])
        if isinstance(person, dict)
    ]


def find_person_relief_split(
    person: dict[str, Any],
) -> dict[str, Any] | None:
    for block in person.get("stats", []):
        for split in block.get("splits", []):
            if (
                split
                .get("split", {})
                .get("code")
                == "rp"
            ):
                return split

    return None


def infer_bullpen_roles(
    rows: list[dict[str, Any]],
) -> None:
    maximum_saves = max(
        (
            to_int(row.get("saves")) or 0
            for row in rows
        ),
        default=0,
    )

    maximum_holds = max(
        (
            to_int(row.get("holds")) or 0
            for row in rows
        ),
        default=0,
    )

    for row in rows:
        saves = to_int(
            row.get("saves")
        ) or 0

        holds = to_int(
            row.get("holds")
        ) or 0

        games = to_int(
            row.get("games")
        ) or 0

        games_finished = to_int(
            row.get("games_finished")
        ) or 0

        outs = to_int(
            row.get("outs")
        ) or 0

        average_outs = (
            outs / games
            if games > 0
            else 0
        )

        if (
            maximum_saves >= 3
            and saves == maximum_saves
        ):
            role = "CL"
        elif (
            holds >= 5
            and holds >= maximum_holds * 0.45
        ):
            role = "SU"
        elif average_outs >= 4.5:
            role = "LR"
        elif games_finished >= 8:
            role = "MR"
        else:
            role = "MR"

        row["role"] = role


def build_usage_pitch_maps(
    usage: dict[str, Any],
) -> list[dict[int, int]]:
    days = (
        usage
        .get("usage", {})
        .get("days", [])
    )

    chronological = [
        day
        for day in days
        if isinstance(day, dict)
    ][-3:]

    maps: list[dict[int, int]] = []

    # Reverse chronological:
    # yesterday, two days ago, three days ago.
    for day in reversed(chronological):
        pitch_map: dict[int, int] = {}

        for appearance in day.get(
            "appearances",
            [],
        ):
            pitcher_id = to_int(
                appearance.get("id")
            )

            if pitcher_id is None:
                continue

            pitch_map[pitcher_id] = (
                pitch_map.get(pitcher_id, 0)
                + (
                    to_int(
                        appearance.get("pitches")
                    ) or 0
                )
            )

        maps.append(pitch_map)

    while len(maps) < 3:
        maps.append({})

    return maps[:3]


def build_bullpen_roster(
    team_id: int,
    season: int,
    usage: dict[str, Any],
) -> list[dict[str, Any]]:
    active_roster = fetch_team_roster(
        team_id,
        "active",
    )

    forty_man_roster = fetch_team_roster(
        team_id,
        "40Man",
    )

    roster_by_id: dict[
        int,
        dict[str, Any],
    ] = {}

    for row in active_roster:
        if (
            row
            .get("position", {})
            .get("type")
            != "Pitcher"
        ):
            continue

        pitcher_id = to_int(
            row.get("person", {}).get("id")
        )

        if pitcher_id is None:
            continue

        roster_by_id[pitcher_id] = {
            "id": pitcher_id,
            "name":
                row.get("person", {}).get(
                    "fullName",
                    f"Pitcher {pitcher_id}",
                ),
            "active": True,
            "is_il": False,
            "status_code":
                row.get("status", {}).get(
                    "code",
                    "A",
                ),
            "status":
                row.get("status", {}).get(
                    "description",
                    "Active",
                ),
            "injury_note":
                row.get("note", ""),
        }

    for row in forty_man_roster:
        if (
            row
            .get("position", {})
            .get("type")
            != "Pitcher"
        ):
            continue

        status = row.get(
            "status",
            {},
        )

        if not is_injured_roster_status(
            status
        ):
            continue

        pitcher_id = to_int(
            row.get("person", {}).get("id")
        )

        if pitcher_id is None:
            continue

        roster_by_id[pitcher_id] = {
            "id": pitcher_id,
            "name":
                row.get("person", {}).get(
                    "fullName",
                    f"Pitcher {pitcher_id}",
                ),
            "active": False,
            "is_il": True,
            "status_code":
                status.get("code", "IL"),
            "status":
                status.get(
                    "description",
                    "Injured",
                ),
            "injury_note":
                row.get("note", ""),
        }

    people = fetch_people_relief_stats(
        sorted(roster_by_id),
        season,
    )

    pitches_1d, pitches_2d, pitches_3d = (
        build_usage_pitch_maps(usage)
    )

    rows: list[dict[str, Any]] = []

    for person in people:
        pitcher_id = to_int(
            person.get("id")
        )

        if (
            pitcher_id is None
            or pitcher_id not in roster_by_id
        ):
            continue

        split = find_person_relief_split(
            person
        )

        # This removes active starting pitchers while
        # retaining actual relievers and injured relievers
        # who have appeared from the bullpen this season.
        if not split:
            continue

        stat = split.get(
            "stat",
            {},
        )

        roster_row = roster_by_id[
            pitcher_id
        ]

        rows.append(
            {
                **roster_row,
                "innings_pitched":
                    stat.get(
                        "inningsPitched"
                    ),
                "outs":
                    to_int(
                        stat.get("outs")
                        or stat.get(
                            "outsPitched"
                        )
                    ),
                "games":
                    to_int(
                        stat.get("gamesPitched")
                        or stat.get(
                            "gamesPlayed"
                        )
                    ),
                "era":
                    to_float(
                        stat.get("era")
                    ),
                "home_runs":
                    to_int(
                        stat.get("homeRuns")
                    ),
                "walks":
                    to_int(
                        stat.get("baseOnBalls")
                    ),
                "hit_batsmen":
                    to_int(
                        stat.get("hitBatsmen")
                        or stat.get(
                            "hitByPitch"
                        )
                    ),
                "strikeouts":
                    to_int(
                        stat.get("strikeOuts")
                    ),
                "fip": None,
                "whip":
                    to_float(
                        stat.get("whip")
                    ),
                "k_per_9":
                    to_float(
                        stat.get(
                            "strikeoutsPer9Inn"
                        )
                    ),
                "bb_per_9":
                    to_float(
                        stat.get(
                            "walksPer9Inn"
                        )
                    ),
                "saves":
                    to_int(
                        stat.get("saves")
                    ),
                "holds":
                    to_int(
                        stat.get("holds")
                    ),
                "games_finished":
                    to_int(
                        stat.get(
                            "gamesFinished"
                        )
                    ),
                "pitches_1d":
                    pitches_1d.get(
                        pitcher_id,
                        0,
                    ),
                "pitches_2d":
                    pitches_2d.get(
                        pitcher_id,
                        0,
                    ),
                "pitches_3d":
                    pitches_3d.get(
                        pitcher_id,
                        0,
                    ),
            }
        )

    infer_bullpen_roles(rows)

    role_order = {
        "CL": 0,
        "SU": 1,
        "MR": 2,
        "LR": 3,
    }

    rows.sort(
        key=lambda row: (
            bool(row.get("is_il")),
            role_order.get(
                str(row.get("role")),
                9,
            ),
            -(
                to_int(
                    row.get("games")
                ) or 0
            ),
            str(row.get("name", "")),
        )
    )

    return rows


def build_bullpen_snapshot(
    team_id: int,
    target_date: str,
) -> dict[str, Any]:
    target = datetime.strptime(
        target_date,
        "%Y-%m-%d",
    ).date()

    season = target.year

    season_relief = fetch_relief_split(
        team_id,
        season,
    )

    fip_constant = fetch_league_fip_constant(
        season,
        target_date,
    )

    last_7 = fetch_team_pitching_stats(
        team_id=team_id,
        stat_type="byDateRange",
        season=season,
        start_date=(
            target - timedelta(days=7)
        ).isoformat(),
        end_date=target.isoformat(),
        sit_code="rp",
    )

    last_30 = fetch_team_pitching_stats(
        team_id=team_id,
        stat_type="byDateRange",
        season=season,
        start_date=(
            target - timedelta(days=30)
        ).isoformat(),
        end_date=target.isoformat(),
        sit_code="rp",
    )

    for stat_block in (
        season_relief,
        last_7,
        last_30,
    ):
        apply_calculated_fip(
            stat_block,
            fip_constant,
        )

    try:
        usage = build_bullpen_usage(
            team_id,
            target_date,
        )
    except Exception as error:
        print(
            "Bullpen usage unavailable "
            f"for team {team_id}: {error}"
        )

        usage = {
            "used_yesterday": None,
            "back_to_back": None,
            "fresh_leverage": None,
            "usage": {},
        }

    try:
        bullpen_roster = build_bullpen_roster(
            team_id,
            season,
            usage,
        )
    except Exception as error:
        print(
            "Bullpen roster unavailable "
            f"for team {team_id}: {error}"
        )

        bullpen_roster = []

    for reliever in bullpen_roster:
        apply_calculated_fip(
            reliever,
            fip_constant,
        )

    return {
        "team_id": team_id,
        "roster": bullpen_roster,
        "stats": {
            "last_7": {
                "all": last_7,
                "home": {},
                "away": {},
            },
            "last_30": {
                "all": last_30,
                "home": {},
                "away": {},
            },
            "season": {
                "all": season_relief,
                "home": {},
                "away": {},
            },
        },
        "used_yesterday":
            usage.get(
                "used_yesterday"
            ),
        "back_to_back":
            usage.get(
                "back_to_back"
            ),
        "fresh_leverage":
            usage.get(
                "fresh_leverage"
            ),
        "usage":
            usage.get(
                "usage",
                {},
            ),
        "notes": "",
        "details_url": "#",
    }


def to_float(
    value: Any,
) -> float | None:
    if value in {
        None,
        "",
        "-",
        ".---",
    }:
        return None

    try:
        return float(value)
    except (
        TypeError,
        ValueError,
    ):
        return None


def to_int(
    value: Any,
) -> int | None:
    if value in {
        None,
        "",
        "-",
    }:
        return None

    try:
        return int(value)
    except (
        TypeError,
        ValueError,
    ):
        return None


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit(
            "Usage: python3 scripts/mlb/bullpen.py "
            "<team_id> [YYYY-MM-DD]"
        )

    team_id = int(
        sys.argv[1]
    )

    target_date = (
        sys.argv[2]
        if len(sys.argv) > 2
        else date.today().isoformat()
    )

    snapshot = build_bullpen_snapshot(
        team_id,
        target_date,
    )

    print(
        json.dumps(
            snapshot,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
