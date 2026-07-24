from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
from typing import Any
import json
import sys
import urllib.parse
import urllib.request
import csv
import gzip
import io
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import os

try:
    from .fangraphs import fetch_team_wrc_plus
except ImportError:
    from fangraphs import fetch_team_wrc_plus


MLB_API_BASE = "https://statsapi.mlb.com/api/v1"

OFFENSE_METRICS = (
    "AVG",
    "OBP",
    "SLG",
    "OPS",
    "ISO",
    "wRC+",
    "BB%",
    "K%",
)

OFFENSE_CACHE_SCHEMA = 5

# Recent Statcast day files are refreshed because
# Baseball Savant can return empty or partial data
# while games are still being processed.
STATCAST_RECENT_CACHE_DAYS = 14

# A rank based on only one or two clubs is not a
# meaningful league comparison. The raw value remains
# available, but the rank and timeframe signal are
# suppressed until this many teams qualify.
MIN_OFFENSE_RANK_COVERAGE = 10

_STATCAST_DAY_MEMORY_CACHE: dict[
    str,
    list[dict[str, Any]],
] = {}


# OFFENSE_ISO_WRC_V2
def add_offense_derived_metrics(
    stats: dict[str, Any],
) -> dict[str, Any]:
    if not isinstance(stats, dict):
        return stats

    avg = stats.get("AVG")
    slg = stats.get("SLG")

    if (
        isinstance(avg, (int, float))
        and isinstance(slg, (int, float))
    ):
        stats["ISO"] = (
            float(slg) - float(avg)
        )
    elif stats:
        stats["ISO"] = None

    return stats


def merge_team_wrc_plus(
    rows: dict[int, dict[str, Any]],
    values: dict[int, float],
) -> None:
    for team_id in MLB_TEAM_IDS:
        row = rows.setdefault(
            team_id,
            {},
        )

        value = values.get(team_id)

        if isinstance(value, (int, float)):
            row["wRC+"] = float(value)
        elif row:
            row["wRC+"] = None


def metric_coverage(
    rows: dict[int, dict[str, Any]],
) -> dict[str, int]:
    return {
        metric: sum(
            1
            for stats in rows.values()
            if isinstance(
                stats.get(metric),
                (int, float),
            )
        )
        for metric in OFFENSE_METRICS
    }


def fetch_wrc_plus_matrix(
    windows: dict[
        str,
        tuple[date, date],
    ],
    locations: tuple[str, ...],
) -> dict[
    tuple[str, str, str],
    dict[int, float],
]:
    tasks = []

    for (
        timeframe,
        (
            window_start,
            window_end,
        ),
    ) in windows.items():
        for location in locations:
            for hand in (
                "overall",
                "vs_lhp",
                "vs_rhp",
            ):
                tasks.append(
                    (
                        timeframe,
                        location,
                        hand,
                        window_start,
                        window_end,
                    )
                )

    workers = max(
        1,
        min(
            int(
                os.getenv(
                    "BORING_BETS_FANGRAPHS_WORKERS",
                    "3",
                )
            ),
            5,
        ),
    )

    result: dict[
        tuple[str, str, str],
        dict[int, float],
    ] = {}

    failures = []

    with ThreadPoolExecutor(
        max_workers=workers
    ) as executor:
        futures = {
            executor.submit(
                fetch_team_wrc_plus,
                window_start,
                window_end,
                location,
                hand,
            ): (
                timeframe,
                location,
                hand,
            )
            for (
                timeframe,
                location,
                hand,
                window_start,
                window_end,
            ) in tasks
        }

        for future in as_completed(futures):
            key = futures[future]

            try:
                values = future.result()

                result[key] = (
                    values
                    if isinstance(values, dict)
                    else {}
                )
            except Exception as error:
                result[key] = {}

                failures.append(
                    f"{key[0]}/{key[1]}/{key[2]}: "
                    f"{error}"
                )

    coverages = [
        len(values)
        for values in result.values()
    ]

    if coverages:
        print(
            "FanGraphs wRC+ pools: "
            f"{len(coverages)} fetched; "
            f"team coverage "
            f"{min(coverages)}-"
            f"{max(coverages)}."
        )

    if failures:
        print(
            "FanGraphs wRC+ warnings: "
            f"{len(failures)} pool(s) unavailable."
        )

        for warning in failures[:3]:
            print(" ", warning)

    return result



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


