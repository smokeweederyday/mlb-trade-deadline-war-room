#!/usr/bin/env python3
from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import date, datetime, timezone
import json
from pathlib import Path
import sys
import time
from typing import Any, Iterable, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

API_BASE = "https://statsapi.mlb.com/api/v1"


@dataclass(frozen=True)
class League:
    slug: str
    label: str
    sport_id: int


LEAGUES: dict[str, League] = {
    "triple-a": League("triple-a", "Triple-A", 11),
    "double-a": League("double-a", "Double-A", 12),
    "high-a": League("high-a", "High-A", 13),
    "single-a": League("single-a", "Single-A", 14),
    "rookie": League("rookie", "Rookie", 16),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Fetch complete affiliated Minor League Baseball schedules from the MLB Stats API "
            "and write static season archives for Today's Card."
        )
    )
    parser.add_argument("--season", type=int, default=date.today().year)
    parser.add_argument(
        "--league",
        action="append",
        choices=sorted(LEAGUES),
        help="Limit the build to one or more leagues. Repeat this option as needed.",
    )
    parser.add_argument(
        "--date",
        dest="focus_date",
        help="Refresh one YYYY-MM-DD date and merge it into the season archive.",
    )
    parser.add_argument(
        "--daily-only",
        action="store_true",
        help="With --date, write only data/cards/YYYY-MM-DD league shards and leave season archives unchanged.",
    )
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="Repository root. Defaults to the parent of scripts/.",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=45.0,
        help="HTTP timeout in seconds.",
    )
    parser.add_argument(
        "--retries",
        type=int,
        default=4,
        help="Number of HTTP attempts per league.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    validate_args(args)

    chosen = [LEAGUES[slug] for slug in (args.league or LEAGUES.keys())]
    output_dir = args.root / "data" / "schedules" / "baseball" / str(args.season)
    output_dir.mkdir(parents=True, exist_ok=True)

    manifest_leagues: list[dict[str, Any]] = []
    failures: list[str] = []

    print(f"Minor League schedule build: season {args.season}")
    if args.focus_date:
        print(f"Refresh mode: {args.focus_date}")

    for league in chosen:
        print(f"\n=== {league.label} (sportId {league.sport_id}) ===")
        try:
            payload = fetch_schedule(
                league=league,
                season=args.season,
                focus_date=args.focus_date,
                timeout=args.timeout,
                retries=args.retries,
            )
            fetched_events = normalize_schedule(payload, league)
            season_path = output_dir / f"{league.slug}.json"

            if args.daily_only:
                daily_events = [
                    event for event in fetched_events
                    if event.get("date") == args.focus_date
                ]
                write_daily_file(
                    root=args.root,
                    league=league,
                    date_string=args.focus_date,
                    events=daily_events,
                    source_url=payload.get("_source_url", ""),
                )
                print(f"Wrote {len(daily_events):,} daily games; season archive unchanged.")
                manifest_leagues.append(
                    {
                        "id": league.slug,
                        "label": league.label,
                        "sport_id": league.sport_id,
                        "event_count": len(daily_events),
                        "date_count": 1 if daily_events else 0,
                        "first_date": args.focus_date if daily_events else None,
                        "last_date": args.focus_date if daily_events else None,
                        "path": f"data/cards/{args.focus_date}/{league.slug}.json",
                    }
                )
                continue

            if args.focus_date:
                existing = read_existing_events(season_path)
                merged_events = merge_date(existing, fetched_events, args.focus_date)
            else:
                merged_events = fetched_events

            document = build_document(
                league=league,
                season=args.season,
                events=merged_events,
                source_url=payload.get("_source_url", ""),
                focus_date=args.focus_date,
            )
            write_json_atomic(season_path, document)

            if args.focus_date:
                write_daily_file(
                    root=args.root,
                    league=league,
                    date_string=args.focus_date,
                    events=[event for event in merged_events if event.get("date") == args.focus_date],
                    source_url=payload.get("_source_url", ""),
                )

            dates = sorted({event["date"] for event in merged_events if event.get("date")})
            print(f"Wrote {len(merged_events):,} games to {season_path}")
            if dates:
                print(f"Coverage: {dates[0]} through {dates[-1]} ({len(dates)} dates)")

            manifest_leagues.append(
                {
                    "id": league.slug,
                    "label": league.label,
                    "sport_id": league.sport_id,
                    "event_count": len(merged_events),
                    "date_count": len(dates),
                    "first_date": dates[0] if dates else None,
                    "last_date": dates[-1] if dates else None,
                    "path": f"data/schedules/baseball/{args.season}/{league.slug}.json",
                }
            )
        except Exception as exc:  # noqa: BLE001 - command should continue and report all leagues
            failures.append(f"{league.label}: {exc}")
            print(f"FAIL: {league.label}: {exc}", file=sys.stderr)

    manifest = {
        "schema_version": "1.0",
        "sport": "baseball",
        "season": args.season,
        "updated_at": utc_now(),
        "refresh_date": args.focus_date,
        "leagues": manifest_leagues,
    }
    if not args.daily_only:
        write_json_atomic(output_dir / "manifest.json", manifest)

    if failures:
        print("\nMinor League schedule build completed with failures:", file=sys.stderr)
        for failure in failures:
            print(f"- {failure}", file=sys.stderr)
        return 1

    print("\nPASS: affiliated Minor League season schedules are ready for Today’s Card.")
    return 0


def validate_args(args: argparse.Namespace) -> None:
    if args.season < 1900 or args.season > 2200:
        raise SystemExit("--season must be a four-digit year.")
    if args.daily_only and not args.focus_date:
        raise SystemExit("--daily-only requires --date.")
    if args.focus_date:
        try:
            parsed = datetime.strptime(args.focus_date, "%Y-%m-%d").date()
        except ValueError as exc:
            raise SystemExit("--date must use YYYY-MM-DD.") from exc
        if parsed.year != args.season:
            raise SystemExit("--date must fall inside --season.")
    if args.retries < 1:
        raise SystemExit("--retries must be at least 1.")


def fetch_schedule(
    *,
    league: League,
    season: int,
    focus_date: Optional[str],
    timeout: float,
    retries: int,
) -> dict[str, Any]:
    params: dict[str, Any] = {
        "sportId": league.sport_id,
        "season": season,
        "hydrate": "team,venue,probablePitcher,linescore,decisions",
    }
    if focus_date:
        params["startDate"] = focus_date
        params["endDate"] = focus_date

    url = f"{API_BASE}/schedule?{urlencode(params)}"
    request = Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "BoringBetsScheduleBuilder/1.0",
        },
    )

    last_error: Optional[Exception] = None
    for attempt in range(1, retries + 1):
        try:
            with urlopen(request, timeout=timeout) as response:  # noqa: S310 - fixed official API host
                payload = json.load(response)
            payload["_source_url"] = url
            return payload
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
            last_error = exc
            if attempt >= retries:
                break
            delay = min(2 ** (attempt - 1), 8)
            print(f"Attempt {attempt} failed; retrying in {delay}s: {exc}")
            time.sleep(delay)

    raise RuntimeError(f"Unable to fetch {league.label} schedule after {retries} attempts: {last_error}")


