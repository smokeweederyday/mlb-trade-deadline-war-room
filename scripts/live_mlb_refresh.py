#!/usr/bin/env python3
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from copy import deepcopy
from datetime import datetime, timezone
import json
from pathlib import Path
import signal
import sys
import time
from typing import Any
import urllib.request
from zoneinfo import ZoneInfo

from sync_baseball_final_scores import fetch_schedule, normalize_schedule

EASTERN = ZoneInfo("America/New_York")
LIVE_FEED_URL = "https://statsapi.mlb.com/api/v1.1/game/{game_pk}/feed/live"
STOP_REQUESTED = False


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Continuously refresh a lean MLB live-state mirror without "
            "rewriting the enriched daily game shard."
        )
    )
    parser.add_argument(
        "--date",
        default=datetime.now(EASTERN).date().isoformat(),
        help="YYYY-MM-DD date to refresh. Defaults to today in America/New_York.",
    )
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--interval", type=float, default=2.0)
    parser.add_argument("--pregame-interval", type=float, default=10.0)
    parser.add_argument("--settled-interval", type=float, default=60.0)
    parser.add_argument("--timeout", type=float, default=10.0)
    parser.add_argument("--retries", type=int, default=2)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--once", action="store_true")
    return parser.parse_args()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def install_signal_handlers() -> None:
    def request_stop(_signum: int, _frame: Any) -> None:
        global STOP_REQUESTED
        STOP_REQUESTED = True

    signal.signal(signal.SIGINT, request_stop)
    signal.signal(signal.SIGTERM, request_stop)


def fetch_json(url: str, timeout: float) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "BoringBets-LiveMLB/1.0",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = json.load(response)
    return payload if isinstance(payload, dict) else {}


def status_text(game: dict[str, Any]) -> str:
    return " ".join(
        str(game.get(key) or "")
        for key in ("status", "abstract_status")
    ).lower()


def is_live_game(game: dict[str, Any]) -> bool:
    text = status_text(game)
    return any(
        token in text
        for token in (
            "live",
            "in progress",
            "warmup",
            "manager challenge",
            "review",
            "delayed",
        )
    ) and not any(token in text for token in ("final", "completed", "game over"))


def is_settled_game(game: dict[str, Any]) -> bool:
    text = status_text(game)
    return any(
        token in text
        for token in (
            "final",
            "completed",
            "game over",
            "postponed",
            "cancelled",
            "canceled",
        )
    )


def compact_team(value: Any) -> dict[str, Any]:
    team = value if isinstance(value, dict) else {}
    keep = (
        "id",
        "team_id",
        "abbr",
        "abbreviation",
        "name",
        "teamName",
        "locationName",
        "shortName",
        "fileCode",
        "teamCode",
        "record",
    )
    return {key: deepcopy(team.get(key)) for key in keep if team.get(key) is not None}


def compact_pitcher(value: Any) -> dict[str, Any]:
    pitcher = value if isinstance(value, dict) else {}
    keep = ("id", "name", "fullName", "throws", "status", "profile_url")
    return {key: deepcopy(pitcher.get(key)) for key in keep if pitcher.get(key) is not None}


def compact_pitchers(value: Any) -> dict[str, Any]:
    pitchers = value if isinstance(value, dict) else {}
    result: dict[str, Any] = {}
    for side in ("away", "home"):
        compact = compact_pitcher(pitchers.get(side))
        if compact:
            result[side] = compact
    return result


def compact_game(game: dict[str, Any], schedule_date: str) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key in (
        "id",
        "mlb_game_pk",
        "game_pk",
        "date",
        "game_time",
        "sport",
        "status",
        "abstract_status",
        "score",
        "linescore",
        "decisions",
        "live_feed_updated_at",
    ):
        if game.get(key) is not None:
            result[key] = deepcopy(game.get(key))

    result.setdefault("date", schedule_date)

    venue = game.get("venue")
    if isinstance(venue, dict):
        result["venue"] = {
            key: deepcopy(venue.get(key))
            for key in ("id", "name")
            if venue.get(key) is not None
        }

    away = compact_team(game.get("away_team"))
    home = compact_team(game.get("home_team"))
    if away:
        result["away_team"] = away
    if home:
        result["home_team"] = home

    pitchers = compact_pitchers(game.get("pitchers"))
    if pitchers:
        result["pitchers"] = pitchers

    return result