def fetch_team_hitting_stats(
    team_id: int,
    stat_type: str,
    season: int,
    start_date: str | None = None,
    end_date: str | None = None,
    sit_code: str | None = None,
) -> dict[str, Any]:
    effective_stat_type = "statSplits" if sit_code else stat_type
    params: dict[str, Any] = {
        "stats": effective_stat_type,
        "group": "hitting",
        "season": season,
    }

    if start_date:
        params["startDate"] = start_date

    if end_date:
        params["endDate"] = end_date

    if sit_code:
        # MLB expects a single comma-separated situation expression. Repeated
        # sitCodes parameters are treated as separate splits and the old parser
        # then selected only the first one, making Home/Away appear identical.
        params["sitCodes"] = ",".join(
            part.strip() for part in sit_code.split(",") if part.strip()
        )

    query = urllib.parse.urlencode(params)

    raw = get_json(
        f"{MLB_API_BASE}/teams/"
        f"{team_id}/stats?{query}"
    )

    return parse_team_hitting_block(
        raw
    )


def parse_team_hitting_block(
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

        return normalize_team_hitting_stat(
            stat
        )

    return {}


def normalize_team_hitting_stat(
    stat: dict[str, Any],
) -> dict[str, Any]:
    plate_appearances = to_float(
        stat.get("plateAppearances")
    )

    strikeouts = to_float(
        stat.get("strikeOuts")
    )

    walks = to_float(
        stat.get("baseOnBalls")
    )

    return {
        "AVG": to_float(
            stat.get("avg")
        ),
        "wRC+": None,
        "K%": rate_percent(
            strikeouts,
            plate_appearances,
        ),
        "BB%": rate_percent(
            walks,
            plate_appearances,
        ),
        "OBP": to_float(
            stat.get("obp")
        ),
        "SLG": to_float(
            stat.get("slg")
        ),
        "OPS": to_float(
            stat.get("ops")
        ),
        "plate_appearances":
            to_int(
                stat.get("plateAppearances")
            ),
        "runs":
            to_int(
                stat.get("runs")
            ),
        "home_runs":
            to_int(
                stat.get("homeRuns")
            ),
        "strikeouts":
            to_int(
                stat.get("strikeOuts")
            ),
        "walks":
            to_int(
                stat.get("baseOnBalls")
            ),
    }


def fetch_safe_split(
    team_id: int,
    season: int,
    sit_code: str,
) -> dict[str, Any]:
    try:
        return fetch_team_hitting_stats(
            team_id=team_id,
            stat_type="statSplits",
            season=season,
            sit_code=sit_code,
        )
    except Exception as error:
        print(
            f"Team split {sit_code} unavailable "
            f"for team {team_id}: {error}"
        )
        return {}



MLB_TEAM_IDS = (
    108, 109, 110, 111, 112, 113, 114, 115, 116, 117,
    118, 119, 120, 121, 133, 134, 135, 136, 137, 138,
    139, 140, 141, 142, 143, 144, 145, 146, 147, 158,
)



def fetch_team_hitting_game_log(team_id: int, season: int) -> list[dict[str, Any]]:
    params = urllib.parse.urlencode({
        "stats": "gameLog",
        "group": "hitting",
        "season": season,
    })
    raw = get_json(f"{MLB_API_BASE}/teams/{team_id}/stats?{params}")
    rows: list[dict[str, Any]] = []
    for group in raw.get("stats", []):
        for split in group.get("splits", []):
            stat = split.get("stat") or {}
            game = split.get("game") or {}
            home_away = (
                split.get("homeAway")
                or game.get("homeAway")
                or split.get("isHome")
            )
            if isinstance(home_away, bool):
                is_home = home_away
            elif isinstance(home_away, str):
                is_home = home_away.lower() == "home"
            else:
                is_home = None
            rows.append({
                "date": split.get("date") or split.get("gameDate"),
                "is_home": is_home,
                "stat": stat,
            })
    return rows


def aggregate_team_game_log(
    rows: list[dict[str, Any]],
    start_date: str | None,
    end_date: str | None,
    location: str,
) -> dict[str, Any]:
    start = datetime.strptime(start_date, "%Y-%m-%d").date() if start_date else None
    end = datetime.strptime(end_date, "%Y-%m-%d").date() if end_date else None
    totals = {
        "atBats": 0.0, "hits": 0.0, "baseOnBalls": 0.0,
        "hitByPitch": 0.0, "sacFlies": 0.0, "totalBases": 0.0,
        "strikeOuts": 0.0, "plateAppearances": 0.0,
        "runs": 0.0, "homeRuns": 0.0,
    }
    games = 0
    for row in rows:
        raw_date = row.get("date")
        try:
            current = datetime.strptime(str(raw_date)[:10], "%Y-%m-%d").date()
        except (TypeError, ValueError):
            continue
        if start and current < start:
            continue
        if end and current > end:
            continue
        is_home = row.get("is_home")
        if location == "home" and is_home is not True:
            continue
        if location == "away" and is_home is not False:
            continue
        stat = row.get("stat") or {}
        for key in totals:
            value = to_float(stat.get(key))
            if value is not None:
                totals[key] += value
        games += 1
    if games == 0:
        return {}
    ab, hits = totals["atBats"], totals["hits"]
    bb, hbp, sf = totals["baseOnBalls"], totals["hitByPitch"], totals["sacFlies"]
    pa = totals["plateAppearances"]
    avg = hits / ab if ab else None
    obp_den = ab + bb + hbp + sf
    obp = (hits + bb + hbp) / obp_den if obp_den else None
    slg = totals["totalBases"] / ab if ab else None
    return {
        "AVG": avg,
        "OBP": obp,
        "SLG": slg,
        "OPS": (obp + slg) if obp is not None and slg is not None else None,
        "wRC+": None,
        "BB%": rate_percent(bb, pa),
        "K%": rate_percent(totals["strikeOuts"], pa),
        "plate_appearances": int(pa),
        "runs": int(totals["runs"]),
        "home_runs": int(totals["homeRuns"]),
        "strikeouts": int(totals["strikeOuts"]),
        "walks": int(bb),
        "games": games,
    }


def fetch_all_team_game_logs(season: int) -> dict[int, list[dict[str, Any]]]:
    workers = max(2, min(int(os.getenv("BORING_BETS_MLB_FETCH_WORKERS", "10")), 16))
    result: dict[int, list[dict[str, Any]]] = {}
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {
            executor.submit(fetch_team_hitting_game_log, team_id, season): team_id
            for team_id in MLB_TEAM_IDS
        }
        for future in as_completed(futures):
            team_id = futures[future]
            try:
                result[team_id] = future.result()
            except Exception as error:
                print(f"Team game log unavailable for {team_id}: {error}")
                result[team_id] = []
    return result


TEAM_ABBR_TO_MLB_ID = {
    "LAA": 108, "ARI": 109, "AZ": 109, "BAL": 110, "BOS": 111, "CHC": 112,
    "CIN": 113, "CLE": 114, "COL": 115, "DET": 116, "HOU": 117,
    "KC": 118, "KCR": 118, "LAD": 119, "WSH": 120, "WSN": 120,
    "NYM": 121, "ATH": 133, "OAK": 133, "PIT": 134, "SD": 135,
    "SDP": 135, "SEA": 136, "SF": 137, "SFG": 137, "STL": 138,
    "TB": 139, "TBR": 139, "TEX": 140, "TOR": 141, "MIN": 142,
    "PHI": 143, "ATL": 144, "CWS": 145, "CHW": 145, "MIA": 146,
    "NYY": 147, "MIL": 158,
}

STATCAST_CSV_URL = "https://baseballsavant.mlb.com/statcast_search/csv"
STATCAST_TERMINAL_EVENTS = {
    "single", "double", "triple", "home_run",
    "field_out", "force_out", "grounded_into_double_play",
    "field_error", "fielders_choice", "fielders_choice_out",
    "double_play", "triple_play", "strikeout", "strikeout_double_play",
    "walk", "intent_walk", "hit_by_pitch", "sac_fly", "sac_bunt",
    "catcher_interf",
}
STATCAST_HITS = {"single": 1, "double": 2, "triple": 3, "home_run": 4}
STATCAST_NON_AB = {"walk", "intent_walk", "hit_by_pitch", "sac_fly", "sac_bunt", "catcher_interf"}


def _statcast_cache_dir() -> Path:
    root = Path(__file__).resolve().parents[2]
    cache_dir = root / "data" / "cache" / "statcast-offense"
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir


def _statcast_day_cache_path(day_text: str) -> Path:
    return _statcast_cache_dir() / f"{day_text}.json.gz"


def _statcast_url(day_text: str) -> str:
    params = {
        "all": "true", "type": "details", "player_type": "pitcher",
        "game_date_gt": day_text, "game_date_lt": day_text,
        "hfGT": "R|PO|S|", "group_by": "name", "sort_col": "pitches",
        "sort_order": "desc", "min_pitches": "0", "min_results": "0",
    }
    return f"{STATCAST_CSV_URL}?{urllib.parse.urlencode(params)}"


def fetch_statcast_terminal_pas(day_text: str) -> list[dict[str, Any]]:
    force_rebuild = (
        os.getenv(
            "BORING_BETS_REBUILD_STATCAST_OFFENSE"
        )
        == "1"
    )

    if day_text in _STATCAST_DAY_MEMORY_CACHE:
        return _STATCAST_DAY_MEMORY_CACHE[
            day_text
        ]

    cache_path = _statcast_day_cache_path(
        day_text
    )

    cached_rows: list[dict[str, Any]] | None = (
        None
    )

    if cache_path.exists():
        try:
            with gzip.open(
                cache_path,
                "rt",
                encoding="utf-8",
            ) as handle:
                loaded = json.load(handle)

            if isinstance(loaded, list):
                cached_rows = loaded

        except (
            OSError,
            json.JSONDecodeError,
        ):
            cached_rows = None

    recent_day = False

    try:
        parsed_day = date.fromisoformat(
            day_text
        )

        recent_day = (
            parsed_day
            >= date.today()
            - timedelta(
                days=STATCAST_RECENT_CACHE_DAYS
            )
        )

    except ValueError:
        recent_day = False

    if (
        cached_rows is not None
        and not force_rebuild
        and not recent_day
    ):
        _STATCAST_DAY_MEMORY_CACHE[
            day_text
        ] = cached_rows

        return cached_rows

    request = urllib.request.Request(
        _statcast_url(day_text),
        headers={
            "User-Agent": "Mozilla/5.0 BoringBets/1.0",
            "Accept": "text/csv,*/*",
            "Referer": "https://baseballsavant.mlb.com/statcast_search",
        },
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        text = response.read().decode("utf-8-sig", errors="replace")

    rows: list[dict[str, Any]] = []
    for row in csv.DictReader(io.StringIO(text)):
        event = str(row.get("events") or "").strip()
        if event not in STATCAST_TERMINAL_EVENTS:
            continue
        topbot = str(row.get("inning_topbot") or "").strip().lower()
        team_abbr = row.get("away_team") if topbot.startswith("top") else row.get("home_team")
        team_id = TEAM_ABBR_TO_MLB_ID.get(str(team_abbr or "").strip().upper())
        pitcher_hand = str(row.get("p_throws") or "").strip().upper()
        if team_id is None or pitcher_hand not in {"L", "R"}:
            continue
        rows.append({
            "team_id": team_id,
            "location": "away" if topbot.startswith("top") else "home",
            "pitcher_hand": pitcher_hand,
            "event": event,
            "game_pk": row.get("game_pk"),
            "at_bat_number": row.get("at_bat_number"),
        })

    # Do not replace a more complete recent cache
    # with a temporarily empty or truncated response.
    if cached_rows:
        cached_teams = {
            row.get("team_id")
            for row in cached_rows
            if isinstance(row, dict)
            and row.get("team_id") is not None
        }

        fetched_teams = {
            row.get("team_id")
            for row in rows
            if isinstance(row, dict)
            and row.get("team_id") is not None
        }

        if (
            len(fetched_teams)
            < len(cached_teams)
        ):
            rows = cached_rows

    with gzip.open(
        cache_path,
        "wt",
        encoding="utf-8",
    ) as handle:
        json.dump(
            rows,
            handle,
            separators=(",", ":"),
        )

    _STATCAST_DAY_MEMORY_CACHE[
        day_text
    ] = rows

    return rows


def fetch_statcast_range(start: date, end: date) -> list[dict[str, Any]]:
    if end < start:
        return []
    days: list[str] = []
    cursor = start
    while cursor <= end:
        days.append(cursor.isoformat())
        cursor += timedelta(days=1)
    workers = max(2, min(int(os.getenv("BORING_BETS_STATCAST_WORKERS", "8")), 12))
    collected: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(fetch_statcast_terminal_pas, day): day for day in days}
        for future in as_completed(futures):
            day = futures[future]
            try:
                collected.extend(future.result())
            except Exception as error:
                raise RuntimeError(f"Statcast offense fetch failed for {day}: {error}") from error
    return collected


def aggregate_statcast_pas(
    rows: list[dict[str, Any]],
    location: str,
    pitcher_hand: str,
) -> dict[int, dict[str, Any]]:
    totals: dict[int, dict[str, float]] = {
        team_id: {
            "pa": 0.0, "ab": 0.0, "hits": 0.0, "tb": 0.0,
            "bb": 0.0, "hbp": 0.0, "sf": 0.0, "so": 0.0,
        }
        for team_id in MLB_TEAM_IDS
    }
    for row in rows:
        if location != "all" and row.get("location") != location:
            continue
        if row.get("pitcher_hand") != pitcher_hand:
            continue
        team_id = row.get("team_id")
        if team_id not in totals:
            continue
        event = row.get("event")
        t = totals[team_id]
        t["pa"] += 1
        if event not in STATCAST_NON_AB:
            t["ab"] += 1
        if event in STATCAST_HITS:
            t["hits"] += 1
            t["tb"] += STATCAST_HITS[event]
        if event in {"walk", "intent_walk"}:
            t["bb"] += 1
        if event == "hit_by_pitch":
            t["hbp"] += 1
        if event == "sac_fly":
            t["sf"] += 1
        if event in {"strikeout", "strikeout_double_play"}:
            t["so"] += 1

    result: dict[int, dict[str, Any]] = {}
    for team_id, t in totals.items():
        pa, ab = t["pa"], t["ab"]
        if pa <= 0:
            result[team_id] = {}
            continue
        obp_den = ab + t["bb"] + t["hbp"] + t["sf"]
        avg = t["hits"] / ab if ab else None
        obp = (t["hits"] + t["bb"] + t["hbp"]) / obp_den if obp_den else None
        slg = t["tb"] / ab if ab else None
        result[team_id] = {
            "AVG": avg, "OBP": obp, "SLG": slg,
            "OPS": (obp + slg) if obp is not None and slg is not None else None,
            "wRC+": None,
            "BB%": rate_percent(t["bb"], pa),
            "K%": rate_percent(t["so"], pa),
            "plate_appearances": int(pa),
            "strikeouts": int(t["so"]), "walks": int(t["bb"]),
        }
    return result

def fetch_league_hitting_stats(
    stat_type: str,
    season: int,
    start_date: str | None = None,
    end_date: str | None = None,
    sit_codes: list[str] | None = None,
) -> dict[int, dict[str, Any]]:
    """Fetch one comparable team-level snapshot for all 30 MLB clubs.

    MLB's league `/stats` endpoint does not reliably return team rows for these
    filters. We therefore query the 30 team endpoints in parallel. This is
    slower on the first run but correct, and the completed matrix is cached.
    """
    workers = max(2, min(int(os.getenv("BORING_BETS_MLB_FETCH_WORKERS", "10")), 16))
    codes = list(sit_codes or [])

    def fetch_one(team_id: int) -> tuple[int, dict[str, Any]]:
        return team_id, fetch_team_hitting_stats(
            team_id=team_id,
            stat_type=stat_type,
            season=season,
            start_date=start_date,
            end_date=end_date,
            sit_code=",".join(codes) if codes else None,
        )

    teams: dict[int, dict[str, Any]] = {}
    errors: list[str] = []
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(fetch_one, team_id): team_id for team_id in MLB_TEAM_IDS}
        for future in as_completed(futures):
            team_id = futures[future]
            try:
                fetched_team_id, stats = future.result()
                teams[fetched_team_id] = stats
            except Exception as error:
                errors.append(f"{team_id}: {error}")

    if errors:
        print(f"League matrix request warnings ({len(errors)}): " + "; ".join(errors[:3]))

    # Keep all 30 team IDs in the pool even when a club has no qualifying PA
    # for a narrow window. Such teams receive null values, not a fake rank.
    for team_id in MLB_TEAM_IDS:
        teams.setdefault(team_id, {})
    return teams


