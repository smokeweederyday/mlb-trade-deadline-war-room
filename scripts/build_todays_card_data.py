#!/usr/bin/env python3
"""Build lightweight, data-rich Today’s Card shards from MLB game data.

The browser should not need to download the full enriched game document for every
league panel. This builder extracts the information needed by compact cards while
preserving links back to the full research and live pages.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple
from zoneinfo import ZoneInfo

EASTERN = ZoneInfo("America/New_York")
RESULT_FIELDS = (
    "status",
    "abstract_status",
    "score",
    "linescore",
    "decisions",
    "game_time",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build data/cards/YYYY-MM-DD/mlb.json from enriched MLB date shards."
    )
    parser.add_argument(
        "--date",
        action="append",
        dest="dates",
        help="Build one YYYY-MM-DD card shard. Repeat as needed.",
    )
    parser.add_argument(
        "--season",
        type=int,
        help="Build every existing data/games date shard for this season.",
    )
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="Repository root. Defaults to the parent of scripts/.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    dates = resolve_dates(args)
    if not dates:
        raise SystemExit("No MLB date shards were found to build.")

    built = 0
    skipped = 0
    event_count = 0

    for card_date in dates:
        enriched_path = args.root / "data" / "games" / f"{card_date}.json"
        live_path = args.root / "data" / "live-games" / f"{card_date}.json"
        enriched = read_optional_document(enriched_path)
        live = read_optional_document(live_path)

        if enriched is None and live is None:
            print(f"SKIP {card_date}: no enriched or live MLB date file")
            skipped += 1
            continue

        games = merge_game_documents(enriched, live)
        games.sort(key=game_sort_key)
        card_games = [build_card_game(game, card_date) for game in games]
        source_updated = newest_timestamp(
            (enriched or {}).get("updated_at"),
            (live or {}).get("updated_at"),
            *(game.get("last_updated") for game in games),
        )

        document = {
            "schema_version": "2.0",
            "sport": "baseball",
            "league": "mlb",
            "date": card_date,
            "updated_at": utc_now(),
            "source_updated_at": source_updated,
            "source": {
                "primary": f"data/games/{card_date}.json" if enriched is not None else None,
                "status_overlay": f"data/live-games/{card_date}.json" if live is not None else None,
                "generated_by": "scripts/build_todays_card_data.py",
            },
            "games": card_games,
        }

        output = args.root / "data" / "cards" / card_date / "mlb.json"
        existing_card = read_optional_document(output)
        if equivalent_card_document(existing_card, document):
            event_count += len(card_games)
            print(f"{card_date}: {len(card_games)} MLB cards unchanged")
            continue

        write_json_atomic(output, document)
        built += 1
        event_count += len(card_games)
        print(f"{card_date}: {len(card_games)} MLB cards -> {output}")

    print("\nToday’s Card build summary")
    print(f"Date shards written: {built}")
    print(f"Games written: {event_count}")
    print(f"Dates skipped: {skipped}")
    print("PASS: MLB Today’s Card data is generated from the current research feed.")
    return 0


def resolve_dates(args: argparse.Namespace) -> List[str]:
    if args.dates:
        dates = sorted(set(args.dates))
        for value in dates:
            validate_date(value)
        return dates

    if args.season is not None:
        if args.season < 1900 or args.season > 2200:
            raise SystemExit("--season must be a four-digit year.")
        prefix = f"{args.season:04d}-"
        return sorted(
            path.stem
            for path in (args.root / "data" / "games").glob(f"{prefix}*.json")
            if is_date_string(path.stem)
        )

    return [datetime.now(EASTERN).date().isoformat()]


def validate_date(value: str) -> None:
    if not is_date_string(value):
        raise SystemExit(f"Invalid date {value!r}. Use YYYY-MM-DD.")
    try:
        datetime.strptime(value, "%Y-%m-%d")
    except ValueError as exc:
        raise SystemExit(f"Invalid date {value!r}. Use YYYY-MM-DD.") from exc


def is_date_string(value: Any) -> bool:
    text = str(value or "")
    return len(text) == 10 and text[4] == "-" and text[7] == "-" and text.replace("-", "").isdigit()


def read_optional_document(path: Path) -> Optional[Dict[str, Any]]:
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Unable to read {path}: {exc}") from exc
    if not isinstance(payload, dict):
        raise RuntimeError(f"{path} must contain a JSON object.")
    if not isinstance(payload.get("games"), list):
        payload["games"] = []
    return payload


def merge_game_documents(
    enriched: Optional[Dict[str, Any]],
    live: Optional[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    merged: List[Dict[str, Any]] = [
        dict(game)
        for game in ((enriched or {}).get("games") or [])
        if isinstance(game, dict)
    ]
    by_key = {game_identity(game): game for game in merged}

    for live_game in ((live or {}).get("games") or []):
        if not isinstance(live_game, dict):
            continue
        key = game_identity(live_game)
        target = by_key.get(key)
        if target is None:
            target = dict(live_game)
            merged.append(target)
            by_key[key] = target
            continue
        overlay_result_fields(target, live_game)

    return merged


def equivalent_card_document(existing: Optional[Dict[str, Any]], candidate: Dict[str, Any]) -> bool:
    if not isinstance(existing, dict):
        return False
    ignored = {"updated_at"}
    existing_content = {key: value for key, value in existing.items() if key not in ignored}
    candidate_content = {key: value for key, value in candidate.items() if key not in ignored}
    return existing_content == candidate_content


def game_identity(game: Dict[str, Any]) -> str:
    game_pk = game.get("mlb_game_pk") or game.get("game_pk") or game.get("gamePk")
    if game_pk is not None:
        return f"pk:{game_pk}"
    return f"id:{game.get('id') or ''}"


def overlay_result_fields(target: Dict[str, Any], status_game: Dict[str, Any]) -> None:
    for key in RESULT_FIELDS:
        value = status_game.get(key)
        if value is not None:
            target[key] = value

    for side in ("away_team", "home_team"):
        incoming = status_game.get(side)
        if not isinstance(incoming, dict):
            continue
        current = target.get(side)
        if not isinstance(current, dict):
            current = {}
            target[side] = current
        for key in ("team_id", "id", "abbr", "abbreviation", "name", "record"):
            if incoming.get(key) is not None:
                current[key] = incoming[key]

    if isinstance(status_game.get("venue"), dict):
        venue = target.get("venue") if isinstance(target.get("venue"), dict) else {}
        venue.update({key: value for key, value in status_game["venue"].items() if value is not None})
        target["venue"] = venue


def build_card_game(game: Dict[str, Any], card_date: str) -> Dict[str, Any]:
    away_team = team_summary(game.get("away_team") or game.get("away") or {}, game, "away")
    home_team = team_summary(game.get("home_team") or game.get("home") or {}, game, "home")
    away_pitcher = pitcher_summary((game.get("pitchers") or {}).get("away") or {})
    home_pitcher = pitcher_summary((game.get("pitchers") or {}).get("home") or {})
    game_id = str(game.get("id") or f"{card_date}-{away_team['abbr'].lower()}-{home_team['abbr'].lower()}")
    game_pk = game.get("mlb_game_pk") or game.get("game_pk") or game.get("gamePk")

    return {
        "id": game_id,
        "mlb_game_pk": game_pk,
        "date": str(game.get("date") or card_date),
        "game_time": game.get("game_time") or game.get("start_time") or game.get("gameDate"),
        "status": game.get("status") or game.get("abstract_status") or "Scheduled",
        "abstract_status": game.get("abstract_status"),
        "venue": venue_summary(game.get("venue")),
        "away_team": away_team,
        "home_team": home_team,
        "score": {
            "away": read_score(game, "away"),
            "home": read_score(game, "home"),
        },
        "linescore": game.get("linescore") if isinstance(game.get("linescore"), dict) else {},
        "decisions": game.get("decisions") if isinstance(game.get("decisions"), dict) else {},
        "pitchers": {"away": away_pitcher, "home": home_pitcher},
        "weather": weather_summary(game.get("weather")),
        "market": market_summary(game.get("market")),
        "context": context_summary(game.get("context")),
        "lineups": lineup_summary(game.get("lineups")),
        "bullpens": {
            "away": bullpen_summary((game.get("bullpens") or {}).get("away")),
            "home": bullpen_summary((game.get("bullpens") or {}).get("home")),
        },
        "offense": {
            "away": offense_summary((game.get("offense") or {}).get("away")),
            "home": offense_summary((game.get("offense") or {}).get("home")),
        },
        "card": {
            "away_detail": pitcher_detail(away_pitcher),
            "home_detail": pitcher_detail(home_pitcher),
            "data_available": data_availability(game),
        },
        "game_url": f"game.html?id={game_id}",
        "live_url": f"live.html?id={game_id}",
        "breakdown_url": finished_game_url(game_id, card_date, game_pk),
        "last_updated": game.get("last_updated") or game.get("updated_at"),
    }


def team_summary(team: Any, game: Dict[str, Any], side: str) -> Dict[str, Any]:
    team = team if isinstance(team, dict) else {}
    abbreviation = str(
        team.get("abbr")
        or team.get("abbreviation")
        or team.get("short_name")
        or ("AWAY" if side == "away" else "HOME")
    )
    record = team.get("record") or team.get("league_record") or team.get("leagueRecord") or {}
    if not isinstance(record, dict):
        record = {}
    return {
        "team_id": team.get("team_id") or team.get("id"),
        "abbr": abbreviation,
        "name": team.get("name") or team.get("full_name") or abbreviation,
        "score": read_score(game, side),
        "record": {
            "wins": record.get("wins"),
            "losses": record.get("losses"),
            "pct": record.get("pct"),
        },
        "logo_url": team.get("logo_url") or team.get("logoUrl"),
    }


def venue_summary(value: Any) -> Dict[str, Any]:
    venue = value if isinstance(value, dict) else {}
    return {
        key: venue.get(key)
        for key in ("id", "name", "city", "state", "timezone")
        if venue.get(key) is not None
    }


def pitcher_summary(value: Any) -> Dict[str, Any]:
    pitcher = value if isinstance(value, dict) else {}
    stats = pitcher.get("stats") if isinstance(pitcher.get("stats"), dict) else {}
    return {
        "id": pitcher.get("id"),
        "name": pitcher.get("name") or "Starter TBD",
        "status": pitcher.get("status") or "unknown",
        "throws": pitcher.get("throws"),
        "age": pitcher.get("age"),
        "last_30": stat_line(stats, "last_30"),
        "season": stat_line(stats, "season"),
    }


def stat_line(stats: Dict[str, Any], timeframe: str) -> Dict[str, Any]:
    block = stats.get(timeframe) if isinstance(stats.get(timeframe), dict) else {}
    all_stats = block.get("all") if isinstance(block.get("all"), dict) else {}
    return compact_dict(
        {
            "era": numeric(all_stats.get("era")),
            "whip": numeric(all_stats.get("whip")),
            "fip": numeric(all_stats.get("fip")),
            "xfip": numeric(all_stats.get("xfip")),
            "innings_pitched": all_stats.get("innings_pitched"),
            "games_started": all_stats.get("games_started"),
            "ranks": compact_dict(all_stats.get("ranks") if isinstance(all_stats.get("ranks"), dict) else {}),
        }
    )


def pitcher_detail(pitcher: Dict[str, Any]) -> str:
    name = str(pitcher.get("name") or "Starter TBD")
    throws = pitcher.get("throws")
    form = pitcher.get("last_30") if isinstance(pitcher.get("last_30"), dict) else {}
    season = pitcher.get("season") if isinstance(pitcher.get("season"), dict) else {}
    era = form.get("era") if form.get("era") is not None else season.get("era")
    pieces = [name]
    if throws:
        pieces.append(str(throws))
    if era is not None:
        pieces.append(f"{era:.2f} ERA")
    return " · ".join(pieces)


def weather_summary(value: Any) -> Dict[str, Any]:
    weather = value if isinstance(value, dict) else {}
    return compact_dict(
        {
            "condition": weather.get("condition"),
            "temperature": numeric(weather.get("temperature")),
            "humidity": numeric(weather.get("humidity")),
            "rain_probability": numeric(weather.get("rain_probability")),
            "wind_speed": numeric(weather.get("wind_speed")),
            "wind_gust": numeric(weather.get("wind_gust")),
            "wind_direction": weather.get("wind_direction"),
            "source": weather.get("source"),
            "updated_at": weather.get("updated_at"),
        }
    )


def market_summary(value: Any) -> Dict[str, Any]:
    market = value if isinstance(value, dict) else {}
    moneyline = market.get("moneyline") if isinstance(market.get("moneyline"), dict) else {}
    best = moneyline.get("best") if isinstance(moneyline.get("best"), dict) else {}
    consensus = moneyline.get("consensus") if isinstance(moneyline.get("consensus"), dict) else {}

    away_best = best.get("away") if isinstance(best.get("away"), dict) else {}
    home_best = best.get("home") if isinstance(best.get("home"), dict) else {}
    total = market.get("total") if isinstance(market.get("total"), dict) else {}
    total_row = first_market_row(total.get("books"))
    run_line = market.get("run_line") if isinstance(market.get("run_line"), dict) else {}
    run_line_row = first_market_row(run_line.get("books"))

    return compact_dict(
        {
            "away_moneyline": away_best.get("price", consensus.get("away")),
            "home_moneyline": home_best.get("price", consensus.get("home")),
            "away_book": away_best.get("bookmaker"),
            "home_book": home_best.get("bookmaker"),
            "total": nested_value(total_row, "over", "point") or nested_value(total_row, "under", "point"),
            "over_price": nested_value(total_row, "over", "price"),
            "under_price": nested_value(total_row, "under", "price"),
            "away_run_line": nested_value(run_line_row, "away", "point"),
            "away_run_line_price": nested_value(run_line_row, "away", "price"),
            "home_run_line": nested_value(run_line_row, "home", "point"),
            "home_run_line_price": nested_value(run_line_row, "home", "price"),
            "updated_at": market.get("last_update") or market.get("updated_at"),
        }
    )


def first_market_row(value: Any) -> Dict[str, Any]:
    if not isinstance(value, list):
        return {}
    for row in value:
        if isinstance(row, dict):
            return row
    return {}


def nested_value(mapping: Dict[str, Any], key: str, child: str) -> Any:
    value = mapping.get(key)
    return value.get(child) if isinstance(value, dict) else None


def context_summary(value: Any) -> Dict[str, Any]:
    context = value if isinstance(value, dict) else {}
    alerts: List[Dict[str, Any]] = []
    for item in (context.get("alerts") or [])[:3]:
        if not isinstance(item, dict):
            continue
        alerts.append(
            compact_dict(
                {
                    "title": item.get("title"),
                    "summary": item.get("summary"),
                    "level": item.get("level"),
                    "category": item.get("category"),
                }
            )
        )
    return compact_dict(
        {
            "score": numeric(context.get("score")),
            "label": context.get("label"),
            "alerts": alerts,
        }
    )


def lineup_summary(value: Any) -> Dict[str, Any]:
    lineups = value if isinstance(value, dict) else {}
    return {
        side: compact_dict(
            {
                "status": ((lineups.get(side) or {}).get("status") if isinstance(lineups.get(side), dict) else None),
                "status_label": ((lineups.get(side) or {}).get("status_label") if isinstance(lineups.get(side), dict) else None),
                "player_count": len((lineups.get(side) or {}).get("players") or []) if isinstance(lineups.get(side), dict) else 0,
            }
        )
        for side in ("away", "home")
    }


def bullpen_summary(value: Any) -> Dict[str, Any]:
    bullpen = value if isinstance(value, dict) else {}
    stats = bullpen.get("stats") if isinstance(bullpen.get("stats"), dict) else {}
    block = stats.get("last_30") if isinstance(stats.get("last_30"), dict) else {}
    all_stats = block.get("all") if isinstance(block.get("all"), dict) else {}
    ranks = all_stats.get("ranks") if isinstance(all_stats.get("ranks"), dict) else {}
    return compact_dict(
        {
            "era": numeric(all_stats.get("era")),
            "whip": numeric(all_stats.get("whip")),
            "era_rank": ranks.get("era"),
            "whip_rank": ranks.get("whip"),
        }
    )


def offense_summary(value: Any) -> Dict[str, Any]:
    offense = value if isinstance(value, dict) else {}
    stats = offense.get("stats") if isinstance(offense.get("stats"), dict) else {}
    block = stats.get("last_30") if isinstance(stats.get("last_30"), dict) else {}
    all_stats = block.get("all") if isinstance(block.get("all"), dict) else {}
    ops = metric_summary(all_stats.get("OPS"))
    iso = metric_summary(all_stats.get("ISO"))
    wrc = metric_summary(all_stats.get("wRC+"))
    return compact_dict(
        {
            "opponent_throws": offense.get("opponent_throws"),
            "ops": ops.get("value"),
            "ops_rank": ops.get("rank"),
            "iso": iso.get("value"),
            "iso_rank": iso.get("rank"),
            "wrc_plus": wrc.get("value"),
            "wrc_plus_rank": wrc.get("rank"),
        }
    )


def metric_summary(value: Any) -> Dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    selected = value.get("vs_hand")
    rank = value.get("vs_hand_rank")
    if selected is None:
        selected = value.get("overall")
        rank = value.get("overall_rank")
    return {"value": numeric(selected), "rank": rank}


def data_availability(game: Dict[str, Any]) -> Dict[str, bool]:
    return {
        "pitchers": bool(game.get("pitchers")),
        "offense": bool(game.get("offense")),
        "bullpens": bool(game.get("bullpens")),
        "lineups": bool(game.get("lineups")),
        "weather": bool(game.get("weather")),
        "market": bool(game.get("market")),
        "context": bool(game.get("context")),
        "score": read_score(game, "away") is not None and read_score(game, "home") is not None,
    }


def read_score(game: Dict[str, Any], side: str) -> Any:
    score = game.get("score") if isinstance(game.get("score"), dict) else {}
    if score.get(side) is not None:
        return score.get(side)
    linescore = game.get("linescore") if isinstance(game.get("linescore"), dict) else {}
    totals = linescore.get("totals") if isinstance(linescore.get("totals"), dict) else {}
    side_totals = totals.get(side) if isinstance(totals.get(side), dict) else {}
    if side_totals.get("runs") is not None:
        return side_totals.get("runs")
    teams = linescore.get("teams") if isinstance(linescore.get("teams"), dict) else {}
    side_team = teams.get(side) if isinstance(teams.get(side), dict) else {}
    return side_team.get("runs")


def game_sort_key(game: Dict[str, Any]) -> Tuple[str, str]:
    return str(game.get("game_time") or game.get("start_time") or ""), str(game.get("id") or "")


def finished_game_url(game_id: str, card_date: str, game_pk: Any) -> str:
    query = f"id={game_id}&date={card_date}&sport=baseball&league=mlb"
    if game_pk is not None:
        query += f"&gamePk={game_pk}"
    return f"finished-game.html?{query}"


def numeric(value: Any) -> Optional[float]:
    if value in (None, "", "-"):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def compact_dict(value: Any) -> Dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    return {
        key: item
        for key, item in value.items()
        if item is not None and item != {} and item != [] and item != ""
    }


def newest_timestamp(*values: Any) -> Optional[str]:
    candidates = [str(value) for value in values if value]
    return max(candidates) if candidates else None


def write_json_atomic(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


if __name__ == "__main__":
    raise SystemExit(main())