def normalize_schedule(payload: dict[str, Any], league: League) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for date_block in payload.get("dates", []):
        schedule_date = str(date_block.get("date") or "")
        for game in date_block.get("games", []):
            events.append(normalize_game(game, league, schedule_date))
    events.sort(key=sort_key)
    return events


def normalize_game(game: dict[str, Any], league: League, schedule_date: str) -> dict[str, Any]:
    game_pk = game.get("gamePk")
    teams = game.get("teams") or {}
    away_info = teams.get("away") or {}
    home_info = teams.get("home") or {}
    away_team = away_info.get("team") or {}
    home_team = home_info.get("team") or {}
    status = game.get("status") or {}
    venue = game.get("venue") or {}

    event_id = f"{league.slug}-{game_pk}" if game_pk is not None else f"{league.slug}-{schedule_date}-{len(str(game))}"

    away_pitcher = away_info.get("probablePitcher") or {}
    home_pitcher = home_info.get("probablePitcher") or {}

    return {
        "id": event_id,
        "game_pk": game_pk,
        "date": schedule_date or iso_date_from_timestamp(game.get("gameDate")),
        "start_time": game.get("gameDate"),
        "status": status.get("detailedState") or status.get("abstractGameState") or "Scheduled",
        "abstract_status": status.get("abstractGameState"),
        "league": league.slug,
        "sport_id": league.sport_id,
        "game_type": game.get("gameType"),
        "game_number": game.get("gameNumber"),
        "double_header": game.get("doubleHeader"),
        "series_description": game.get("seriesDescription"),
        "venue": {
            "id": venue.get("id"),
            "name": venue.get("name") or "",
        },
        "away": normalize_team(away_team, away_info),
        "home": normalize_team(home_team, home_info),
        "away_detail": away_pitcher.get("fullName") or "Starter TBD",
        "home_detail": home_pitcher.get("fullName") or "Starter TBD",
        "linescore": normalize_linescore(game.get("linescore") or {}, away_info, home_info),
        "decisions": normalize_decisions(game.get("decisions") or {}),
        "game_url": (
            f"game.html?id={event_id}&sport=baseball&league={league.slug}"
            + (f"&gamePk={game_pk}" if game_pk is not None else "")
        ),
        "live_url": (
            f"live.html?id={event_id}&sport=baseball&league={league.slug}"
            + (f"&gamePk={game_pk}" if game_pk is not None else "")
        ),
    }