def rank_league_rows(
    rows: dict[int, dict[str, Any]],
) -> dict[
    int,
    dict[str, int | None],
]:
    directions = {
        "AVG": True,
        "OBP": True,
        "SLG": True,
        "OPS": True,
        "ISO": True,
        "wRC+": True,
        "BB%": True,
        "K%": False,
    }

    result: dict[
        int,
        dict[str, int | None],
    ] = {
        team_id: {}
        for team_id in rows
    }

    for stats in rows.values():
        add_offense_derived_metrics(
            stats
        )

    for (
        metric,
        higher_is_better,
    ) in directions.items():
        values = [
            (
                team_id,
                stats.get(metric),
            )
            for (
                team_id,
                stats,
            ) in rows.items()
        ]

        values = [
            (
                team_id,
                float(value),
            )
            for team_id, value in values
            if isinstance(
                value,
                (int, float),
            )
        ]

        values.sort(
            key=lambda item: item[1],
            reverse=higher_is_better,
        )

        previous_value = None
        previous_rank = 0

        for (
            index,
            (
                team_id,
                value,
            ),
        ) in enumerate(
            values,
            start=1,
        ):
            rank = (
                previous_rank
                if previous_value == value
                else index
            )

            result.setdefault(
                team_id,
                {},
            )[metric] = rank

            previous_value = value
            previous_rank = rank

    return result



