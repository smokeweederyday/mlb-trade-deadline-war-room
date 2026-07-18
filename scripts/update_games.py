#!/usr/bin/env python3

from __future__ import annotations

from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any
import json
import sys

from mlb.schedule import (
    fetch_schedule,
    parse_schedule,
)

from mlb.pitchers import (
    build_pitcher_snapshot,
    build_league_pitcher_cache,
    apply_league_pitcher_cache,
)

from mlb.offense import (
    build_team_offense_snapshot,
    build_league_offense_cache,
    apply_league_offense_cache,
)

from mlb.bullpen import (
    build_bullpen_snapshot,
)

from mlb.matchup_history import (
    build_game_career_bvp,
)
from mlb.lineups import (
    build_lineup_snapshot,
    annotate_lineup_for_pitcher,
)

from mlb.weather import (
    build_weather_snapshot,
)

from mlb.market import (
    build_market_snapshot,
)

from mlb.context import (
    build_context_snapshot,
)

from mlb.intelligence import (
    enrich_games as enrich_intelligence,
)


ROOT = Path(__file__).resolve().parents[1]

GAMES_FILE = ROOT / "data/games.json"
DAYS_FILE = ROOT / "data/days.json"
PLAYS_FILE = ROOT / "data/todays-card.json"
PLAYS_ARCHIVE_FILE = ROOT / "data/plays.json"
RESULTS_FILE = ROOT / "data/results.json"
EVALUATIONS_FILE = ROOT / "data/evaluations.json"


def load_json_file(
    path: Path,
    default: dict[str, Any],
) -> dict[str, Any]:
    if not path.exists():
        return default

    try:
        return json.loads(
            path.read_text(
                encoding="utf-8"
            )
        )
    except (
        json.JSONDecodeError,
        OSError,
    ) as error:
        print(
            f"Could not read {path.name}; "
            f"using safe defaults: {error}"
        )
        return default


def load_games_file() -> dict[str, Any]:
    return load_json_file(
        GAMES_FILE,
        {
            "schema_version": "3.2",
            "default_controls": {
                "timeframe": "last_30",
                "location": "all",
            },
            "games": [],
        },
    )


def create_default_workflow() -> dict[str, Any]:
    return {
        "research_state": "pending",
        "publication_state": "unpublished",
        "grading_state": "not_applicable",
        "archive_state": "active",
        "official_play_ids": [],
        "best_bet_id": None,
        "published_at": None,
        "graded_at": None,
        "archived_at": None,
    }


def normalize_workflow(
    workflow: dict[str, Any] | None,
) -> dict[str, Any]:
    normalized = create_default_workflow()
    normalized.update(workflow or {})

    if not isinstance(
        normalized.get("official_play_ids"),
        list,
    ):
        normalized["official_play_ids"] = []

    return normalized


def merge_schedule_game(
    existing: dict[str, Any] | None,
    schedule_game: dict[str, Any],
) -> dict[str, Any]:
    game = dict(existing or {})

    game["id"] = schedule_game["id"]
    game["mlb_game_pk"] = schedule_game.get(
        "mlb_game_pk"
    )
    game["date"] = schedule_game.get(
        "date"
    )
    game["game_time"] = schedule_game.get(
        "game_time"
    )
    game["sport"] = "MLB"
    game["status"] = schedule_game.get(
        "status",
        "scheduled",
    )
    game["venue"] = schedule_game.get(
        "venue",
        {},
    )
    game["away_team"] = schedule_game.get(
        "away_team",
        {},
    )
    game["home_team"] = schedule_game.get(
        "home_team",
        {},
    )

    game.setdefault(
        "controls",
        {
            "default_timeframe": "last_30",
            "default_location": "all",
        },
    )

    existing_pitchers = game.get(
        "pitchers",
        {},
    )

    game["pitchers"] = {
        "away": merge_pitcher(
            existing_pitchers.get("away"),
            schedule_game
            .get("pitchers", {})
            .get("away", {}),
        ),
        "home": merge_pitcher(
            existing_pitchers.get("home"),
            schedule_game
            .get("pitchers", {})
            .get("home", {}),
        ),
    }

    game["workflow"] = normalize_workflow(
        game.get("workflow")
    )

    game.setdefault("offense", {})
    game.setdefault("lineups", {})
    game.setdefault(
        "pitcher_vs_lineup",
        game.get(
            "pitcher_vs_projected_lineup",
            {},
        ),
    )
    game.setdefault("bullpens", {})
    game.setdefault("weather", {})
    game.setdefault("market", {})
    game.setdefault("injuries", [])
    game.setdefault("notes", "")

    game["last_updated"] = datetime.now(
        timezone.utc
    ).isoformat()

    return game