def normalize_linescore(
    linescore: dict[str, Any],
    away_info: dict[str, Any],
    home_info: dict[str, Any],
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
    return {
        "scheduled_innings": linescore.get("scheduledInnings"),
        "current_inning": linescore.get("currentInning"),
        "current_inning_ordinal": linescore.get("currentInningOrdinal"),
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


def normalize_team(team: dict[str, Any], team_info: dict[str, Any]) -> dict[str, Any]:
    league_record = team_info.get("leagueRecord") or {}
    abbreviation = (
        team.get("abbreviation")
        or team.get("fileCode")
        or team.get("teamCode")
        or team.get("shortName")
        or team.get("name")
        or "TBD"
    )
    return {
        "id": team.get("id"),
        "abbreviation": abbreviation,
        "name": team.get("name") or abbreviation,
        "score": team_info.get("score"),
        "record": {
            "wins": league_record.get("wins"),
            "losses": league_record.get("losses"),
            "pct": league_record.get("pct"),
        },
    }


def build_document(
    *,
    league: League,
    season: int,
    events: list[dict[str, Any]],
    source_url: str,
    focus_date: Optional[str],
) -> dict[str, Any]:
    dates = sorted({event["date"] for event in events if event.get("date")})
    return {
        "schema_version": "1.0",
        "sport": "baseball",
        "league": {
            "id": league.slug,
            "label": league.label,
            "sport_id": league.sport_id,
        },
        "season": season,
        "updated_at": utc_now(),
        "refresh_date": focus_date,
        "source": {
            "provider": "MLB Stats API",
            "url": source_url,
        },
        "coverage": {
            "event_count": len(events),
            "date_count": len(dates),
            "first_date": dates[0] if dates else None,
            "last_date": dates[-1] if dates else None,
        },
        "events": events,
    }


def write_daily_file(
    *,
    root: Path,
    league: League,
    date_string: str,
    events: list[dict[str, Any]],
    source_url: str,
) -> None:
    target = root / "data" / "cards" / date_string / f"{league.slug}.json"
    document = {
        "schema_version": "1.0",
        "sport": "baseball",
        "league": league.slug,
        "date": date_string,
        "updated_at": utc_now(),
        "source": {"provider": "MLB Stats API", "url": source_url},
        "events": events,
    }
    write_json_atomic(target, document)
    print(f"Wrote daily shard: {target}")


def read_existing_events(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    try:
        payload = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Cannot read existing season archive {path}: {exc}") from exc
    events = payload.get("events")
    if not isinstance(events, list):
        raise RuntimeError(f"Existing season archive has no events list: {path}")
    return events


def merge_date(
    existing: Iterable[dict[str, Any]],
    replacement: Iterable[dict[str, Any]],
    focus_date: str,
) -> list[dict[str, Any]]:
    merged = [event for event in existing if event.get("date") != focus_date]
    merged.extend(replacement)
    deduped: dict[str, dict[str, Any]] = {}
    for event in merged:
        deduped[str(event.get("id") or event.get("game_pk") or sort_key(event))] = event
    return sorted(deduped.values(), key=sort_key)


def sort_key(event: dict[str, Any]) -> tuple[str, str, str]:
    return (
        str(event.get("date") or ""),
        str(event.get("start_time") or ""),
        str(event.get("id") or ""),
    )


def iso_date_from_timestamp(value: Any) -> Optional[str]:
    if not value:
        return None
    text = str(value)
    return text[:10] if len(text) >= 10 else None


def write_json_atomic(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    temporary.replace(path)


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


if __name__ == "__main__":
    raise SystemExit(main())