def live_feed_game_pk(game: dict[str, Any]) -> int | None:
    value = game.get("mlb_game_pk") or game.get("game_pk")
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def participant_from_feed(value: Any) -> dict[str, Any]:
    person = value if isinstance(value, dict) else {}
    result: dict[str, Any] = {}
    if person.get("id") is not None:
        result["id"] = person.get("id")
    if person.get("fullName"):
        result["name"] = person.get("fullName")
    return result


def apply_live_feed(game: dict[str, Any], feed: dict[str, Any]) -> None:
    game_data = feed.get("gameData") if isinstance(feed.get("gameData"), dict) else {}
    live_data = feed.get("liveData") if isinstance(feed.get("liveData"), dict) else {}
    status = game_data.get("status") if isinstance(game_data.get("status"), dict) else {}
    linescore = live_data.get("linescore") if isinstance(live_data.get("linescore"), dict) else {}
    plays = live_data.get("plays") if isinstance(live_data.get("plays"), dict) else {}
    current_play = plays.get("currentPlay") if isinstance(plays.get("currentPlay"), dict) else {}
    matchup = current_play.get("matchup") if isinstance(current_play.get("matchup"), dict) else {}

    if status.get("detailedState"):
        game["status"] = status.get("detailedState")
    if status.get("abstractGameState"):
        game["abstract_status"] = status.get("abstractGameState")

    venue = game_data.get("venue") if isinstance(game_data.get("venue"), dict) else {}
    if venue:
        game["venue"] = {
            key: venue.get(key)
            for key in ("id", "name")
            if venue.get(key) is not None
        }

    teams = game_data.get("teams") if isinstance(game_data.get("teams"), dict) else {}
    for side in ("away", "home"):
        team = teams.get(side) if isinstance(teams.get(side), dict) else {}
        target = game.setdefault(f"{side}_team", {})
        if team.get("id") is not None:
            target["team_id"] = team.get("id")
        if team.get("name"):
            target["name"] = team.get("name")
        abbreviation = team.get("abbreviation") or team.get("fileCode")
        if abbreviation:
            target["abbr"] = abbreviation
        record = team.get("record") if isinstance(team.get("record"), dict) else {}
        league_record = record.get("leagueRecord") if isinstance(record.get("leagueRecord"), dict) else {}
        if league_record:
            target["record"] = {
                key: league_record.get(key)
                for key in ("wins", "losses", "pct")
                if league_record.get(key) is not None
            }

    team_lines = linescore.get("teams") if isinstance(linescore.get("teams"), dict) else {}
    away_lines = team_lines.get("away") if isinstance(team_lines.get("away"), dict) else {}
    home_lines = team_lines.get("home") if isinstance(team_lines.get("home"), dict) else {}
    game["score"] = {
        "away": away_lines.get("runs"),
        "home": home_lines.get("runs"),
    }

    offense = linescore.get("offense") if isinstance(linescore.get("offense"), dict) else {}
    bases = {
        "first": bool(offense.get("first")),
        "second": bool(offense.get("second")),
        "third": bool(offense.get("third")),
    }

    normalized_linescore = dict(game.get("linescore") or {})
    normalized_linescore.update(
        {
            "current_inning": linescore.get("currentInning"),
            "current_inning_ordinal": linescore.get("currentInningOrdinal"),
            "inning_state": linescore.get("inningState"),
            "inning_half": linescore.get("inningHalf"),
            "balls": linescore.get("balls"),
            "strikes": linescore.get("strikes"),
            "outs": linescore.get("outs"),
            "bases": bases,
            "runners_on": sum(1 for occupied in bases.values() if occupied),
        }
    )
    game["linescore"] = normalized_linescore

    pitcher = participant_from_feed(matchup.get("pitcher"))
    pitch_hand = matchup.get("pitchHand") if isinstance(matchup.get("pitchHand"), dict) else {}
    if pitch_hand.get("code"):
        pitcher["throws"] = pitch_hand.get("code")
    if pitcher:
        pitcher["status"] = "current"
        half = str(linescore.get("inningHalf") or "").lower()
        defensive_side = "home" if half == "top" else "away" if half == "bottom" else None
        if defensive_side:
            game.setdefault("pitchers", {})[defensive_side] = pitcher

    metadata = feed.get("metaData") if isinstance(feed.get("metaData"), dict) else {}
    game["live_feed_updated_at"] = metadata.get("timeStamp") or utc_now()