def merge_pitcher(
    existing: dict[str, Any] | None,
    incoming: dict[str, Any],
) -> dict[str, Any]:
    pitcher = dict(existing or {})

    incoming_id = incoming.get("id")
    existing_id = pitcher.get("id")

    if incoming_id and incoming_id != existing_id:
        pitcher = {}

    pitcher["id"] = incoming_id
    pitcher["name"] = incoming.get(
        "name",
        "Starter TBD",
    )
    pitcher["status"] = incoming.get(
        "status",
        "unknown",
    )

    pitcher.setdefault("age", None)
    pitcher.setdefault("throws", None)
    pitcher.setdefault("profile_url", "#")
    pitcher.setdefault(
        "stats",
        {
            "last_7": {
                "all": {},
                "home": {},
                "away": {},
            },
            "last_30": {
                "all": {},
                "home": {},
                "away": {},
            },
            "season": {
                "all": {},
                "home": {},
                "away": {},
            },
            "vs_lhh": {},
            "vs_rhh": {},
        },
    )

    return pitcher


def enrich_probable_pitchers(
    games: list[dict[str, Any]],
    target_date: str,
) -> list[dict[str, Any]]:
    """
    Populate probable starters with MLB API profile and stats.

    Each pitcher is fetched once per run. If one request fails,
    the existing pitcher record is preserved and the rest of
    the slate continues updating.
    """

    cache: dict[int, dict[str, Any]] = {}
    enriched_games = []

    for stored_game in games:
        game = dict(stored_game)

        pitchers = dict(
            game.get("pitchers", {})
        )

        for side in ("away", "home"):
            existing_pitcher = dict(
                pitchers.get(side, {})
            )

            pitcher_id = existing_pitcher.get(
                "id"
            )

            if not pitcher_id:
                continue

            try:
                numeric_pitcher_id = int(
                    pitcher_id
                )
            except (
                TypeError,
                ValueError,
            ):
                print(
                    f"Skipped invalid pitcher ID "
                    f"{pitcher_id!r} for {game.get('id')}."
                )
                continue

            if numeric_pitcher_id not in cache:
                try:
                    print(
                        "Fetching pitcher data: "
                        f"{existing_pitcher.get('name', 'Starter')} "
                        f"({numeric_pitcher_id})"
                    )

                    cache[numeric_pitcher_id] = (
                        build_pitcher_snapshot(
                            numeric_pitcher_id,
                            target_date,
                        )
                    )
                except Exception as error:
                    print(
                        "Pitcher refresh retained prior data "
                        f"for {existing_pitcher.get('name', 'Starter')}: "
                        f"{error}"
                    )

                    cache[numeric_pitcher_id] = {}

            snapshot = cache.get(
                numeric_pitcher_id,
                {},
            )

            if not snapshot:
                continue

            merged_pitcher = dict(
                existing_pitcher
            )

            merged_pitcher.update(
                snapshot
            )

            if (
                existing_pitcher.get("status")
                == "confirmed"
            ):
                merged_pitcher["status"] = (
                    "confirmed"
                )

            pitchers[side] = merged_pitcher

        game["pitchers"] = pitchers
        enriched_games.append(game)

    return enriched_games



def enrich_team_offenses(
    games: list[dict[str, Any]],
    target_date: str,
) -> list[dict[str, Any]]:
    """
    Populate both team offenses for each game.

    The offense is matched to the opposing starter's handedness.
    Each team/hand combination is fetched once per run. Existing
    offense data is preserved if a request fails.
    """

    cache: dict[tuple[int, str | None], dict[str, Any]] = {}

    print("Fetching 30-team offense rank matrix for all filters...")
    league_cache = build_league_offense_cache(target_date)

    enriched_games = []

    for stored_game in games:
        game = dict(stored_game)

        offense = dict(
            game.get("offense", {})
        )

        pitchers = game.get(
            "pitchers",
            {},
        )

        team_pairs = (
            (
                "away",
                game.get("away_team", {}),
                pitchers.get("home", {}),
            ),
            (
                "home",
                game.get("home_team", {}),
                pitchers.get("away", {}),
            ),
        )

        for (
            side,
            team,
            opposing_pitcher,
        ) in team_pairs:
            team_id = team.get(
                "team_id"
            )

            if not team_id:
                continue

            try:
                numeric_team_id = int(
                    team_id
                )
            except (
                TypeError,
                ValueError,
            ):
                print(
                    f"Skipped invalid team ID "
                    f"{team_id!r} for {game.get('id')}."
                )
                continue

            opponent_throws = str(
                opposing_pitcher.get(
                    "throws"
                )
                or ""
            ).upper() or None

            cache_key = (
                numeric_team_id,
                opponent_throws,
            )

            if cache_key not in cache:
                try:
                    print(
                        "Fetching offense data: "
                        f"{team.get('abbr', numeric_team_id)} "
                        f"vs {opponent_throws or 'TBD'}HP"
                    )

                    cache[cache_key] = (
                        apply_league_offense_cache(
                            build_team_offense_snapshot(
                                numeric_team_id,
                                opponent_throws,
                                target_date,
                            ),
                            league_cache,
                        )
                    )
                except Exception as error:
                    print(
                        "Offense refresh retained prior data "
                        f"for {team.get('abbr', numeric_team_id)}: "
                        f"{error}"
                    )

                    cache[cache_key] = {}

            snapshot = cache.get(
                cache_key,
                {},
            )

            if not snapshot:
                continue

            existing_offense = dict(
                offense.get(side, {})
            )

            merged_offense = dict(
                existing_offense
            )

            merged_offense.update(
                snapshot
            )

            merged_offense["team"] = (
                team.get("abbr")
            )

            offense[side] = (
                merged_offense
            )

        game["offense"] = offense
        enriched_games.append(game)

    return enriched_games


