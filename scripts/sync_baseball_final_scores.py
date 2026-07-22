#!/usr/bin/env python3
from __future__ import annotations

import argparse
from datetime import date, datetime, timedelta, timezone
import json
from pathlib import Path
import sys
import time
from typing import Any, Optional
from zoneinfo import ZoneInfo
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

API_BASE = "https://statsapi.mlb.com/api/v1"
EASTERN = ZoneInfo("America/New_York")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Synchronize official MLB final statuses, scores, inning lines, and decisions "
            "into the enriched data/games date shards and a lightweight live-status mirror."
        )
    )
    parser.add_argument("--season", type=int, default=date.today().year)
    parser.add_argument(
        "--date",
        action="append",
        dest="dates",
        help="Refresh one YYYY-MM-DD date. Repeat as needed. Overrides the season range.",
    )
    parser.add_argument(
        "--through",
        help="Refresh the season through this YYYY-MM-DD date. Defaults to yesterday.",
    )
    parser.add_argument(
        "--include-today",
        action="store_true",
        help="Include the computer's local date when --through is omitted.",
    )
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="Repository root. Defaults to the parent of scripts/.",
    )
    parser.add_argument("--timeout", type=float, default=60.0)
    parser.add_argument("--retries", type=int, default=4)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    validate_args(args)

    requested_dates = sorted(set(args.dates or []))
    if requested_dates:
        start_date = requested_dates[0]
        end_date = requested_dates[-1]
    else:
        start_date = f"{args.season:04d}-01-01"
        if args.through:
            end_date = args.through
        else:
            local_today = datetime.now(EASTERN).date()
            end_date = (local_today if args.include_today else local_today - timedelta(days=1)).isoformat()

    print(f"MLB final-score sync: {start_date} through {end_date}")
    payload = fetch_schedule(
        season=args.season,
        start_date=start_date,
        end_date=end_date,
        timeout=args.timeout,
        retries=args.retries,
    )

    schedule_by_date = normalize_schedule(payload)
    if requested_dates:
        schedule_by_date = {day: schedule_by_date.get(day, []) for day in requested_dates}

    games_dir = args.root / "data" / "games"
    live_dir = args.root / "data" / "live-games"
    games_dir.mkdir(parents=True, exist_ok=True)
    live_dir.mkdir(parents=True, exist_ok=True)

    files_written = 0
    games_updated = 0
    games_created = 0
    scoreless_final = 0

    for schedule_date, official_games in sorted(schedule_by_date.items()):
        if schedule_date > end_date:
            continue
        primary_path = games_dir / f"{schedule_date}.json"
        legacy_path = live_dir / f"{schedule_date}.json"
        source_path = primary_path if primary_path.exists() else legacy_path
        document = read_daily_document(source_path, schedule_date)
        local_games = [game for game in document.get("games", []) if isinstance(game, dict)]
        by_pk = {
            int(game.get("mlb_game_pk") or game.get("game_pk")): game
            for game in local_games
            if str(game.get("mlb_game_pk") or game.get("game_pk") or "").isdigit()
        }

        changed = False
        for official in official_games:
            game_pk = official.get("mlb_game_pk")
            local = by_pk.get(game_pk)
            if local is None:
                local = find_by_teams(local_games, official)
            if local is None:
                local = build_minimal_game(official, local_games)
                local_games.append(local)
                if game_pk is not None:
                    by_pk[game_pk] = local
                games_created += 1
                changed = True

            if merge_official_result(local, official):
                games_updated += 1
                changed = True

            if is_final_status(official.get("status")) and not has_score(official):
                scoreless_final += 1

        document["schema_version"] = document.get("schema_version") or "1.1"
        document["date"] = schedule_date
        document["updated_at"] = utc_now()
        document["result_sync"] = {
            "source": "MLB Stats API schedule",
            "synced_at": utc_now(),
            "official_game_count": len(official_games),
        }
        document["games"] = sorted(local_games, key=game_sort_key)

        if changed or not primary_path.exists():
            write_json_atomic(primary_path, document)
            write_json_atomic(legacy_path, build_live_status_document(document, schedule_date))
            files_written += 1
            print(
                f"{schedule_date}: {len(official_games)} official games -> "
                f"{primary_path} + lightweight live mirror"
            )

    print("\nResult sync summary")
    print(f"Daily files written: {files_written}")
    print(f"Games updated: {games_updated}")
    print(f"Missing local games created: {games_created}")
    print(f"Official FINAL games without scores: {scoreless_final}")

    if scoreless_final:
        print("WARNING: at least one official final game did not include a score.", file=sys.stderr)

    print("PASS: MLB past-date cards have synchronized final-score data.")
    return 0