def _cache_path(target_date: str) -> Path:
    root = Path(__file__).resolve().parents[2]
    cache_dir = root / "data" / "cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir / f"mlb-offense-rank-matrix-{target_date}.json"


def _matrix_is_complete(
    cache: dict[str, Any],
) -> bool:
    try:
        if (
            int(
                cache.get(
                    "schema_version",
                    0,
                )
            )
            != OFFENSE_CACHE_SCHEMA
        ):
            return False

        for timeframe in (
            "last_7",
            "last_30",
            "season",
        ):
            for location in (
                "all",
                "home",
                "away",
            ):
                for hand in (
                    "overall",
                    "vs_lhp",
                    "vs_rhp",
                ):
                    pool = (
                        cache[timeframe]
                        [location]
                        [hand]
                    )

                    if (
                        int(
                            pool.get(
                                "team_pool",
                                0,
                            )
                        )
                        != 30
                    ):
                        return False

                    coverage = (
                        pool.get(
                            "metric_coverage"
                        )
                    )

                    if not isinstance(
                        coverage,
                        dict,
                    ):
                        return False

                    if (
                        "ISO" not in coverage
                        or "wRC+" not in coverage
                    ):
                        return False

        return True

    except (
        KeyError,
        TypeError,
        ValueError,
    ):
        return False