def enrich_bullpens(
    games: list[dict[str, Any]],
    target_date: str,
) -> list[dict[str, Any]]:
    """
    Populate both bullpen modules for every game.

    Each team bullpen is fetched once per run. Existing bullpen
    data is preserved if the MLB request fails.
    """

    cache: dict[int, dict[str, Any]] = {}
    enriched_games = []

    for stored_game in games:
        game = dict(stored_game)

        bullpens = dict(
            game.get("bullpens", {})
        )

        team_pairs = (
            (
                "away",
                game.get("away_team", {}),
            ),
            (
                "home",
                game.get("home_team", {}),
            ),
        )

        for side, team in team_pairs:
            team_id = team.get(
                "team_id"
            )

            if not team_id:
                continue

            try:
                numeric_team_id = int(
                    team_id
                )
            except (
                TypeError,
                ValueError,
            ):
                print(
                    f"Skipped invalid bullpen team ID "
                    f"{team_id!r} for {game.get('id')}."
                )
                continue

            if numeric_team_id not in cache:
                try:
                    print(
                        "Fetching bullpen data: "
                        f"{team.get('abbr', numeric_team_id)}"
                    )

                    cache[numeric_team_id] = (
                        build_bullpen_snapshot(
                            numeric_team_id,
                            target_date,
                        )
                    )
                except Exception as error:
                    print(
                        "Bullpen refresh retained prior data "
                        f"for {team.get('abbr', numeric_team_id)}: "
                        f"{error}"
                    )

                    cache[numeric_team_id] = {}

            snapshot = cache.get(
                numeric_team_id,
                {},
            )

            if not snapshot:
                continue

            existing_bullpen = dict(
                bullpens.get(side, {})
            )

            merged_bullpen = dict(
                existing_bullpen
            )

            merged_bullpen.update(
                snapshot
            )

            merged_bullpen["team"] = (
                team.get("abbr")
            )

            bullpens[side] = merged_bullpen

        game["bullpens"] = bullpens
        enriched_games.append(game)

    return enriched_games