def fetch_live_feeds(games: list[dict[str, Any]], timeout: float, workers: int) -> None:
    candidates = [
        game
        for game in games
        if is_live_game(game) and live_feed_game_pk(game) is not None
    ]
    if not candidates:
        return

    with ThreadPoolExecutor(max_workers=max(1, min(workers, len(candidates)))) as executor:
        future_map = {
            executor.submit(
                fetch_json,
                LIVE_FEED_URL.format(game_pk=live_feed_game_pk(game)),
                timeout,
            ): game
            for game in candidates
        }
        for future in as_completed(future_map):
            game = future_map[future]
            try:
                apply_live_feed(game, future.result())
            except Exception as error:
                print(
                    f"WARN: live feed failed for game {live_feed_game_pk(game)}: {error}",
                    file=sys.stderr,
                    flush=True,
                )


def canonical_payload(payload: dict[str, Any]) -> str:
    copy = deepcopy(payload)
    copy.pop("updated_at", None)
    copy.pop("fetch_duration_ms", None)
    return json.dumps(copy, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def read_existing(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return {}


def write_json_atomic(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    temp.replace(path)


def refresh_once(args: argparse.Namespace) -> tuple[dict[str, int], bool]:
    started = time.monotonic()
    payload = fetch_schedule(
        season=int(args.date[:4]),
        start_date=args.date,
        end_date=args.date,
        timeout=args.timeout,
        retries=args.retries,
    )
    schedule = normalize_schedule(payload)
    games = [deepcopy(game) for game in schedule.get(args.date, []) if isinstance(game, dict)]
    fetch_live_feeds(games, args.timeout, args.workers)

    compact_games = [compact_game(game, args.date) for game in games]
    compact_games.sort(
        key=lambda game: (
            str(game.get("game_time") or ""),
            int(game.get("mlb_game_pk") or game.get("game_pk") or 0),
        )
    )

    counts = {
        "games": len(compact_games),
        "live": sum(1 for game in compact_games if is_live_game(game)),
        "settled": sum(1 for game in compact_games if is_settled_game(game)),
    }
    counts["open"] = max(0, counts["games"] - counts["settled"])

    document = {
        "schema_version": "2.0-live",
        "date": args.date,
        "updated_at": utc_now(),
        "source": "MLB Stats API schedule + game feed/live",
        "refresh_interval_seconds": args.interval,
        "games": compact_games,
        "fetch_duration_ms": round((time.monotonic() - started) * 1000),
    }

    target = args.root / "data" / "live-games" / f"{args.date}.json"
    existing = read_existing(target)
    changed = canonical_payload(existing) != canonical_payload(document)
    if changed:
        write_json_atomic(target, document)

    return counts, changed


def choose_delay(args: argparse.Namespace, counts: dict[str, int]) -> float:
    if counts.get("live", 0):
        return max(1.0, args.interval)
    if counts.get("open", 0):
        return max(3.0, args.pregame_interval)
    return max(15.0, args.settled_interval)


def main() -> int:
    args = parse_args()
    install_signal_handlers()

    if not args.date or len(args.date) != 10:
        raise SystemExit("--date must be YYYY-MM-DD")
    if args.interval < 1:
        raise SystemExit("--interval cannot be faster than one second")

    print(
        f"Boring Bets MLB live refresh: {args.date} "
        f"(live {args.interval:.1f}s, pregame {args.pregame_interval:.1f}s, "
        f"settled {args.settled_interval:.1f}s)",
        flush=True,
    )

    failures = 0
    while not STOP_REQUESTED:
        try:
            counts, changed = refresh_once(args)
            failures = 0
            print(
                f"{utc_now()} games={counts['games']} live={counts['live']} "
                f"open={counts['open']} changed={'yes' if changed else 'no'}",
                flush=True,
            )
            if args.once:
                break
            delay = choose_delay(args, counts)
        except Exception as error:
            failures += 1
            delay = min(60.0, max(args.interval, 2 ** min(failures, 5)))
            print(
                f"{utc_now()} ERROR: {error}; retrying in {delay:.1f}s",
                file=sys.stderr,
                flush=True,
            )
            if args.once:
                return 1

        deadline = time.monotonic() + delay
        while not STOP_REQUESTED and time.monotonic() < deadline:
            time.sleep(min(0.25, max(0.0, deadline - time.monotonic())))

    print("MLB live refresh stopped.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