def build_league_offense_cache(
    target_date: str,
) -> dict[str, Any]:
    """Build exact pregame offense pools with ISO and wRC+."""

    cache_path = _cache_path(
        target_date
    )

    if (
        cache_path.exists()
        and os.getenv(
            "BORING_BETS_REBUILD_RANK_CACHE"
        )
        != "1"
    ):
        try:
            cached = json.loads(
                cache_path.read_text(
                    encoding="utf-8"
                )
            )

            if (
                _matrix_is_complete(cached)
                and cached.get(
                    "pregame_cutoff"
                )
                is True
            ):
                print(
                    "Using cached pregame offense matrix: "
                    f"{cache_path.name}"
                )

                return cached

        except (
            OSError,
            json.JSONDecodeError,
        ):
            pass

    target = datetime.strptime(
        target_date,
        "%Y-%m-%d",
    ).date()

    # Future games must use the latest completed offensive data.
    # Never ask providers for statistics through a date that has not happened.
    eastern_today = datetime.now(
        ZoneInfo("America/New_York")
    ).date()

    cutoff = min(
        target - timedelta(days=1),
        eastern_today - timedelta(days=1),
    )

    season_start = date(
        target.year,
        3,
        1,
    )

    windows = {
        "last_7": (
            cutoff - timedelta(days=6),
            cutoff,
        ),
        "last_30": (
            cutoff - timedelta(days=29),
            cutoff,
        ),
        "season": (
            season_start,
            cutoff,
        ),
    }

    locations = (
        "all",
        "home",
        "away",
    )

    hands = {
        "vs_lhp": "L",
        "vs_rhp": "R",
    }

    cache: dict[str, Any] = {
        "schema_version":
            OFFENSE_CACHE_SCHEMA,
        "as_of": target_date,
        "cutoff_date":
            cutoff.isoformat(),
        "pregame_cutoff": True,
        "window_definition":
            "calendar_days_before_selected_game",
        "sources": {
            "overall":
                "MLB team game logs",
            "handedness":
                "Baseball Savant terminal plate appearances",
            "wrc_plus":
                "FanGraphs team split leaderboard",
        },
    }

    print(
        "Fetching all 30 team game logs "
        "for pregame All/Home/Away offense..."
    )

    team_game_logs = (
        fetch_all_team_game_logs(
            target.year
        )
    )

    print(
        "Fetching cached Statcast plate "
        f"appearances through "
        f"{cutoff.isoformat()}..."
    )

    season_events = (
        fetch_statcast_range(
            season_start,
            cutoff,
        )
    )

    print(
        "Fetching FanGraphs wRC+ "
        "for all exact offense filters..."
    )

    wrc_matrix = (
        fetch_wrc_plus_matrix(
            windows,
            locations,
        )
    )

    total_pools = (
        len(windows)
        * len(locations)
        * 3
    )

    completed = 0

    for (
        timeframe,
        (
            window_start,
            window_end,
        ),
    ) in windows.items():
        cache[timeframe] = {}

        window_events = (
            season_events
            if timeframe == "season"
            else fetch_statcast_range(
                window_start,
                window_end,
            )
        )

        for location in locations:
            cache[timeframe][
                location
            ] = {}

            completed += 1

            print(
                f"  Rank pool "
                f"{completed}/{total_pools}: "
                f"{timeframe} / "
                f"{location} / overall"
            )

            overall_rows = {
                team_id:
                    aggregate_team_game_log(
                        team_game_logs.get(
                            team_id,
                            [],
                        ),
                        window_start.isoformat(),
                        window_end.isoformat(),
                        location,
                    )
                for team_id in MLB_TEAM_IDS
            }

            for row in (
                overall_rows.values()
            ):
                add_offense_derived_metrics(
                    row
                )

            merge_team_wrc_plus(
                overall_rows,
                wrc_matrix.get(
                    (
                        timeframe,
                        location,
                        "overall",
                    ),
                    {},
                ),
            )

            overall_ranks = (
                rank_league_rows(
                    overall_rows
                )
            )

            cache[timeframe][
                location
            ]["overall"] = {
                "stats": overall_rows,
                "ranks": overall_ranks,
                "team_pool": 30,
                "coverage": sum(
                    1
                    for row
                    in overall_rows.values()
                    if row
                ),
                "metric_coverage":
                    metric_coverage(
                        overall_rows
                    ),
                "scope":
                    "all_30_mlb_teams_exact_pregame_filters",
                "source":
                    "MLB game logs + FanGraphs wRC+",
            }

            for (
                hand_key,
                hand,
            ) in hands.items():
                completed += 1

                print(
                    f"  Rank pool "
                    f"{completed}/{total_pools}: "
                    f"{timeframe} / "
                    f"{location} / "
                    f"{hand_key}"
                )

                split_rows = (
                    aggregate_statcast_pas(
                        window_events,
                        location,
                        hand,
                    )
                )

                for row in (
                    split_rows.values()
                ):
                    add_offense_derived_metrics(
                        row
                    )

                merge_team_wrc_plus(
                    split_rows,
                    wrc_matrix.get(
                        (
                            timeframe,
                            location,
                            hand_key,
                        ),
                        {},
                    ),
                )

                split_ranks = (
                    rank_league_rows(
                        split_rows
                    )
                )

                cache[timeframe][
                    location
                ][hand_key] = {
                    "stats": split_rows,
                    "ranks": split_ranks,
                    "team_pool": 30,
                    "coverage": sum(
                        1
                        for row
                        in split_rows.values()
                        if row
                    ),
                    "metric_coverage":
                        metric_coverage(
                            split_rows
                        ),
                    "scope":
                        "all_30_mlb_teams_exact_pregame_filters",
                    "source":
                        "Baseball Savant terminal plate appearances + FanGraphs wRC+",
                }

    cache_path.write_text(
        json.dumps(
            cache,
            indent=2,
        ),
        encoding="utf-8",
    )

    return cache