def enrich_lineups(
    games: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Populate away and home lineups from MLB's live game feed.

    Each game feed is fetched once. Existing lineup data is
    preserved if MLB has not posted a batting order or if the
    request fails.
    """

    enriched_games = []

    for stored_game in games:
        game = dict(stored_game)

        game_pk = game.get(
            "mlb_game_pk"
        )

        if not game_pk:
            enriched_games.append(
                game
            )
            continue

        try:
            numeric_game_pk = int(
                game_pk
            )
        except (
            TypeError,
            ValueError,
        ):
            print(
                f"Skipped invalid MLB game ID "
                f"{game_pk!r} for {game.get('id')}."
            )

            enriched_games.append(
                game
            )
            continue

        try:
            print(
                "Fetching lineup data: "
                f"{game.get('id', numeric_game_pk)}"
            )

            snapshot = build_lineup_snapshot(
                numeric_game_pk
            )
        except Exception as error:
            print(
                "Lineup refresh retained prior data "
                f"for {game.get('id', numeric_game_pk)}: "
                f"{error}"
            )

            enriched_games.append(
                game
            )
            continue

        existing_lineups = dict(
            game.get("lineups", {})
        )

        for side in (
            "away",
            "home",
        ):
            incoming_lineup = (
                snapshot.get(side)
                or {}
            )

            incoming_players = (
                incoming_lineup.get(
                    "players",
                    [],
                )
            )

            existing_lineup = dict(
                existing_lineups.get(
                    side,
                    {},
                )
            )

            # Preserve an existing projected lineup when MLB's
            # feed has not posted any hitters yet.
            if not incoming_players:
                if not existing_lineup:
                    existing_lineups[
                        side
                    ] = incoming_lineup

                continue

            merged_lineup = dict(
                existing_lineup
            )

            previous_signature = existing_lineup.get("signature")
            merged_lineup.update(
                incoming_lineup
            )
            current_signature = merged_lineup.get("signature")
            changed = bool(
                previous_signature
                and current_signature
                and previous_signature != current_signature
            )
            merged_lineup["changed_since_last_refresh"] = changed
            if changed:
                merged_lineup["previous_signature"] = previous_signature
                merged_lineup["change_count"] = int(existing_lineup.get("change_count") or 0) + 1
            else:
                merged_lineup["change_count"] = int(existing_lineup.get("change_count") or 0)

            existing_lineups[
                side
            ] = merged_lineup

        away_pitcher_throws = (
            game.get("pitchers", {}).get("away", {}).get("throws")
        )
        home_pitcher_throws = (
            game.get("pitchers", {}).get("home", {}).get("throws")
        )
        # Away lineup faces the home pitcher; home lineup faces the away pitcher.
        existing_lineups["away"] = annotate_lineup_for_pitcher(
            existing_lineups.get("away", {}),
            home_pitcher_throws,
        )
        existing_lineups["home"] = annotate_lineup_for_pitcher(
            existing_lineups.get("home", {}),
            away_pitcher_throws,
        )

        game["lineups"] = (
            existing_lineups
        )

        enriched_games.append(
            game
        )

    return enriched_games


def enrich_batter_vs_pitcher(
    games: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    enriched = []

    for stored_game in games:
        game = dict(stored_game)

        existing = dict(
            game.get("pitcher_vs_lineup")
            or {}
        )

        try:
            print(
                "Fetching batter-vs-pitcher history: "
                f"{game.get('id', 'unknown')}"
            )

            incoming = build_game_career_bvp(game)

            for key in (
                "away_pitcher",
                "home_pitcher",
            ):
                incoming_side = (
                    incoming.get(key)
                    or {}
                )

                incoming_rows = (
                    incoming_side
                    .get("batters")
                    or {}
                )

                # Populate each side independently. A known starter and
                # opposing lineup are sufficient; the other starter does
                # not need to be available.
                if incoming_rows:
                    existing[key] = incoming_side

            game["pitcher_vs_lineup"] = existing

        except Exception as error:
            print(
                "BvP refresh retained prior data "
                f"for {game.get('id')}: {error}"
            )

        enriched.append(game)

    return enriched


def enrich_weather(
    games: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Populate game-time weather for every MLB game.

    Weather is fetched once per venue, first-pitch time, and date
    combination. Existing weather data is preserved if coordinates
    or the external weather service are unavailable.
    """

    cache: dict[
        tuple[int, str, str],
        dict[str, Any],
    ] = {}

    enriched_games = []

    for stored_game in games:
        game = dict(stored_game)

        venue_id = (
            game
            .get("venue", {})
            .get("id")
        )

        game_time = game.get(
            "game_time"
        )

        game_date = game.get(
            "date"
        )

        if (
            not venue_id
            or not game_time
            or not game_date
        ):
            enriched_games.append(
                game
            )
            continue

        try:
            numeric_venue_id = int(
                venue_id
            )
        except (
            TypeError,
            ValueError,
        ):
            print(
                f"Skipped invalid venue ID "
                f"{venue_id!r} for {game.get('id')}."
            )

            enriched_games.append(
                game
            )
            continue

        cache_key = (
            numeric_venue_id,
            str(game_time),
            str(game_date),
        )

        if cache_key not in cache:
            try:
                print(
                    "Fetching weather data: "
                    f"{game.get('id', numeric_venue_id)}"
                )

                cache[cache_key] = (
                    build_weather_snapshot(
                        numeric_venue_id,
                        str(game_time),
                        str(game_date),
                    )
                )
            except Exception as error:
                print(
                    "Weather refresh retained prior data "
                    f"for {game.get('id', numeric_venue_id)}: "
                    f"{error}"
                )

                cache[cache_key] = {}

        snapshot = cache.get(
            cache_key,
            {},
        )

        if not snapshot:
            enriched_games.append(
                game
            )
            continue

        existing_weather = dict(
            game.get("weather", {})
        )

        merged_weather = dict(
            existing_weather
        )

        merged_weather.update(
            snapshot
        )

        game["weather"] = (
            merged_weather
        )

        enriched_games.append(
            game
        )

    return enriched_games


def normalize_team_abbr(
    value: Any,
) -> str:
    aliases = {
        "KCR": "KC",
        "WSN": "WSH",
        "OAK": "ATH",
        "SF": "SFG",
        "SDP": "SD",
        "TBR": "TB",
    }

    cleaned = str(
        value or ""
    ).strip().upper()

    return aliases.get(
        cleaned,
        cleaned,
    )


def build_market_event_index(
    market_snapshot: dict[str, Any],
) -> dict[
    tuple[str, str],
    list[dict[str, Any]],
]:
    index: dict[
        tuple[str, str],
        list[dict[str, Any]],
    ] = {}

    events = market_snapshot.get(
        "events",
        [],
    )

    if not isinstance(
        events,
        list,
    ):
        return index

    for event in events:
        away = normalize_team_abbr(
            event
            .get("away_team", {})
            .get("abbr")
        )

        home = normalize_team_abbr(
            event
            .get("home_team", {})
            .get("abbr")
        )

        if not away or not home:
            continue

        index.setdefault(
            (away, home),
            [],
        ).append(event)

    return index


def choose_market_event(
    candidates: list[dict[str, Any]],
    game_time: str | None,
) -> dict[str, Any] | None:
    if not candidates:
        return None

    if not game_time:
        return candidates[0]

    try:
        target = datetime.fromisoformat(
            str(game_time).replace(
                "Z",
                "+00:00",
            )
        )
    except (
        TypeError,
        ValueError,
    ):
        return candidates[0]

    def event_distance(
        event: dict[str, Any],
    ) -> float:
        try:
            commence = datetime.fromisoformat(
                str(
                    event.get(
                        "commence_time"
                    )
                ).replace(
                    "Z",
                    "+00:00",
                )
            )

            return abs(
                (
                    commence - target
                ).total_seconds()
            )
        except (
            TypeError,
            ValueError,
        ):
            return float("inf")

    return min(
        candidates,
        key=event_distance,
    )


def enrich_markets(
    games: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Attach live sportsbook prices to matching MLB games.

    The Odds API is requested once per updater run. Games are
    matched by away/home abbreviations and then by the closest
    scheduled start time. Existing market data is preserved when
    no current event is available.
    """

    try:
        print(
            "Fetching MLB market odds..."
        )

        snapshot = build_market_snapshot()
    except Exception as error:
        print(
            "Market refresh skipped; existing data preserved: "
            f"{error}"
        )

        return games

    event_index = build_market_event_index(
        snapshot
    )

    updated_games = []

    for stored_game in games:
        game = dict(stored_game)

        away = normalize_team_abbr(
            game
            .get("away_team", {})
            .get("abbr")
        )

        home = normalize_team_abbr(
            game
            .get("home_team", {})
            .get("abbr")
        )

        candidates = event_index.get(
            (away, home),
            [],
        )

        event = choose_market_event(
            candidates,
            game.get("game_time"),
        )

        if not event:
            updated_games.append(
                game
            )
            continue

        existing_market = dict(
            game.get("market", {})
        )

        merged_market = dict(
            existing_market
        )

        merged_market.update(
            event
        )

        merged_market["source"] = (
            "The Odds API"
        )

        merged_market["snapshot_updated_at"] = (
            snapshot.get("updated_at")
        )

        merged_market["quota"] = (
            snapshot.get("quota", {})
        )

        game["market"] = (
            merged_market
        )

        updated_games.append(
            game
        )

    return updated_games


def enrich_context(
    games: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Build Context V1 after all underlying game modules refresh.

    Context uses the latest lineup, starter, bullpen, weather,
    and market data already attached to each game. One bad game
    cannot stop the rest of the slate.
    """

    enriched_games = []

    for stored_game in games:
        game = dict(stored_game)

        try:
            print(
                "Building context: "
                f"{game.get('id', 'unknown-game')}"
            )

            context = build_context_snapshot(
                game
            )
        except Exception as error:
            print(
                "Context refresh retained prior data "
                f"for {game.get('id', 'unknown-game')}: "
                f"{error}"
            )

            enriched_games.append(
                game
            )
            continue

        existing_context = dict(
            game.get("context", {})
        )

        merged_context = dict(
            existing_context
        )

        merged_context.update(
            context
        )

        game["context"] = (
            merged_context
        )

        enriched_games.append(
            game
        )

    return enriched_games

def migrate_existing_games(
    games: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    migrated = []

    for stored_game in games:
        game = dict(stored_game)

        game["workflow"] = normalize_workflow(
            game.get("workflow")
        )

        game.setdefault("offense", {})
        game.setdefault("lineups", {})
        game.setdefault(
            "pitcher_vs_lineup",
            game.get(
                "pitcher_vs_projected_lineup",
                {},
            ),
        )
        game.setdefault("bullpens", {})
        game.setdefault("weather", {})
        game.setdefault("market", {})
        game.setdefault("injuries", [])
        game.setdefault("notes", "")

        migrated.append(game)

    return migrated


def determine_day_state(
    day_date: str,
    games: list[dict[str, Any]],
) -> str:
    today = date.today().isoformat()

    if day_date > today:
        return "future"

    statuses = {
        game.get("status", "scheduled")
        for game in games
    }

    if "live" in statuses:
        return "live"

    completed_statuses = {
        "final",
        "postponed",
        "cancelled",
    }

    if (
        statuses
        and statuses.issubset(
            completed_statuses
        )
    ):
        return "completed"

    if day_date < today:
        return "past"

    return "today"


def build_days_index(
    games: list[dict[str, Any]],
) -> dict[str, Any]:
    grouped: dict[
        tuple[str, str],
        list[dict[str, Any]],
    ] = {}

    for game in games:
        game_date = game.get("date")
        sport = str(
            game.get("sport") or "MLB"
        ).upper()

        if (
            not game_date
            or not game.get("id")
        ):
            continue

        grouped.setdefault(
            (game_date, sport),
            [],
        ).append(game)

    days = []

    for (
        day_date,
        sport,
    ), day_games in grouped.items():
        ordered_games = sorted(
            day_games,
            key=lambda game: (
                game.get("game_time") or "",
                game.get("id") or "",
            ),
        )

        official_play_ids = []

        for game in ordered_games:
            play_ids = (
                game
                .get("workflow", {})
                .get("official_play_ids", [])
            )

            if isinstance(play_ids, list):
                official_play_ids.extend(
                    play_ids
                )

        days.append(
            {
                "id": f"{day_date}-{sport.lower()}",
                "date": day_date,
                "sport": sport,
                "state": determine_day_state(
                    day_date,
                    ordered_games,
                ),
                "previous_day": shift_date(
                    day_date,
                    -1,
                ),
                "next_day": shift_date(
                    day_date,
                    1,
                ),
                "game_ids": [
                    game["id"]
                    for game in ordered_games
                ],
                "official_play_ids":
                    official_play_ids,
                "workflow": {
                    "research_complete":
                        bool(ordered_games)
                        and all(
                            game
                            .get("workflow", {})
                            .get("research_state")
                            == "ready"
                            for game in ordered_games
                        ),
                    "plays_published":
                        bool(
                            official_play_ids
                        ),
                    "results_complete":
                        bool(ordered_games)
                        and all(
                            game.get("status")
                            in {
                                "final",
                                "postponed",
                                "cancelled",
                            }
                            for game in ordered_games
                        ),
                    "evaluations_complete":
                        False,
                    "archived":
                        False,
                },
                "summary": {
                    "games":
                        len(ordered_games),
                    "official_plays":
                        len(
                            official_play_ids
                        ),
                    "research_ready":
                        sum(
                            game
                            .get("workflow", {})
                            .get("research_state")
                            == "ready"
                            for game in ordered_games
                        ),
                },
            }
        )

    days.sort(
        key=lambda item: (
            item["date"],
            item["sport"],
        )
    )

    return {
        "schema_version": "1.0",
        "updated_at": datetime.now(
            timezone.utc
        ).isoformat(),
        "days": days,
    }


def shift_date(
    date_string: str,
    amount: int,
) -> str:
    parsed = datetime.strptime(
        date_string,
        "%Y-%m-%d",
    ).date()

    return date.fromordinal(
        parsed.toordinal() + amount
    ).isoformat()


def load_plays_file() -> dict[str, Any]:
    return load_json_file(
        PLAYS_FILE,
        {
            "plays": [],
        },
    )


def load_plays_archive() -> dict[str, Any]:
    return load_json_file(
        PLAYS_ARCHIVE_FILE,
        {
            "schema_version": "1.1",
            "updated_at": None,
            "plays": [],
        },
    )


def normalize_play(
    play: dict[str, Any],
) -> dict[str, Any]:
    normalized = dict(play)

    play_id = normalized.get("id")

    normalized.setdefault(
        "game_id",
        None,
    )
    normalized.setdefault(
        "is_best_bet",
        False,
    )
    normalized.setdefault(
        "publication_state",
        "published",
    )
    normalized.setdefault(
        "result",
        "pending",
    )
    normalized.setdefault(
        "units_result",
        None,
    )
    normalized.setdefault(
        "closing_odds",
        None,
    )
    normalized.setdefault(
        "closing_line",
        None,
    )
    normalized.setdefault(
        "final_score",
        None,
    )
    normalized.setdefault(
        "graded_at",
        None,
    )
    normalized.setdefault(
        "evaluation_id",
        None,
    )
    normalized.setdefault(
        "result_id",
        (
            f"result-{play_id}"
            if play_id
            else None
        ),
    )

    return normalized


def merge_plays_archive(
    archived_plays: list[dict[str, Any]],
    current_plays: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    plays_by_id = {
        play["id"]: normalize_play(play)
        for play in archived_plays
        if play.get("id")
    }

    for play in current_plays:
        if not play.get("id"):
            continue

        existing = plays_by_id.get(
            play["id"],
            {},
        )

        merged = dict(existing)
        merged.update(play)

        plays_by_id[play["id"]] = (
            normalize_play(merged)
        )

    plays = list(
        plays_by_id.values()
    )

    plays.sort(
        key=lambda play: (
            play.get("date") or "",
            play.get("sport") or "",
            play.get("game_id") or "",
            play.get("id") or "",
        )
    )

    return plays


def sync_plays_to_games(
    games: list[dict[str, Any]],
    plays: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    plays_by_game: dict[
        str,
        list[dict[str, Any]],
    ] = {}

    for play in plays:
        game_id = play.get("game_id")

        if not game_id:
            continue

        plays_by_game.setdefault(
            game_id,
            [],
        ).append(play)

    synced_games = []

    for stored_game in games:
        game = dict(stored_game)

        workflow = normalize_workflow(
            game.get("workflow")
        )

        matching_plays = plays_by_game.get(
            game.get("id"),
            [],
        )

        official_play_ids = [
            play["id"]
            for play in matching_plays
            if play.get("id")
        ]

        best_bet = next(
            (
                play
                for play in matching_plays
                if play.get("is_best_bet")
            ),
            None,
        )

        workflow["official_play_ids"] = (
            official_play_ids
        )

        workflow["best_bet_id"] = (
            best_bet.get("id")
            if best_bet
            else None
        )

        if official_play_ids:
            workflow[
                "publication_state"
            ] = "published"

            workflow[
                "grading_state"
            ] = (
                "graded"
                if all(
                    str(
                        play.get("result") or ""
                    ).lower()
                    not in {
                        "",
                        "pending",
                    }
                    for play in matching_plays
                )
                else "pending"
            )
        else:
            workflow[
                "publication_state"
            ] = "unpublished"

            workflow[
                "grading_state"
            ] = "not_applicable"

        game["workflow"] = workflow
        synced_games.append(game)

    return synced_games


def load_results_archive() -> dict[str, Any]:
    return load_json_file(
        RESULTS_FILE,
        {
            "schema_version": "1.0",
            "updated_at": None,
            "results": [],
        },
    )


def normalize_result(
    result: dict[str, Any],
) -> dict[str, Any]:
    normalized = dict(result)

    normalized.setdefault(
        "play_id",
        None,
    )
    normalized.setdefault(
        "game_id",
        None,
    )
    normalized.setdefault(
        "date",
        None,
    )
    normalized.setdefault(
        "sport",
        None,
    )
    normalized.setdefault(
        "status",
        "pending",
    )
    normalized.setdefault(
        "units_risked",
        0.0,
    )
    normalized.setdefault(
        "units_result",
        None,
    )
    normalized.setdefault(
        "opening_odds",
        None,
    )
    normalized.setdefault(
        "closing_odds",
        None,
    )
    normalized.setdefault(
        "closing_line",
        None,
    )
    normalized.setdefault(
        "final_score",
        None,
    )
    normalized.setdefault(
        "graded_at",
        None,
    )
    normalized.setdefault(
        "evaluation_id",
        None,
    )

    return normalized


def result_from_play(
    play: dict[str, Any],
) -> dict[str, Any]:
    play_id = play.get("id")

    result_status = str(
        play.get("result") or "pending"
    ).lower()

    return normalize_result(
        {
            "id": (
                play.get("result_id")
                or (
                    f"result-{play_id}"
                    if play_id
                    else None
                )
            ),
            "play_id": play_id,
            "game_id": play.get("game_id"),
            "date": play.get("date"),
            "sport": play.get("sport"),
            "status": result_status,
            "units_risked": float(
                play.get("units") or 0
            ),
            "units_result":
                play.get("units_result"),
            "opening_odds":
                play.get("odds"),
            "closing_odds":
                play.get("closing_odds"),
            "closing_line":
                play.get("closing_line"),
            "final_score":
                play.get("final_score"),
            "graded_at":
                play.get("graded_at"),
            "evaluation_id":
                play.get("evaluation_id"),
        }
    )


def merge_results_archive(
    archived_results: list[dict[str, Any]],
    plays: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    results_by_play_id = {
        result.get("play_id"):
            normalize_result(result)
        for result in archived_results
        if result.get("play_id")
    }

    for play in plays:
        play_id = play.get("id")

        if not play_id:
            continue

        incoming = result_from_play(play)

        existing = results_by_play_id.get(
            play_id,
            {},
        )

        merged = dict(existing)

        for key, value in incoming.items():
            if (
                value is not None
                or key
                in {
                    "id",
                    "play_id",
                    "game_id",
                    "date",
                    "sport",
                    "status",
                    "units_risked",
                    "opening_odds",
                }
            ):
                merged[key] = value

        results_by_play_id[play_id] = (
            normalize_result(merged)
        )

    results = list(
        results_by_play_id.values()
    )

    results.sort(
        key=lambda result: (
            result.get("date") or "",
            result.get("sport") or "",
            result.get("game_id") or "",
            result.get("play_id") or "",
        )
    )

    return results


def load_evaluations_archive() -> dict[str, Any]:
    return load_json_file(
        EVALUATIONS_FILE,
        {
            "schema_version": "1.0",
            "updated_at": None,
            "evaluations": [],
        },
    )


def normalize_evaluation(
    evaluation: dict[str, Any],
) -> dict[str, Any]:
    normalized = dict(evaluation)

    normalized.setdefault("play_id", None)
    normalized.setdefault("result_id", None)
    normalized.setdefault("game_id", None)
    normalized.setdefault("date", None)
    normalized.setdefault("sport", None)
    normalized.setdefault("status", "pending")
    normalized.setdefault("decision_quality", None)
    normalized.setdefault("model_quality", None)
    normalized.setdefault("variance", None)
    normalized.setdefault("summary", "")
    normalized.setdefault("lessons", [])
    normalized.setdefault("reviewed_by", None)
    normalized.setdefault("reviewed_at", None)

    if not isinstance(
        normalized.get("lessons"),
        list,
    ):
        normalized["lessons"] = []

    return normalized


def evaluation_from_play(
    play: dict[str, Any],
) -> dict[str, Any]:
    play_id = play.get("id")
    result_id = play.get("result_id")

    return normalize_evaluation(
        {
            "id": (
                play.get("evaluation_id")
                or (
                    f"evaluation-{play_id}"
                    if play_id
                    else None
                )
            ),
            "play_id": play_id,
            "result_id": result_id,
            "game_id": play.get("game_id"),
            "date": play.get("date"),
            "sport": play.get("sport"),
            "status": "pending",
        }
    )


def merge_evaluations_archive(
    archived_evaluations: list[dict[str, Any]],
    plays: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    evaluations_by_play_id = {
        evaluation.get("play_id"):
            normalize_evaluation(evaluation)
        for evaluation in archived_evaluations
        if evaluation.get("play_id")
    }

    for play in plays:
        play_id = play.get("id")

        if not play_id:
            continue

        incoming = evaluation_from_play(play)

        existing = evaluations_by_play_id.get(
            play_id,
            {},
        )

        merged = dict(incoming)
        merged.update(existing)

        evaluations_by_play_id[play_id] = (
            normalize_evaluation(merged)
        )

    evaluations = list(
        evaluations_by_play_id.values()
    )

    evaluations.sort(
        key=lambda evaluation: (
            evaluation.get("date") or "",
            evaluation.get("sport") or "",
            evaluation.get("game_id") or "",
            evaluation.get("play_id") or "",
        )
    )

    return evaluations


def main() -> None:
    target_date = (
        sys.argv[1]
        if len(sys.argv) > 1
        else date.today().isoformat()
    )

    current = load_games_file()

    current["games"] = migrate_existing_games(
        current.get("games", [])
    )

    existing_games = {
        game["id"]: game
        for game in current.get(
            "games",
            [],
        )
        if game.get("id")
    }

    raw_schedule = fetch_schedule(
        target_date
    )

    schedule_games = parse_schedule(
        raw_schedule
    )

    merged_games = []

    for schedule_game in schedule_games:
        existing = existing_games.get(
            schedule_game["id"]
        )

        merged_games.append(
            merge_schedule_game(
                existing,
                schedule_game,
            )
        )

    merged_games = enrich_probable_pitchers(
        merged_games,
        target_date,
    )

    print("Building league-wide pitcher rank matrix...")
    pitcher_rank_cache = build_league_pitcher_cache(target_date)
    merged_games = apply_league_pitcher_cache(merged_games, pitcher_rank_cache)

    merged_games = enrich_team_offenses(
        merged_games,
        target_date,
    )

    merged_games = enrich_bullpens(
        merged_games,
        target_date,
    )

    merged_games = enrich_lineups(
        merged_games,
    )

    merged_games = enrich_batter_vs_pitcher(
        merged_games,
    )

    merged_games = enrich_weather(
        merged_games,
    )

    merged_games = enrich_markets(
        merged_games,
    )

    merged_games = enrich_context(
        merged_games,
    )

    print("Building MLB Intelligence Engine ranks and advanced metrics...")
    merged_games = enrich_intelligence(merged_games)

    other_dates = [
        game
        for game in current.get(
            "games",
            [],
        )
        if game.get("date") != target_date
    ]

    current["games"] = (
        other_dates + merged_games
    )

    current["games"].sort(
        key=lambda game: (
            game.get("date") or "",
            game.get("game_time") or "",
            game.get("id") or "",
        )
    )

    plays_data = load_plays_file()

    plays = (
        plays_data.get("plays", [])
        if isinstance(
            plays_data.get("plays"),
            list,
        )
        else []
    )

    plays_archive = load_plays_archive()

    archived_plays = (
        plays_archive.get("plays", [])
        if isinstance(
            plays_archive.get("plays"),
            list,
        )
        else []
    )

    all_plays = merge_plays_archive(
        archived_plays,
        plays,
    )

    current["games"] = sync_plays_to_games(
        current["games"],
        all_plays,
    )

    current["schema_version"] = "3.8"

    GAMES_FILE.write_text(
        json.dumps(
            current,
            indent=2,
        ) + "\n",
        encoding="utf-8",
    )

    PLAYS_ARCHIVE_FILE.write_text(
        json.dumps(
            {
                "schema_version": "1.1",
                "updated_at": datetime.now(
                    timezone.utc
                ).isoformat(),
                "plays": all_plays,
            },
            indent=2,
        ) + "\n",
        encoding="utf-8",
    )

    results_archive = load_results_archive()

    archived_results = (
        results_archive.get("results", [])
        if isinstance(
            results_archive.get("results"),
            list,
        )
        else []
    )

    all_results = merge_results_archive(
        archived_results,
        all_plays,
    )

    RESULTS_FILE.write_text(
        json.dumps(
            {
                "schema_version": "1.0",
                "updated_at": datetime.now(
                    timezone.utc
                ).isoformat(),
                "results": all_results,
            },
            indent=2,
        ) + "\n",
        encoding="utf-8",
    )

    evaluations_archive = load_evaluations_archive()

    archived_evaluations = (
        evaluations_archive.get(
            "evaluations",
            [],
        )
        if isinstance(
            evaluations_archive.get(
                "evaluations"
            ),
            list,
        )
        else []
    )

    all_evaluations = merge_evaluations_archive(
        archived_evaluations,
        all_plays,
    )

    EVALUATIONS_FILE.write_text(
        json.dumps(
            {
                "schema_version": "1.0",
                "updated_at": datetime.now(
                    timezone.utc
                ).isoformat(),
                "evaluations": all_evaluations,
            },
            indent=2,
        ) + "\n",
        encoding="utf-8",
    )

    days_index = build_days_index(
        current["games"]
    )

    DAYS_FILE.write_text(
        json.dumps(
            days_index,
            indent=2,
        ) + "\n",
        encoding="utf-8",
    )

    print(
        f"Updated {len(merged_games)} MLB game(s) "
        f"for {target_date}."
    )

    print(
        f"games.json now contains "
        f"{len(current['games'])} total game(s)."
    )

    print(
        f"days.json now contains "
        f"{len(days_index['days'])} "
        f"sport-day record(s)."
    )

    print(
        f"plays.json now contains "
        f"{len(all_plays)} archived play(s)."
    )

    print(
        f"results.json now contains "
        f"{len(all_results)} result record(s)."
    )

    print(
        f"evaluations.json now contains "
        f"{len(all_evaluations)} evaluation record(s)."
    )


if __name__ == "__main__":
    main()
