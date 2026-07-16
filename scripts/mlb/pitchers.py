from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any
from pathlib import Path
import json
import os
import sys
import urllib.parse
import urllib.request


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
        "strikeouts": to_int(
            stat.get("strikeOuts")
        ),
        "walks": to_int(
            stat.get("baseOnBalls")
        ),
        "home_runs": to_int(
            stat.get("homeRuns")
        ),
        "air_outs": to_int(
            stat.get("airOuts") or stat.get("flyOuts")
        ),
        "hits": to_int(
            stat.get("hits")
        ),
        "earned_runs": to_int(
            stat.get("earnedRuns")
        ),
        "split_ops": to_float(stat.get("ops")),
        "split_obp": to_float(stat.get("obp")),
        "split_slg": to_float(stat.get("slg")),
    }


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
# League-wide pitcher intelligence matrix
# ---------------------------------------------------------------------------

PITCHER_RANK_METRICS = {
    "era": False,
    "whip": False,
    "fip": False,
    "xfip": False,
    "avg_against": False,
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


def _competition_ranks(rows: list[dict[str, Any]], metric: str) -> dict[int,int]:
    valid=[]
    for row in rows:
        value=row.get("stats",{}).get(metric)
        if isinstance(value,(int,float)):
            valid.append((row["pitcher_id"],float(value)))
    valid.sort(key=lambda item:item[1])
    result={}; prior=None; prior_rank=0
    for idx,(pid,value) in enumerate(valid,1):
        rank=prior_rank if prior==value else idx
        result[pid]=rank; prior=value; prior_rank=rank
    return result


def build_league_pitcher_cache(target_date: str) -> dict[str, Any]:
    cache_root=Path(__file__).resolve().parents[2]/"data"/"cache"
    cache_root.mkdir(parents=True,exist_ok=True)
    cache_file=cache_root/f"mlb-pitcher-ranks-{target_date}.json"
    force=os.getenv("BORING_BETS_REBUILD_PITCHER_RANK_CACHE")=="1"
    if cache_file.exists() and not force:
        try: return json.loads(cache_file.read_text())
        except Exception: pass
    matrix={"date":target_date,"filters":{}}
    total=27; count=0
    for timeframe in ("last_7","last_30","season"):
        matrix["filters"].setdefault(timeframe,{})
        for location in ("all","home","away"):
            matrix["filters"][timeframe].setdefault(location,{})
            for split_key,batter_side in (("all",None),("vs_lhh","lhh"),("vs_rhh","rhh")):
                count+=1; print(f"Pitcher rank pool {count}/{total}: {timeframe}/{location}/{split_key}")
                rows=_global_pitcher_stats(target_date,timeframe,location,batter_side)
                min_outs=MIN_OUTS_BY_TIMEFRAME[timeframe]
                qualified=[]
                for row in rows:
                    stats=row["stats"]
                    from mlb.intelligence import add_fip, add_xfip, innings_to_outs
                    add_fip(stats); add_xfip(stats)
                    outs=innings_to_outs(stats.get("innings_pitched")) or 0
                    if outs >= min_outs:
                        qualified.append(row)
                ranks={m:_competition_ranks(qualified,m) for m in PITCHER_RANK_METRICS}
                payload={}
                for row in qualified:
                    pid=str(row["pitcher_id"]); stats=row["stats"]
                    stats["ranks"]={m:ranks[m].get(row["pitcher_id"]) for m in PITCHER_RANK_METRICS}
                    stats["rank_pool_size"]={m:len(ranks[m]) for m in PITCHER_RANK_METRICS}
                    payload[pid]=stats
                matrix["filters"][timeframe][location][split_key]={"pitchers":payload,"qualified_count":len(qualified)}
    cache_file.write_text(json.dumps(matrix,indent=2))
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
            for timeframe in ("last_7","last_30","season"):
                period=stats_root.setdefault(timeframe,{})
                for location in ("all","home","away"):
                    location_block=period.setdefault(location,{})
                    filter_block=filters.get(timeframe,{}).get(location,{})
                    all_stats=filter_block.get("all",{}).get("pitchers",{}).get(pid)
                    if all_stats: location_block.update(all_stats)
                    for split_key in ("vs_lhh","vs_rhh"):
                        split_stats=filter_block.get(split_key,{}).get("pitchers",{}).get(pid)
                        if split_stats: location_block[split_key]=split_stats
            # Backwards-compatible season split aliases.
            season_all=stats_root.get("season",{}).get("all",{})
            if season_all.get("vs_lhh"): stats_root["vs_lhh"]=season_all["vs_lhh"]
            if season_all.get("vs_rhh"): stats_root["vs_rhh"]=season_all["vs_rhh"]
    return games