def apply_league_offense_cache(
    snapshot: dict[str, Any],
    league_cache: dict[str, Any],
) -> dict[str, Any]:
    team_id = int(
        snapshot["team_id"]
    )

    opponent_hand = str(
        snapshot.get(
            "opponent_throws"
        )
        or ""
    ).upper()

    hand_key = (
        "vs_lhp"
        if opponent_hand == "L"
        else (
            "vs_rhp"
            if opponent_hand == "R"
            else "overall"
        )
    )

    stats_root: dict[str, Any] = {}

    for timeframe in (
        "last_7",
        "last_30",
        "season",
    ):
        stats_root[timeframe] = {}

        for location in (
            "all",
            "home",
            "away",
        ):
            overall_pool = (
                league_cache
                .get(timeframe, {})
                .get(location, {})
                .get("overall", {})
            )

            split_pool = (
                league_cache
                .get(timeframe, {})
                .get(location, {})
                .get(hand_key, {})
            )

            overall_stats = (
                overall_pool.get(
                    "stats",
                    {},
                )
            )

            split_stats = (
                split_pool.get(
                    "stats",
                    {},
                )
            )

            overall_rank_map = (
                overall_pool.get(
                    "ranks",
                    {},
                )
            )

            split_rank_map = (
                split_pool.get(
                    "ranks",
                    {},
                )
            )

            overall = (
                overall_stats.get(
                    team_id,
                    overall_stats.get(
                        str(team_id),
                        {},
                    ),
                )
            )

            versus = (
                split_stats.get(
                    team_id,
                    split_stats.get(
                        str(team_id),
                        {},
                    ),
                )
            )

            overall_ranks = (
                overall_rank_map.get(
                    team_id,
                    overall_rank_map.get(
                        str(team_id),
                        {},
                    ),
                )
            )

            split_ranks = (
                split_rank_map.get(
                    team_id,
                    split_rank_map.get(
                        str(team_id),
                        {},
                    ),
                )
            )

            block = build_metric_block(
                overall,
                versus,
            )

            overall_coverage = (
                overall_pool.get(
                    "metric_coverage",
                    {},
                )
            )

            split_coverage = (
                split_pool.get(
                    "metric_coverage",
                    {},
                )
            )

            for (
                metric,
                row,
            ) in block.items():
                overall_metric_coverage = (
                    overall_coverage.get(
                        metric
                    )
                )

                split_metric_coverage = (
                    split_coverage.get(
                        metric
                    )
                )

                row["overall_rank"] = (
                    overall_ranks.get(
                        metric
                    )
                    if (
                        isinstance(
                            overall_metric_coverage,
                            int,
                        )
                        and overall_metric_coverage
                        >= MIN_OFFENSE_RANK_COVERAGE
                    )
                    else None
                )

                row[
                    "overall_rank_coverage"
                ] = (
                    overall_metric_coverage
                )

                row["vs_hand_rank"] = (
                    split_ranks.get(
                        metric
                    )
                    if (
                        isinstance(
                            split_metric_coverage,
                            int,
                        )
                        and split_metric_coverage
                        >= MIN_OFFENSE_RANK_COVERAGE
                    )
                    else None
                )

                row[
                    "vs_hand_rank_coverage"
                ] = (
                    split_metric_coverage
                )

            stats_root[
                timeframe
            ][location] = block

    snapshot["stats"] = stats_root

    snapshot["rank_scope"] = (
        "all_available_mlb_teams_exact_active_filters"
    )

    snapshot["source"] = (
        "MLB game logs + Baseball Savant "
        "date-bounded plate appearances + "
        "FanGraphs wRC+"
    )

    return snapshot