def validate_args(args: argparse.Namespace) -> None:
    if args.season < 1900 or args.season > 2200:
        raise SystemExit("--season must be a four-digit year.")
    if args.retries < 1:
        raise SystemExit("--retries must be at least 1.")
    for value in [*(args.dates or []), *([args.through] if args.through else [])]:
        try:
            parsed = datetime.strptime(value, "%Y-%m-%d").date()
        except ValueError as exc:
            raise SystemExit("Dates must use YYYY-MM-DD.") from exc
        if parsed.year != args.season:
            raise SystemExit(f"{value} does not fall inside season {args.season}.")


def fetch_schedule(
    *, season: int, start_date: str, end_date: str, timeout: float, retries: int
) -> dict[str, Any]:
    params = {
        "sportId": 1,
        "season": season,
        "startDate": start_date,
        "endDate": end_date,
        "hydrate": "team,venue,probablePitcher,linescore,decisions",
    }
    url = f"{API_BASE}/schedule?{urlencode(params)}"
    request = Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "BoringBetsFinalScoreSync/1.0",
        },
    )

    last_error: Optional[Exception] = None
    for attempt in range(1, retries + 1):
        try:
            with urlopen(request, timeout=timeout) as response:  # noqa: S310 - fixed official host
                return json.load(response)
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
            last_error = exc
            if attempt >= retries:
                break
            delay = min(2 ** (attempt - 1), 8)
            print(f"Attempt {attempt} failed; retrying in {delay}s: {exc}")
            time.sleep(delay)

    raise RuntimeError(f"Unable to fetch MLB schedule after {retries} attempts: {last_error}")


