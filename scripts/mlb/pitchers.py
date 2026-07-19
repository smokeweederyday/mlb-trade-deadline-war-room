from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any
from pathlib import Path
import json
import os
import sys
import urllib.parse
import urllib.request
import csv
import gzip
import io
import time
from concurrent.futures import ThreadPoolExecutor, as_completed


MLB_API_BASE = "https://statsapi.mlb.com/api/v1"


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


def fetch_pitcher_profile(
    pitcher_id: int,
) -> dict[str, Any]:
    raw = get_json(
        f"{MLB_API_BASE}/people/{pitcher_id}"
    )

    people = raw.get("people", [])

    if not people:
        return {
            "id": pitcher_id,
            "name": "Starter TBD",
            "age": None,
            "throws": None,
        }

    person = people[0]

    pitch_hand = person.get(
        "pitchHand",
        {},
    )

    return {
        "id": person.get(
            "id",
            pitcher_id,
        ),
        "name": person.get(
            "fullName",
            "Starter TBD",
        ),
        "age": person.get(
            "currentAge"
        ),
        "throws": pitch_hand.get(
            "code"
        ),
    }


def fetch_pitching_stats(
    pitcher_id: int,
    stat_type: str,
    season: int,
    start_date: str | None = None,
    end_date: str | None = None,
    sit_code: str | None = None,
) -> dict[str, Any]:
    params: dict[str, Any] = {
        "stats": "statSplits" if sit_code else stat_type,
        "group": "pitching",
        "season": season,
    }

    if start_date:
        params["startDate"] = start_date

    if end_date:
        params["endDate"] = end_date

    if sit_code:
        params["sitCodes"] = ",".join(
            part.strip() for part in sit_code.split(",") if part.strip()
        )

    query = urllib.parse.urlencode(
        params
    )

    raw = get_json(
        f"{MLB_API_BASE}/people/"
        f"{pitcher_id}/stats?{query}"
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


def add_pitcher_rate_metrics(
    stats: dict[str, Any],
) -> dict[str, Any]:
    """Add pitcher rates only when MLB supplies valid denominators."""

    batters_faced = stats.get("batters_faced")
    strikeouts = stats.get("strikeouts")
    walks = stats.get("walks")

    if isinstance(batters_faced, (int, float)) and batters_faced > 0:
        stats["k_rate"] = (
            round((float(strikeouts) / batters_faced) * 100, 1)
            if isinstance(strikeouts, (int, float))
            else None
        )

        stats["bb_rate"] = (
            round((float(walks) / batters_faced) * 100, 1)
            if isinstance(walks, (int, float))
            else None
        )
    else:
        stats["k_rate"] = None
        stats["bb_rate"] = None

    ground_outs = stats.get("ground_outs")
    air_outs = stats.get("air_outs")

    if (
        isinstance(ground_outs, (int, float))
        and isinstance(air_outs, (int, float))
        and air_outs > 0
    ):
        stats["go_ao"] = round(
            float(ground_outs) / float(air_outs),
            2,
        )
    else:
        stats["go_ao"] = None

    return stats


def normalize_pitching_stat(
    stat: dict[str, Any],
) -> dict[str, Any]:
    stats = {
        "era": to_float(
            stat.get("era")
        ),
        "whip": to_float(
            stat.get("whip")
        ),
        "fip": None,
        "xfip": None,
        "avg_against": to_float(
            stat.get("avg")
            or stat.get("avgAgainst")
        ),
        "innings_pitched":
            stat.get("inningsPitched"),
        "games": to_int(
            stat.get("gamesPlayed")
            or stat.get("gamesPitched")
        ),
        "games_started": to_int(
            stat.get("gamesStarted")
        ),
        "batters_faced": to_int(
            stat.get("battersFaced")
        ),
        "strikeouts": to_int(
            stat.get("strikeOuts")
        ),
        "walks": to_int(
            stat.get("baseOnBalls")
        ),
        "home_runs": to_int(
            stat.get("homeRuns")
        ),
        "ground_outs": to_int(
            stat.get("groundOuts")
        ),
        "air_outs": to_int(
            stat.get("airOuts")
            or stat.get("flyOuts")
        ),
        "hits": to_int(
            stat.get("hits")
        ),
        "earned_runs": to_int(
            stat.get("earnedRuns")
        ),
        "split_ops": to_float(
            stat.get("ops")
        ),
        "split_obp": to_float(
            stat.get("obp")
        ),
        "split_slg": to_float(
            stat.get("slg")
        ),
    }

    return add_pitcher_rate_metrics(stats)


LAST_START_COUNTS = (1, 3, 7, 10, 20)


def pitcher_innings_to_outs(
    value: Any,
) -> int | None:
    if value is None or value == "":
        return None

    whole_text, separator, partial_text = (
        str(value).strip().partition(".")
    )

    try:
        whole = int(whole_text)
        partial = (
            int(partial_text)
            if separator
            else 0
        )
    except ValueError:
        return None

    if partial not in (0, 1, 2):
        return None

    return whole * 3 + partial


def pitcher_game_log_location(
    split: dict[str, Any],
) -> bool | None:
    is_home = split.get("isHome")

    if isinstance(is_home, bool):
        return is_home

    game = split.get("game") or {}

    home_away = (
        split.get("homeAway")
        or game.get("homeAway")
    )

    if isinstance(home_away, str):
        normalized = home_away.strip().lower()

        if normalized == "home":
            return True

        if normalized == "away":
            return False

    return None


def fetch_pitcher_start_game_logs(
    pitcher_id: int,
    target_date: str,
) -> list[dict[str, Any]]:
    """Return starts strictly before the selected matchup date."""

    target = datetime.strptime(
        target_date,
        "%Y-%m-%d",
    ).date()

    rows_by_game: dict[
        str,
        dict[str, Any],
    ] = {}

    # Include the prior season so early-season
    # Last 10/20 selections can cross seasons.
    for season in (
        target.year - 1,
        target.year,
    ):
        params = urllib.parse.urlencode(
            {
                "stats": "gameLog",
                "group": "pitching",
                "season": season,
            }
        )

        raw = get_json(
            f"{MLB_API_BASE}/people/"
            f"{pitcher_id}/stats?{params}"
        )

        for group in raw.get("stats", []):
            for split in group.get(
                "splits",
                [],
            ):
                stat = split.get("stat") or {}

                # This is the critical rule:
                # relief appearances are never included.
                if (
                    to_int(
                        stat.get("gamesStarted")
                    )
                    or 0
                ) < 1:
                    continue

                raw_date = str(
                    split.get("date")
                    or split.get("gameDate")
                    or ""
                )[:10]

                try:
                    game_date = datetime.strptime(
                        raw_date,
                        "%Y-%m-%d",
                    ).date()
                except ValueError:
                    continue

                if game_date >= target:
                    continue

                game = split.get("game") or {}
                game_pk = game.get("gamePk")

                key = (
                    str(game_pk)
                    if game_pk
                    else (
                        f"{raw_date}-"
                        f"{season}-"
                        f"{len(rows_by_game)}"
                    )
                )

                rows_by_game[key] = {
                    "date": raw_date,
                    "game_pk": game_pk,
                    "is_home":
                        pitcher_game_log_location(
                            split
                        ),
                    "stat": stat,
                }

    return sorted(
        rows_by_game.values(),
        key=lambda row: (
            row.get("date") or "",
            row.get("game_pk") or 0,
        ),
    )


def aggregate_pitcher_start_rows(
    rows: list[dict[str, Any]],
) -> dict[str, Any]:
    if not rows:
        return {}

    totals = {
        "outs": 0,
        "at_bats": 0,
        "hits": 0,
        "earned_runs": 0,
        "walks": 0,
        "hit_batsmen": 0,
        "strikeouts": 0,
        "home_runs": 0,
        "batters_faced": 0,
        "ground_outs": 0,
        "air_outs": 0,
    }

    for row in rows:
        stat = row.get("stat") or {}

        outs = to_int(
            stat.get("outs")
            or stat.get("outsPitched")
        )

        if outs is None:
            outs = pitcher_innings_to_outs(
                stat.get("inningsPitched")
            )

        totals["outs"] += outs or 0
        totals["at_bats"] += (
            to_int(stat.get("atBats"))
            or 0
        )
        totals["hits"] += (
            to_int(stat.get("hits"))
            or 0
        )
        totals["earned_runs"] += (
            to_int(stat.get("earnedRuns"))
            or 0
        )
        totals["walks"] += (
            to_int(stat.get("baseOnBalls"))
            or 0
        )
        totals["hit_batsmen"] += (
            to_int(
                stat.get("hitBatsmen")
                or stat.get("hitByPitch")
            )
            or 0
        )
        totals["strikeouts"] += (
            to_int(stat.get("strikeOuts"))
            or 0
        )
        totals["home_runs"] += (
            to_int(stat.get("homeRuns"))
            or 0
        )
        totals["batters_faced"] += (
            to_int(stat.get("battersFaced"))
            or 0
        )
        totals["ground_outs"] += (
            to_int(stat.get("groundOuts"))
            or 0
        )
        totals["air_outs"] += (
            to_int(
                stat.get("airOuts")
                or stat.get("flyOuts")
            )
            or 0
        )

    outs = totals["outs"]

    if outs <= 0:
        return {}

    innings = outs / 3
    at_bats = totals["at_bats"]

    stats: dict[str, Any] = {
        "era": round(
            totals["earned_runs"]
            * 9
            / innings,
            2,
        ),
        "whip": round(
            (
                totals["hits"]
                + totals["walks"]
            )
            / innings,
            2,
        ),
        "fip": None,
        "xfip": None,
        "avg_against": (
            round(
                totals["hits"] / at_bats,
                3,
            )
            if at_bats
            else None
        ),
        "innings_pitched":
            f"{outs // 3}.{outs % 3}",
        "outs": outs,
        "games": len(rows),
        "games_started": len(rows),
        "batters_faced":
            totals["batters_faced"],
        "strikeouts":
            totals["strikeouts"],
        "walks":
            totals["walks"],
        "home_runs":
            totals["home_runs"],
        "hit_batsmen":
            totals["hit_batsmen"],
        "hit_by_pitch":
            totals["hit_batsmen"],
        "hbp":
            totals["hit_batsmen"],
        "ground_outs":
            totals["ground_outs"],
        "air_outs":
            totals["air_outs"],
        "fly_balls":
            totals["air_outs"],
        "hits":
            totals["hits"],
        "earned_runs":
            totals["earned_runs"],
        "start_dates": [
            row.get("date")
            for row in rows
        ],
        "sample_type": "starts",
    }

    add_pitcher_rate_metrics(stats)

    # Use the same FIP/xFIP calculators already
    # used by the existing pitcher rank engine.
    try:
        from mlb.intelligence import (
            add_fip,
            add_xfip,
        )

        add_fip(stats)
        add_xfip(stats)
    except Exception as error:
        print(
            "Last-start FIP/xFIP unavailable: "
            f"{error}"
        )

    return stats


def build_last_start_blocks(
    rows: list[dict[str, Any]],
) -> dict[str, Any]:
    output: dict[str, Any] = {}

    for requested_count in LAST_START_COUNTS:
        count_key = str(requested_count)
        output[count_key] = {}

        for location in (
            "all",
            "home",
            "away",
        ):
            eligible = [
                row
                for row in rows
                if (
                    location == "all"
                    or (
                        location == "home"
                        and row.get("is_home")
                        is True
                    )
                    or (
                        location == "away"
                        and row.get("is_home")
                        is False
                    )
                )
            ]

            selected = eligible[
                -requested_count:
            ]

            block = (
                aggregate_pitcher_start_rows(
                    selected
                )
            )

            if block:
                block["requested_starts"] = (
                    requested_count
                )
                block["starts_used"] = len(
                    selected
                )
                block["location"] = location

            output[count_key][location] = (
                block
            )

    return output


def fetch_safe_split(
    pitcher_id: int,
    season: int,
    sit_code: str,
) -> dict[str, Any]:
    """
    Fetch one season split without failing the full pitcher refresh.

    MLB's Stats API can return an empty split when a pitcher has no
    applicable appearances or when a split is not available.
    """

    try:
        return fetch_pitching_stats(
            pitcher_id=pitcher_id,
            stat_type="statSplits",
            season=season,
            sit_code=sit_code,
        )
    except Exception as error:
        print(
            f"Split {sit_code} unavailable "
            f"for pitcher {pitcher_id}: {error}"
        )
        return {}


def build_pitcher_snapshot(
    pitcher_id: int,
    target_date: str,
) -> dict[str, Any]:
    target = datetime.strptime(target_date, "%Y-%m-%d").date()
    season = target.year
    profile = fetch_pitcher_profile(pitcher_id)

    start_game_logs = (
        fetch_pitcher_start_game_logs(
            pitcher_id,
            target_date,
        )
    )

    windows = {
        "last_7": ("byDateRange", target - timedelta(days=7), target),
        "last_30": ("byDateRange", target - timedelta(days=30), target),
        "season": ("season", None, None),
    }
    locations = {"all": None, "home": "h", "away": "a"}
    stats_root: dict[str, Any] = {}

    for timeframe, (stat_type, start_date, end_date) in windows.items():
        stats_root[timeframe] = {}
        for location, location_code in locations.items():
            block = fetch_pitching_stats(
                pitcher_id=pitcher_id,
                stat_type=stat_type,
                season=season,
                start_date=start_date.isoformat() if start_date else None,
                end_date=end_date.isoformat() if end_date else None,
                sit_code=location_code,
            )
            # Fetch handedness within the exact same timeframe/location.
            lhh_codes = ",".join(code for code in (location_code, "vl") if code)
            rhh_codes = ",".join(code for code in (location_code, "vr") if code)
            block["vs_lhh"] = fetch_pitching_stats(
                pitcher_id=pitcher_id,
                stat_type=stat_type,
                season=season,
                start_date=start_date.isoformat() if start_date else None,
                end_date=end_date.isoformat() if end_date else None,
                sit_code=lhh_codes,
            )
            block["vs_rhh"] = fetch_pitching_stats(
                pitcher_id=pitcher_id,
                stat_type=stat_type,
                season=season,
                start_date=start_date.isoformat() if start_date else None,
                end_date=end_date.isoformat() if end_date else None,
                sit_code=rhh_codes,
            )
            for split_key, split_label in (("vs_lhh", "vs LHH"), ("vs_rhh", "vs RHH")):
                split_block = block.get(split_key) or {}
                split_block["era"] = None
                split_block["era_unavailable_reason"] = (
                    "MLB does not provide earned runs by batter handedness; "
                    "true split ERA cannot be calculated."
                )
                split_block["split_label"] = split_label
                block[split_key] = split_block
            stats_root[timeframe][location] = block

    stats_root["last_starts"] = (
        build_last_start_blocks(
            start_game_logs
        )
    )

    return {
        **profile,
        "status": "probable",
        "profile_url": f"pitcher.html?id={pitcher_id}",
        "stats": stats_root,
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
            "Usage: python3 scripts/mlb/pitchers.py "
            "<pitcher_id> [YYYY-MM-DD]"
        )

    pitcher_id = int(
        sys.argv[1]
    )

    target_date = (
        sys.argv[2]
        if len(sys.argv) > 2
        else date.today().isoformat()
    )

    snapshot = build_pitcher_snapshot(
        pitcher_id,
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



# ---------------------------------------------------------------------------
# Date-bounded pitcher handedness/location splits from Baseball Savant
# ---------------------------------------------------------------------------

STATCAST_CSV_URL = "https://baseballsavant.mlb.com/statcast_search/csv"
STATCAST_TERMINAL_EVENTS = {
    "single", "double", "triple", "home_run", "field_out", "force_out",
    "grounded_into_double_play", "field_error", "fielders_choice",
    "fielders_choice_out", "double_play", "triple_play", "strikeout",
    "strikeout_double_play", "walk", "intent_walk", "hit_by_pitch",
    "sac_fly", "sac_bunt", "catcher_interf",
}
STATCAST_HITS = {"single", "double", "triple", "home_run"}
STATCAST_OUTS = {
    "field_out": 1, "force_out": 1, "fielders_choice_out": 1,
    "strikeout": 1, "sac_fly": 1, "sac_bunt": 1,
    "grounded_into_double_play": 2, "double_play": 2,
    "strikeout_double_play": 2, "triple_play": 3,
}


def _pitcher_statcast_cache_dir() -> Path:
    root = Path(__file__).resolve().parents[2]
    cache_dir = root / "data" / "cache" / "statcast-pitcher-splits"
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir


def _pitcher_statcast_day_path(day_text: str) -> Path:
    return _pitcher_statcast_cache_dir() / f"{day_text}.json.gz"


def _pitcher_statcast_url(day_text: str) -> str:
    params = {
        "all": "true", "type": "details", "player_type": "pitcher",
        "game_date_gt": day_text, "game_date_lt": day_text,
        "hfGT": "R|PO|S|", "group_by": "name", "sort_col": "pitches",
        "sort_order": "desc", "min_pitches": "0", "min_results": "0",
    }
    return f"{STATCAST_CSV_URL}?{urllib.parse.urlencode(params)}"


def _read_pitcher_statcast_cache(cache_path: Path) -> list[dict[str, Any]] | None:
    if not cache_path.exists():
        return None
    try:
        with gzip.open(cache_path, "rt", encoding="utf-8") as handle:
            cached = json.load(handle)
        return cached if isinstance(cached, list) else None
    except (OSError, json.JSONDecodeError):
        return None


def fetch_pitcher_statcast_terminal_pas(day_text: str) -> list[dict[str, Any]]:
    cache_path = _pitcher_statcast_day_path(day_text)
    force = os.getenv("BORING_BETS_REBUILD_STATCAST_PITCHERS") == "1"
    cached = _read_pitcher_statcast_cache(cache_path)
    if cached is not None and not force:
        return cached

    request = urllib.request.Request(
        _pitcher_statcast_url(day_text),
        headers={
            "User-Agent": "Mozilla/5.0 BoringBets/1.0",
            "Accept": "text/csv,*/*",
            "Referer": "https://baseballsavant.mlb.com/statcast_search",
        },
    )

    attempts = max(1, int(os.getenv("BORING_BETS_STATCAST_RETRIES", "4")))
    last_error: Exception | None = None
    text: str | None = None
    for attempt in range(1, attempts + 1):
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                text = response.read().decode("utf-8-sig", errors="replace")
            break
        except Exception as error:
            last_error = error
            if attempt < attempts:
                delay = min(2 ** (attempt - 1), 8)
                print(
                    f"Statcast pitcher retry {attempt}/{attempts} for "
                    f"{day_text} after {error}; sleeping {delay}s..."
                )
                time.sleep(delay)

    if text is None:
        # A forced rebuild should prefer fresh data, but one transient Savant
        # outage must not throw away a previously valid cached date.
        if cached is not None:
            print(
                f"Statcast pitcher warning for {day_text}: {last_error}. "
                "Using existing cached day."
            )
            return cached
        print(
            f"Statcast pitcher warning for {day_text}: {last_error}. "
            "Skipping this date; affected split samples remain incomplete."
        )
        return []

    rows: list[dict[str, Any]] = []
    for row in csv.DictReader(io.StringIO(text)):
        event = str(row.get("events") or "").strip()
        if event not in STATCAST_TERMINAL_EVENTS:
            continue
        try:
            pitcher_id = int(row.get("pitcher") or 0)
        except (TypeError, ValueError):
            continue
        batter_side = str(row.get("stand") or "").strip().upper()
        if pitcher_id <= 0 or batter_side not in {"L", "R"}:
            continue
        topbot = str(row.get("inning_topbot") or "").strip().lower()
        pitcher_location = "home" if topbot.startswith("top") else "away"
        rows.append({
            "date": day_text,
            "pitcher_id": pitcher_id,
            "location": pitcher_location,
            "batter_side": batter_side,
            "event": event,
            "bb_type": str(row.get("bb_type") or "").strip().lower(),
        })

    with gzip.open(cache_path, "wt", encoding="utf-8") as handle:
        json.dump(rows, handle, separators=(",", ":"))
    return rows

def fetch_pitcher_statcast_range(start: date, end: date) -> list[dict[str, Any]]:
    if end < start:
        return []
    days=[]; cursor=start
    while cursor <= end:
        days.append(cursor.isoformat()); cursor += timedelta(days=1)
    workers=max(1,min(int(os.getenv("BORING_BETS_STATCAST_WORKERS","4")),6))
    collected=[]
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures={executor.submit(fetch_pitcher_statcast_terminal_pas,day):day for day in days}
        for future in as_completed(futures):
            day=futures[future]
            try:
                collected.extend(future.result())
            except Exception as error:
                # Day-level fetches already retry and degrade to cached/empty.
                # This guard prevents an unexpected parser error from killing
                # the entire season range.
                print(f"Statcast pitcher warning for {day}: {error}; skipping date.")
    return collected


def aggregate_pitcher_statcast_splits(
    rows: list[dict[str, Any]], location: str, batter_side: str
) -> list[dict[str, Any]]:
    totals: dict[int, dict[str, float]] = {}
    for row in rows:
        if location != "all" and row.get("location") != location:
            continue
        if row.get("batter_side") != batter_side:
            continue
        pid=int(row["pitcher_id"])
        t=totals.setdefault(pid,{
            "pa":0,
            "ab":0,
            "hits":0,
            "bb":0,
            "hbp":0,
            "hr":0,
            "so":0,
            "outs":0,
            "fb":0,
            "ground_outs":0,
            "air_outs":0,
        })
        event=row.get("event")
        t["pa"] += 1
        if event not in {"walk","intent_walk","hit_by_pitch","sac_fly","sac_bunt","catcher_interf"}:
            t["ab"] += 1
        if event in STATCAST_HITS: t["hits"] += 1
        if event in {"walk","intent_walk"}: t["bb"] += 1
        if event == "hit_by_pitch": t["hbp"] += 1
        if event == "home_run": t["hr"] += 1
        if event in {"strikeout","strikeout_double_play"}: t["so"] += 1
        play_outs = STATCAST_OUTS.get(event, 0)
        t["outs"] += play_outs

        bb_type = row.get("bb_type")

        if bb_type == "fly_ball":
            t["fb"] += 1

        if play_outs:
            if bb_type == "ground_ball":
                t["ground_outs"] += play_outs
            elif bb_type in {"fly_ball", "line_drive", "popup"}:
                t["air_outs"] += play_outs

    result=[]
    for pid,t in totals.items():
        outs=int(t["outs"])
        if outs <= 0: continue
        ip=outs/3.0
        avg=t["hits"]/t["ab"] if t["ab"] else None
        whip=(t["hits"]+t["bb"])/ip if ip else None
        fip=((13*t["hr"])+(3*(t["bb"]+t["hbp"]))-(2*t["so"]))/ip + 3.1
        expected_hr=t["fb"]*0.105
        xfip=((13*expected_hr)+(3*(t["bb"]+t["hbp"]))-(2*t["so"]))/ip + 3.1
        stat={
            "era": None, "whip": round(whip,2), "fip": round(fip,2),
            "xfip": round(xfip,2), "avg_against": round(avg,3) if avg is not None else None,
            "innings_pitched": f"{outs//3}.{outs%3}",
            "batters_faced": int(t["pa"]),
            "strikeouts": int(t["so"]),
            "walks": int(t["bb"]),
            "k_rate": round((t["so"] / t["pa"]) * 100, 1) if t["pa"] else None,
            "bb_rate": round((t["bb"] / t["pa"]) * 100, 1) if t["pa"] else None,
            "ground_outs": int(t["ground_outs"]),
            "air_outs": int(t["air_outs"]),
            "go_ao": (
                round(t["ground_outs"] / t["air_outs"], 2)
                if t["air_outs"]
                else None
            ),
            "home_runs": int(t["hr"]),
            "hits": int(t["hits"]),
            "earned_runs": None,
            "fip_source": "statcast_terminal_pa",
            "xfip_source": "statcast_terminal_pa_league_hr_fb",
            "era_unavailable_reason": "MLB does not provide earned runs by batter handedness.",
        }
        result.append({"pitcher_id":pid,"name":None,"stats":stat})
    return result


def build_pitcher_statcast_split_rows(target_date: str) -> dict[tuple[str,str,str], list[dict[str,Any]]]:
    target=datetime.strptime(target_date,"%Y-%m-%d").date()
    cutoff=target-timedelta(days=1)
    season_start=date(target.year,3,1)
    season_rows=fetch_pitcher_statcast_range(season_start,cutoff)
    windows={
        "season": season_start,
    }
    output={}
    for timeframe,start in windows.items():
        rows=[row for row in season_rows if start.isoformat() <= row.get("date","") <= cutoff.isoformat()]
        for location in ("all","home","away"):
            output[(timeframe,location,"vs_lhh")]=aggregate_pitcher_statcast_splits(rows,location,"L")
            output[(timeframe,location,"vs_rhh")]=aggregate_pitcher_statcast_splits(rows,location,"R")
    return output

# ---------------------------------------------------------------------------
# League-wide pitcher intelligence matrix
# ---------------------------------------------------------------------------

PITCHER_RANK_METRICS = {
    "era": False,
    "whip": False,
    "fip": False,
    "xfip": False,
    "avg_against": False,
    "k_rate": True,
    "bb_rate": False,
    "go_ao": True,
}

MIN_OUTS_BY_TIMEFRAME = {
    "last_7": 3,       # 1.0 IP
    "last_30": 9,      # 3.0 IP
    "season": 30,      # 10.0 IP
}


def _global_pitcher_stats(target_date: str, timeframe: str, location: str, batter_side: str | None = None) -> list[dict[str, Any]]:
    target = datetime.strptime(target_date, "%Y-%m-%d").date()
    has_split_filter = location in ("home", "away") or batter_side in ("lhh", "rhh")
    params: list[tuple[str, Any]] = [
        ("stats", "statSplits" if has_split_filter else ("season" if timeframe == "season" else "byDateRange")),
        ("group", "pitching"),
        ("season", target.year),
        ("playerPool", "ALL"),
        ("limit", 2500),
        ("hydrate", "person"),
    ]
    if timeframe == "last_7":
        params += [("startDate", (target - timedelta(days=7)).isoformat()), ("endDate", target.isoformat())]
    elif timeframe == "last_30":
        params += [("startDate", (target - timedelta(days=30)).isoformat()), ("endDate", target.isoformat())]
    sit_codes=[]
    if location == "home": sit_codes.append("h")
    elif location == "away": sit_codes.append("a")
    if batter_side == "lhh": sit_codes.append("vl")
    elif batter_side == "rhh": sit_codes.append("vr")
    if sit_codes:
        params.append(("sitCodes", ",".join(sit_codes)))
    raw=get_json(f"{MLB_API_BASE}/stats?{urllib.parse.urlencode(params)}")
    rows=[]
    for group in raw.get("stats",[]):
        for split in group.get("splits",[]):
            person=split.get("player") or split.get("person") or {}
            pid=person.get("id")
            if not pid: continue
            stats=normalize_pitching_stat(split.get("stat",{}))
            rows.append({"pitcher_id":int(pid),"name":person.get("fullName"),"stats":stats})
    return rows


def _competition_ranks(rows: list[dict[str, Any]], metric: str) -> dict[int, int]:
    """Rank unique pitchers only.

    MLB's league stats endpoint can return multiple rows for one pitcher
    (most commonly multiple team/season split rows). Ranking the raw rows made
    ranks exceed the unique-pitcher pool size. Keep one normalized value per
    pitcher before sorting so every rank is valid within its pool.
    """
    by_pitcher: dict[int, float] = {}
    for row in rows:
        value = row.get("stats", {}).get(metric)
        if isinstance(value, (int, float)):
            by_pitcher[int(row["pitcher_id"])] = float(value)

    higher_is_better = PITCHER_RANK_METRICS.get(
        metric,
        False,
    )

    valid = sorted(
        by_pitcher.items(),
        key=lambda item: item[1],
        reverse=higher_is_better,
    )

    result: dict[int, int] = {}
    prior_value = None
    prior_rank = 0
    for index, (pitcher_id, value) in enumerate(valid, start=1):
        rank = prior_rank if prior_value == value else index
        result[pitcher_id] = rank
        prior_value = value
        prior_rank = rank
    return result




def build_league_last_start_rank_filters(
    target_date: str,
) -> dict[str, Any]:
    """
    Rank overall and handedness statistics using
    actual pitcher starts, never calendar days.
    """

    print(
        "Building MLB-wide Last Starts "
        "pitcher rank pools..."
    )

    def eligible_start_rows(
        rows: list[dict[str, Any]],
        location: str,
    ) -> list[dict[str, Any]]:
        return [
            row
            for row in rows
            if (
                location == "all"
                or (
                    location == "home"
                    and row.get("is_home") is True
                )
                or (
                    location == "away"
                    and row.get("is_home") is False
                )
            )
        ]

    def build_rank_payload(
        rows: list[dict[str, Any]],
        context: str,
    ) -> dict[str, Any]:
        ranks = {
            metric:
                _competition_ranks(
                    rows,
                    metric,
                )
            for metric
            in PITCHER_RANK_METRICS
        }

        pitchers: dict[str, Any] = {}

        for row in rows:
            pitcher_id = int(
                row["pitcher_id"]
            )

            stats = dict(
                row["stats"]
            )

            stats["ranks"] = {
                metric:
                    ranks[metric].get(
                        pitcher_id
                    )
                for metric
                in PITCHER_RANK_METRICS
            }

            stats["rank_pool_size"] = {
                metric:
                    len(ranks[metric])
                for metric
                in PITCHER_RANK_METRICS
            }

            stats["rank_context"] = context

            pitchers[str(pitcher_id)] = (
                stats
            )

        return {
            "pitchers": pitchers,
            "qualified_count": len(rows),
        }

    season_rows = _global_pitcher_stats(
        target_date,
        "season",
        "all",
    )

    pitcher_ids = sorted({
        int(row["pitcher_id"])
        for row in season_rows
        if (
            to_int(
                row.get("stats", {})
                .get("games_started")
            )
            or 0
        ) > 0
    })

    print(
        "Last Starts candidates:",
        len(pitcher_ids),
    )

    start_rows_by_pitcher: dict[
        int,
        list[dict[str, Any]],
    ] = {}

    workers = max(
        2,
        min(
            int(
                os.getenv(
                    "BORING_BETS_MLB_FETCH_WORKERS",
                    "10",
                )
            ),
            16,
        ),
    )

    with ThreadPoolExecutor(
        max_workers=workers,
    ) as executor:
        futures = {
            executor.submit(
                fetch_pitcher_start_game_logs,
                pitcher_id,
                target_date,
            ): pitcher_id
            for pitcher_id in pitcher_ids
        }

        completed = 0

        for future in as_completed(futures):
            pitcher_id = futures[future]
            completed += 1

            try:
                start_rows_by_pitcher[
                    pitcher_id
                ] = future.result()
            except Exception as error:
                print(
                    "Last Starts game log skipped "
                    f"{pitcher_id}: {error}"
                )

            if (
                completed == 1
                or completed % 25 == 0
                or completed == len(futures)
            ):
                print(
                    "Last Starts game logs: "
                    f"{completed}/{len(futures)}"
                )

    # Fetch Statcast only for dates that belong
    # to a selected Last 20 sample.
    relevant_dates: set[str] = set()
    maximum_count = max(LAST_START_COUNTS)

    for rows in start_rows_by_pitcher.values():
        for location in (
            "all",
            "home",
            "away",
        ):
            selected = eligible_start_rows(
                rows,
                location,
            )[-maximum_count:]

            relevant_dates.update(
                str(row.get("date"))
                for row in selected
                if row.get("date")
            )

    print(
        "Last Starts Statcast dates:",
        len(relevant_dates),
    )

    statcast_rows: list[
        dict[str, Any]
    ] = []

    statcast_workers = max(
        1,
        min(
            int(
                os.getenv(
                    "BORING_BETS_STATCAST_WORKERS",
                    "4",
                )
            ),
            6,
        ),
    )

    with ThreadPoolExecutor(
        max_workers=statcast_workers,
    ) as executor:
        futures = {
            executor.submit(
                fetch_pitcher_statcast_terminal_pas,
                day,
            ): day
            for day in sorted(relevant_dates)
        }

        completed = 0

        for future in as_completed(futures):
            day = futures[future]
            completed += 1

            try:
                statcast_rows.extend(
                    future.result()
                )
            except Exception as error:
                print(
                    "Last Starts Statcast skipped "
                    f"{day}: {error}"
                )

            if (
                completed == 1
                or completed % 25 == 0
                or completed == len(futures)
            ):
                print(
                    "Last Starts Statcast dates: "
                    f"{completed}/{len(futures)}"
                )

    statcast_by_pitcher_date: dict[
        int,
        dict[
            str,
            list[dict[str, Any]],
        ],
    ] = {}

    for row in statcast_rows:
        try:
            pitcher_id = int(
                row.get("pitcher_id")
            )
        except (
            TypeError,
            ValueError,
        ):
            continue

        day = str(
            row.get("date") or ""
        )

        if not day:
            continue

        statcast_by_pitcher_date.setdefault(
            pitcher_id,
            {},
        ).setdefault(
            day,
            [],
        ).append(row)

    blocks_by_pitcher: dict[
        int,
        dict[str, Any],
    ] = {}

    for (
        pitcher_id,
        start_rows,
    ) in start_rows_by_pitcher.items():
        blocks = build_last_start_blocks(
            start_rows
        )

        pitcher_statcast = (
            statcast_by_pitcher_date.get(
                pitcher_id,
                {},
            )
        )

        for requested_count in (
            LAST_START_COUNTS
        ):
            count_key = str(
                requested_count
            )

            for location in (
                "all",
                "home",
                "away",
            ):
                selected = (
                    eligible_start_rows(
                        start_rows,
                        location,
                    )[-requested_count:]
                )

                block = (
                    blocks
                    .get(count_key, {})
                    .get(location, {})
                )

                if not block:
                    continue

                selected_statcast: list[
                    dict[str, Any]
                ] = []

                for start_row in selected:
                    day = str(
                        start_row.get("date")
                        or ""
                    )

                    selected_statcast.extend(
                        pitcher_statcast.get(
                            day,
                            [],
                        )
                    )

                for (
                    split_key,
                    batter_side,
                    split_label,
                ) in (
                    (
                        "vs_lhh",
                        "L",
                        "vs LHH",
                    ),
                    (
                        "vs_rhh",
                        "R",
                        "vs RHH",
                    ),
                ):
                    split_rows = (
                        aggregate_pitcher_statcast_splits(
                            selected_statcast,
                            "all",
                            batter_side,
                        )
                    )

                    matching = next(
                        (
                            row.get("stats", {})
                            for row in split_rows
                            if int(
                                row.get(
                                    "pitcher_id",
                                    0,
                                )
                            ) == pitcher_id
                        ),
                        {},
                    )

                    split_stats = dict(
                        matching
                    )

                    if split_stats:
                        split_stats[
                            "requested_starts"
                        ] = requested_count
                        split_stats[
                            "starts_used"
                        ] = len(selected)
                        split_stats[
                            "start_dates"
                        ] = [
                            row.get("date")
                            for row in selected
                        ]
                        split_stats[
                            "sample_type"
                        ] = "starts"
                        split_stats[
                            "split_label"
                        ] = split_label
                        split_stats[
                            "era"
                        ] = None
                        split_stats[
                            "era_unavailable_reason"
                        ] = (
                            "Earned runs cannot be "
                            "assigned reliably by "
                            "batter handedness."
                        )

                    block[split_key] = (
                        split_stats
                    )

        blocks_by_pitcher[
            pitcher_id
        ] = blocks

    output: dict[str, Any] = {}

    for requested_count in LAST_START_COUNTS:
        count_key = str(requested_count)
        output[count_key] = {}

        for location in (
            "all",
            "home",
            "away",
        ):
            overall_rows = []
            left_rows = []
            right_rows = []

            for (
                pitcher_id,
                blocks,
            ) in blocks_by_pitcher.items():
                stats = (
                    blocks
                    .get(count_key, {})
                    .get(location, {})
                )

                starts_used = (
                    to_int(
                        stats.get("starts_used")
                    )
                    or 0
                )

                # An incomplete requested sample is
                # displayed but not league-ranked.
                if starts_used < requested_count:
                    continue

                overall_rows.append({
                    "pitcher_id": pitcher_id,
                    "stats": dict(stats),
                })

                left_stats = (
                    stats.get("vs_lhh")
                    or {}
                )

                if left_stats:
                    left_rows.append({
                        "pitcher_id":
                            pitcher_id,
                        "stats":
                            dict(left_stats),
                    })

                right_stats = (
                    stats.get("vs_rhh")
                    or {}
                )

                if right_stats:
                    right_rows.append({
                        "pitcher_id":
                            pitcher_id,
                        "stats":
                            dict(right_stats),
                    })

            overall_payload = (
                build_rank_payload(
                    overall_rows,
                    "last_starts",
                )
            )

            output[count_key][location] = {
                **overall_payload,
                "vs_lhh":
                    build_rank_payload(
                        left_rows,
                        "last_starts_vs_lhh",
                    ),
                "vs_rhh":
                    build_rank_payload(
                        right_rows,
                        "last_starts_vs_rhh",
                    ),
            }

            print(
                "Last Starts pool: "
                f"{requested_count}/"
                f"{location} = "
                f"{len(overall_rows)} overall, "
                f"{len(left_rows)} LHH, "
                f"{len(right_rows)} RHH"
            )

    return output
def build_league_pitcher_cache(target_date: str) -> dict[str, Any]:
    cache_root=Path(__file__).resolve().parents[2]/"data"/"cache"
    cache_root.mkdir(parents=True,exist_ok=True)
    cache_file=cache_root/f"mlb-pitcher-ranks-v5-{target_date}.json"
    force=os.getenv("BORING_BETS_REBUILD_PITCHER_RANK_CACHE")=="1"
    if cache_file.exists() and not force:
        try: return json.loads(cache_file.read_text())
        except Exception: pass
    matrix={"date":target_date,"filters":{}}
    print("Building Season and Last Starts pitcher rank pools...")
    statcast_split_rows = build_pitcher_statcast_split_rows(target_date)
    total=9; count=0
    for timeframe in ("season",):
        matrix["filters"].setdefault(timeframe,{})
        for location in ("all","home","away"):
            matrix["filters"][timeframe].setdefault(location,{})
            for split_key,batter_side in (("all",None),("vs_lhh","lhh"),("vs_rhh","rhh")):
                count+=1; print(f"Pitcher rank pool {count}/{total}: {timeframe}/{location}/{split_key}")
                if split_key == "all":
                    rows=_global_pitcher_stats(target_date,timeframe,location,batter_side)
                else:
                    rows=statcast_split_rows.get((timeframe,location,split_key), [])
                min_outs=MIN_OUTS_BY_TIMEFRAME[timeframe]
                qualified_by_pitcher: dict[int, dict[str, Any]] = {}
                for row in rows:
                    stats = row["stats"]
                    from mlb.intelligence import add_fip, add_xfip, innings_to_outs
                    add_fip(stats)
                    add_xfip(stats)
                    outs = innings_to_outs(stats.get("innings_pitched")) or 0
                    if outs >= min_outs:
                        qualified_by_pitcher[int(row["pitcher_id"])] = row

                qualified = list(qualified_by_pitcher.values())
                ranks = {m: _competition_ranks(qualified, m) for m in PITCHER_RANK_METRICS}
                payload = {}
                for row in qualified:
                    pitcher_id = int(row["pitcher_id"])
                    pid = str(pitcher_id)
                    stats = row["stats"]
                    stats["ranks"] = {
                        m: ranks[m].get(pitcher_id) for m in PITCHER_RANK_METRICS
                    }
                    stats["rank_pool_size"] = {
                        m: len(ranks[m]) for m in PITCHER_RANK_METRICS
                    }
                    # MLB does not provide earned runs in vl/vr statSplits, so
                    # handedness ERA is unknowable and must never carry a rank.
                    if split_key in ("vs_lhh", "vs_rhh"):
                        stats["era"] = None
                        stats.setdefault("ranks", {})["era"] = None
                        stats.setdefault("rank_pool_size", {})["era"] = 0
                    payload[pid] = stats
                matrix["filters"][timeframe][location][split_key] = {
                    "pitchers": payload,
                    "qualified_count": len(qualified),
                }
    matrix["filters"]["last_starts"] = (
        build_league_last_start_rank_filters(
            target_date
        )
    )

    cache_file.write_text(
        json.dumps(
            matrix,
            indent=2,
        )
    )

    return matrix


def apply_league_pitcher_cache(games: list[dict[str, Any]], cache: dict[str, Any]) -> list[dict[str, Any]]:
    filters=cache.get("filters",{})
    for game in games:
        for side in ("away","home"):
            pitcher=game.get("pitchers",{}).get(side,{})
            pid=pitcher.get("id")
            if not pid: continue
            pid=str(pid)
            stats_root=pitcher.setdefault("stats",{})
            for timeframe in ("season",):
                period=stats_root.setdefault(timeframe,{})
                for location in ("all","home","away"):
                    location_block=period.setdefault(location,{})
                    filter_block=filters.get(timeframe,{}).get(location,{})
                    all_stats=filter_block.get("all",{}).get("pitchers",{}).get(pid)
                    if all_stats: location_block.update(all_stats)
                    for split_key in ("vs_lhh","vs_rhh"):
                        split_stats=filter_block.get(split_key,{}).get("pitchers",{}).get(pid)
                        if split_stats: location_block[split_key]=split_stats
            last_start_filters = (
                filters.get(
                    "last_starts",
                    {},
                )
            )

            last_start_root = (
                stats_root.setdefault(
                    "last_starts",
                    {},
                )
            )

            for requested_count in (
                1,
                3,
                7,
                10,
                20,
            ):
                count_key = str(
                    requested_count
                )

                count_root = (
                    last_start_root.setdefault(
                        count_key,
                        {},
                    )
                )

                for location in (
                    "all",
                    "home",
                    "away",
                ):
                    location_block = (
                        count_root.setdefault(
                            location,
                            {},
                        )
                    )

                    count_filter = (
                        last_start_filters
                        .get(count_key, {})
                        .get(location, {})
                    )

                    ranked_stats = (
                        count_filter
                        .get("pitchers", {})
                        .get(pid)
                    )

                    if ranked_stats:
                        location_block.update(
                            ranked_stats
                        )

                    for split_key in (
                        "vs_lhh",
                        "vs_rhh",
                    ):
                        split_stats = (
                            count_filter
                            .get(split_key, {})
                            .get("pitchers", {})
                            .get(pid)
                        )

                        if split_stats:
                            location_block[
                                split_key
                            ] = split_stats

            # Backwards-compatible season split aliases.
            season_all=stats_root.get("season",{}).get("all",{})
            if season_all.get("vs_lhh"): stats_root["vs_lhh"]=season_all["vs_lhh"]
            if season_all.get("vs_rhh"): stats_root["vs_rhh"]=season_all["vs_rhh"]
    return games