def build_metric_block(
    overall: dict[str, Any],
    versus_hand: dict[str, Any],
) -> dict[str, Any]:
    block: dict[str, Any] = {}

    for metric in OFFENSE_METRICS:
        block[metric] = {
            "overall":
                overall.get(metric),
            "overall_rank":
                None,
            "vs_hand":
                versus_hand.get(metric),
            "vs_hand_rank":
                None,
        }

    return block


def build_team_offense_snapshot(
    team_id: int,
    opponent_throws: str | None,
    target_date: str,
) -> dict[str, Any]:
    return {
        "team_id": team_id,
        "opponent_throws": str(opponent_throws or "").upper() or None,
        "stats": {},
        "raw_splits": {},
        "source": "MLB team game logs + Baseball Savant date-bounded plate appearances + FanGraphs wRC+",
        "as_of": target_date,
    }


def rate_percent(
    numerator: float | None,
    denominator: float | None,
) -> float | None:
    if (
        numerator is None
        or denominator is None
        or denominator <= 0
    ):
        return None

    return (
        numerator
        / denominator
        * 100
    )


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
            "Usage: python3 scripts/mlb/offense.py "
            "<team_id> [L|R] [YYYY-MM-DD]"
        )

    team_id = int(
        sys.argv[1]
    )

    opponent_throws = (
        sys.argv[2]
        if len(sys.argv) > 2
        else None
    )

    target_date = (
        sys.argv[3]
        if len(sys.argv) > 3
        else date.today().isoformat()
    )

    snapshot = build_team_offense_snapshot(
        team_id,
        opponent_throws,
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