def normalize_schedule(payload: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    result: dict[str, list[dict[str, Any]]] = {}
    for date_block in payload.get("dates") or []:
        schedule_date = str(date_block.get("date") or "")
        if not schedule_date:
            continue
        result[schedule_date] = [
            normalize_official_game(game, schedule_date)
            for game in date_block.get("games") or []
            if isinstance(game, dict)
        ]
    return result


def normalize_official_game(game: dict[str, Any], schedule_date: str) -> dict[str, Any]:
    teams = game.get("teams") or {}
    away_info = teams.get("away") or {}
    home_info = teams.get("home") or {}
    away_team = away_info.get("team") or {}
    home_team = home_info.get("team") or {}
    status = game.get("status") or {}
    venue = game.get("venue") or {}

    away_abbr = team_abbreviation(away_team)
    home_abbr = team_abbreviation(home_team)
    game_pk = game.get("gamePk")
    away_pitcher = away_info.get("probablePitcher") or {}
    home_pitcher = home_info.get("probablePitcher") or {}
    away_record = away_info.get("leagueRecord") or {}
    home_record = home_info.get("leagueRecord") or {}

    return {
        "id": f"{schedule_date}-{away_abbr.lower()}-{home_abbr.lower()}",
        "mlb_game_pk": game_pk,
        "date": schedule_date,
        "game_time": game.get("gameDate"),
        "status": status.get("detailedState") or status.get("abstractGameState") or "Scheduled",
        "abstract_status": status.get("abstractGameState"),
        "venue": {"id": venue.get("id"), "name": venue.get("name") or ""},
        "away_team": {
            "team_id": away_team.get("id"),
            "abbr": away_abbr,
            "name": away_team.get("name") or away_abbr,
            "record": {
                "wins": away_record.get("wins"),
                "losses": away_record.get("losses"),
                "pct": away_record.get("pct"),
            },
        },
        "home_team": {
            "team_id": home_team.get("id"),
            "abbr": home_abbr,
            "name": home_team.get("name") or home_abbr,
            "record": {
                "wins": home_record.get("wins"),
                "losses": home_record.get("losses"),
                "pct": home_record.get("pct"),
            },
        },
        "pitchers": {
            "away": {
                "id": away_pitcher.get("id"),
                "name": away_pitcher.get("fullName") or "Starter TBD",
                "status": "probable" if away_pitcher else "unknown",
            },
            "home": {
                "id": home_pitcher.get("id"),
                "name": home_pitcher.get("fullName") or "Starter TBD",
                "status": "probable" if home_pitcher else "unknown",
            },
        },
        "score": {
            "away": away_info.get("score"),
            "home": home_info.get("score"),
        },
        "linescore": normalize_linescore(game.get("linescore") or {}, away_info, home_info),
        "decisions": normalize_decisions(game.get("decisions") or {}),
    }


def normalize_linescore(
    linescore: dict[str, Any], away_info: dict[str, Any], home_info: dict[str, Any]
) -> dict[str, Any]:
    innings: list[dict[str, Any]] = []
    for inning in linescore.get("innings") or []:
        away = inning.get("away") or {}
        home = inning.get("home") or {}
        innings.append(
            {
                "num": inning.get("num"),
                "ordinal": inning.get("ordinalNum"),
                "away": away.get("runs"),
                "home": home.get("runs"),
            }
        )

    teams = linescore.get("teams") or {}
    away_total = teams.get("away") or {}
    home_total = teams.get("home") or {}

    offense = linescore.get("offense") or {}
    bases = {
        "first": bool(offense.get("first")),
        "second": bool(offense.get("second")),
        "third": bool(offense.get("third")),
    }

    inning_state = str(linescore.get("inningState") or "").strip()
    is_top_inning = linescore.get("isTopInning")

    if is_top_inning is True:
        inning_half = "top"
    elif is_top_inning is False and linescore.get("currentInning") is not None:
        inning_half = "bottom"
    elif "top" in inning_state.lower():
        inning_half = "top"
    elif "bottom" in inning_state.lower():
        inning_half = "bottom"
    elif "middle" in inning_state.lower():
        inning_half = "middle"
    elif "end" in inning_state.lower():
        inning_half = "end"
    else:
        inning_half = ""

    return {
        "scheduled_innings": linescore.get("scheduledInnings"),
        "current_inning": linescore.get("currentInning"),
        "current_inning_ordinal": linescore.get("currentInningOrdinal"),
        "inning_state": inning_state,
        "inning_half": inning_half,
        "balls": linescore.get("balls"),
        "strikes": linescore.get("strikes"),
        "outs": linescore.get("outs"),
        "bases": bases,
        "runners_on": sum(1 for occupied in bases.values() if occupied),
        "innings": innings,
        "totals": {
            "away": {
                "runs": away_total.get("runs", away_info.get("score")),
                "hits": away_total.get("hits"),
                "errors": away_total.get("errors"),
            },
            "home": {
                "runs": home_total.get("runs", home_info.get("score")),
                "hits": home_total.get("hits"),
                "errors": home_total.get("errors"),
            },
        },
    }


def normalize_decisions(decisions: dict[str, Any]) -> dict[str, Any]:
    normalized: dict[str, Any] = {}
    for key in ("winner", "loser", "save"):
        person = decisions.get(key) or {}
        if person:
            normalized[key] = {
                "id": person.get("id"),
                "name": person.get("fullName") or person.get("name") or "",
            }
    return normalized


def read_daily_document(path: Path, schedule_date: str) -> dict[str, Any]:
    if not path.exists():
        return {"schema_version": "1.1", "date": schedule_date, "games": []}
    try:
        data = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Unable to read {path}: {exc}") from exc
    if not isinstance(data, dict):
        raise RuntimeError(f"{path} must contain a JSON object.")
    if not isinstance(data.get("games"), list):
        data["games"] = []
    return data


def find_by_teams(local_games: list[dict[str, Any]], official: dict[str, Any]) -> Optional[dict[str, Any]]:
    away_id = official.get("away_team", {}).get("team_id")
    home_id = official.get("home_team", {}).get("team_id")
    start = official.get("game_time")
    candidates: list[dict[str, Any]] = []
    for game in local_games:
        if (
            game.get("away_team", {}).get("team_id") == away_id
            and game.get("home_team", {}).get("team_id") == home_id
        ):
            candidates.append(game)
    if len(candidates) == 1:
        return candidates[0]
    for game in candidates:
        if game.get("game_time") == start or game.get("start_time") == start:
            return game
    return None


def build_minimal_game(official: dict[str, Any], existing: list[dict[str, Any]]) -> dict[str, Any]:
    stable_id = str(official.get("id") or "mlb-game")
    used = {str(game.get("id")) for game in existing}
    if stable_id in used:
        stable_id = f"{stable_id}-{official.get('mlb_game_pk')}"
    return {
        "id": stable_id,
        "mlb_game_pk": official.get("mlb_game_pk"),
        "date": official.get("date"),
        "game_time": official.get("game_time"),
        "sport": "MLB",
        "status": official.get("status"),
        "venue": official.get("venue"),
        "away_team": official.get("away_team"),
        "home_team": official.get("home_team"),
        "pitchers": {},
        "lineups": {},
        "pitcher_vs_lineup": {},
        "bullpens": {},
        "weather": {},
        "market": {},
        "controls": {"default_timeframe": "last_30", "default_location": "all"},
    }


def merge_official_result(local: dict[str, Any], official: dict[str, Any]) -> bool:
    changed = False
    updates = {
        "mlb_game_pk": official.get("mlb_game_pk"),
        "date": official.get("date"),
        "game_time": official.get("game_time"),
        "status": official.get("status"),
        "abstract_status": official.get("abstract_status"),
        "score": official.get("score"),
        "linescore": official.get("linescore"),
        "decisions": official.get("decisions"),
    }
    for key, value in updates.items():
        if value is not None and local.get(key) != value:
            local[key] = value
            changed = True

    for side in ("away_team", "home_team"):
        existing_team = local.get(side)
        if not isinstance(existing_team, dict):
            local[side] = dict(official.get(side) or {})
            changed = True
            continue
        for key, value in (official.get(side) or {}).items():
            if value is not None and existing_team.get(key) != value:
                existing_team[key] = value
                changed = True

    official_pitchers = official.get("pitchers") or {}
    local_pitchers = local.get("pitchers") if isinstance(local.get("pitchers"), dict) else {}
    for side in ("away", "home"):
        incoming_pitcher = official_pitchers.get(side)
        if not isinstance(incoming_pitcher, dict):
            continue
        current_pitcher = local_pitchers.get(side) if isinstance(local_pitchers.get(side), dict) else {}
        for key in ("id", "name", "status"):
            value = incoming_pitcher.get(key)
            if value is not None and current_pitcher.get(key) != value:
                current_pitcher[key] = value
                changed = True
        local_pitchers[side] = current_pitcher
    if local_pitchers:
        local["pitchers"] = local_pitchers

    venue = local.get("venue")
    if not isinstance(venue, dict):
        local["venue"] = dict(official.get("venue") or {})
        changed = True
    else:
        for key, value in (official.get("venue") or {}).items():
            if value is not None and venue.get(key) != value:
                venue[key] = value
                changed = True

    return changed


def build_live_status_document(document: dict[str, Any], schedule_date: str) -> dict[str, Any]:
    games = []
    for game in document.get("games") or []:
        if not isinstance(game, dict):
            continue
        games.append(
            {
                key: game.get(key)
                for key in (
                    "id",
                    "mlb_game_pk",
                    "date",
                    "game_time",
                    "sport",
                    "status",
                    "abstract_status",
                    "venue",
                    "away_team",
                    "home_team",
                    "pitchers",
                    "score",
                    "linescore",
                    "decisions",
                )
                if game.get(key) is not None
            }
        )

    return {
        "schema_version": "1.2",
        "date": schedule_date,
        "updated_at": document.get("updated_at") or utc_now(),
        "result_sync": document.get("result_sync") or {},
        "games": games,
    }


def has_score(game: dict[str, Any]) -> bool:
    score = game.get("score") or {}
    return score.get("away") is not None and score.get("home") is not None


def is_final_status(value: Any) -> bool:
    text = str(value or "").lower()
    return any(token in text for token in ("final", "completed", "game over"))


def game_sort_key(game: dict[str, Any]) -> tuple[str, int]:
    return str(game.get("game_time") or ""), int(game.get("mlb_game_pk") or 0)


def team_abbreviation(team: dict[str, Any]) -> str:
    value = (
        team.get("abbreviation")
        or team.get("fileCode")
        or team.get("teamCode")
        or team.get("shortName")
        or team.get("name")
        or "TBD"
    )
    return str(value).upper().replace(" ", "")[:4]


def write_json_atomic(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    temp.replace(path)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


if __name__ == "__main__":
    raise SystemExit(main())
