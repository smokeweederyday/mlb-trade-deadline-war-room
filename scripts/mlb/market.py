from __future__ import annotations

from datetime import datetime, timezone
from statistics import median
from typing import Any
import json
import os
import sys
import urllib.parse
import urllib.request


ODDS_API_BASE = (
    "https://api.the-odds-api.com/v4"
)

SPORT_KEY = "baseball_mlb"

DEFAULT_REGIONS = "us"
DEFAULT_MARKETS = (
    "h2h,spreads,totals"
)

TEAM_ALIASES = {
    "arizona diamondbacks": "ARI",
    "athletics": "ATH",
    "oakland athletics": "ATH",
    "sacramento athletics": "ATH",
    "atlanta braves": "ATL",
    "baltimore orioles": "BAL",
    "boston red sox": "BOS",
    "chicago cubs": "CHC",
    "chicago white sox": "CWS",
    "cincinnati reds": "CIN",
    "cleveland guardians": "CLE",
    "colorado rockies": "COL",
    "detroit tigers": "DET",
    "houston astros": "HOU",
    "kansas city royals": "KC",
    "los angeles angels": "LAA",
    "los angeles dodgers": "LAD",
    "miami marlins": "MIA",
    "milwaukee brewers": "MIL",
    "minnesota twins": "MIN",
    "new york mets": "NYM",
    "new york yankees": "NYY",
    "philadelphia phillies": "PHI",
    "pittsburgh pirates": "PIT",
    "san diego padres": "SD",
    "san francisco giants": "SFG",
    "seattle mariners": "SEA",
    "st. louis cardinals": "STL",
    "st louis cardinals": "STL",
    "tampa bay rays": "TB",
    "texas rangers": "TEX",
    "toronto blue jays": "TOR",
    "washington nationals": "WSH",
}


def require_api_key() -> str:
    api_key = str(
        os.environ.get(
            "ODDS_API_KEY",
            "",
        )
    ).strip()

    if not api_key:
        raise RuntimeError(
            "ODDS_API_KEY is not set. Run: "
            'export ODDS_API_KEY="YOUR_KEY"'
        )

    return api_key


def get_json_with_headers(
    url: str,
) -> tuple[
    Any,
    dict[str, str],
]:
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
        payload = json.loads(
            response.read()
        )

        headers = {
            key.lower(): value
            for key, value
            in response.headers.items()
        }

        return payload, headers


def fetch_mlb_odds(
    regions: str = DEFAULT_REGIONS,
    markets: str = DEFAULT_MARKETS,
) -> tuple[
    list[dict[str, Any]],
    dict[str, Any],
]:
    api_key = require_api_key()

    params = urllib.parse.urlencode(
        {
            "apiKey": api_key,
            "regions": regions,
            "markets": markets,
            "oddsFormat": "american",
            "dateFormat": "iso",
            "includeLinks": "true",
        }
    )

    payload, headers = (
        get_json_with_headers(
            f"{ODDS_API_BASE}/sports/"
            f"{SPORT_KEY}/odds?{params}"
        )
    )

    if not isinstance(
        payload,
        list,
    ):
        raise RuntimeError(
            "Unexpected odds response."
        )

    quota = {
        "requests_remaining":
            to_int(
                headers.get(
                    "x-requests-remaining"
                )
            ),
        "requests_used":
            to_int(
                headers.get(
                    "x-requests-used"
                )
            ),
        "requests_last":
            to_int(
                headers.get(
                    "x-requests-last"
                )
            ),
    }

    return payload, quota


def normalize_team_name(
    value: Any,
) -> str | None:
    cleaned = str(
        value or ""
    ).strip().lower()

    return TEAM_ALIASES.get(
        cleaned
    )


def market_outcomes(
    bookmaker: dict[str, Any],
    market_key: str,
) -> list[dict[str, Any]]:
    for market in bookmaker.get(
        "markets",
        [],
    ):
        if (
            market.get("key")
            == market_key
        ):
            outcomes = market.get(
                "outcomes",
                [],
            )

            if isinstance(
                outcomes,
                list,
            ):
                return outcomes

    return []


def outcome_for_team(
    outcomes: list[dict[str, Any]],
    team_name: str,
) -> dict[str, Any] | None:
    target = normalize_team_name(
        team_name
    )

    for outcome in outcomes:
        if (
            normalize_team_name(
                outcome.get("name")
            )
            == target
        ):
            return outcome

    return None


def total_outcome(
    outcomes: list[dict[str, Any]],
    name: str,
) -> dict[str, Any] | None:
    target = name.lower()

    for outcome in outcomes:
        if (
            str(
                outcome.get("name")
                or ""
            ).lower()
            == target
        ):
            return outcome

    return None


def american_to_probability(
    odds: Any,
) -> float | None:
    value = to_float(
        odds
    )

    if value is None or value == 0:
        return None

    if value > 0:
        return 100 / (
            value + 100
        )

    absolute = abs(value)

    return absolute / (
        absolute + 100
    )


def probability_to_american(
    probability: Any,
) -> int | None:
    value = to_float(
        probability
    )

    if (
        value is None
        or value <= 0
        or value >= 1
    ):
        return None

    if value >= 0.5:
        return round(
            -100
            * value
            / (1 - value)
        )

    return round(
        100
        * (1 - value)
        / value
    )


def no_vig_probabilities(
    away_odds: Any,
    home_odds: Any,
) -> tuple[
    float | None,
    float | None,
]:
    away_probability = (
        american_to_probability(
            away_odds
        )
    )

    home_probability = (
        american_to_probability(
            home_odds
        )
    )

    if (
        away_probability is None
        or home_probability is None
    ):
        return None, None

    total = (
        away_probability
        + home_probability
    )

    if total <= 0:
        return None, None

    return (
        away_probability / total,
        home_probability / total,
    )


def best_team_price(
    rows: list[dict[str, Any]],
    side: str,
) -> dict[str, Any] | None:
    valid = [
        row
        for row in rows
        if to_float(
            row.get(side)
        )
        is not None
    ]

    if not valid:
        return None

    return max(
        valid,
        key=lambda row: float(
            row[side]
        ),
    )


def median_price(
    rows: list[dict[str, Any]],
    side: str,
) -> int | None:
    values = [
        float(row[side])
        for row in rows
        if to_float(
            row.get(side)
        )
        is not None
    ]

    if not values:
        return None

    return round(
        median(values)
    )


def summarize_h2h(
    bookmaker_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    away_best = best_team_price(
        bookmaker_rows,
        "away",
    )

    home_best = best_team_price(
        bookmaker_rows,
        "home",
    )

    away_consensus = median_price(
        bookmaker_rows,
        "away",
    )

    home_consensus = median_price(
        bookmaker_rows,
        "home",
    )

    (
        away_fair_probability,
        home_fair_probability,
    ) = no_vig_probabilities(
        away_consensus,
        home_consensus,
    )

    return {
        "best": {
            "away": (
                {
                    "price":
                        away_best.get("away"),
                    "bookmaker":
                        away_best.get(
                            "bookmaker"
                        ),
                    "bookmaker_key":
                        away_best.get(
                            "bookmaker_key"
                        ),
                    "link":
                        away_best.get("link"),
                }
                if away_best
                else None
            ),
            "home": (
                {
                    "price":
                        home_best.get("home"),
                    "bookmaker":
                        home_best.get(
                            "bookmaker"
                        ),
                    "bookmaker_key":
                        home_best.get(
                            "bookmaker_key"
                        ),
                    "link":
                        home_best.get("link"),
                }
                if home_best
                else None
            ),
        },
        "consensus": {
            "away":
                away_consensus,
            "home":
                home_consensus,
        },
        "fair": {
            "away_probability":
                away_fair_probability,
            "home_probability":
                home_fair_probability,
            "away_price":
                probability_to_american(
                    away_fair_probability
                ),
            "home_price":
                probability_to_american(
                    home_fair_probability
                ),
        },
        "books": bookmaker_rows,
    }


def summarize_spreads(
    rows: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "books": rows,
    }


def summarize_totals(
    rows: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "books": rows,
    }


def parse_market_event(
    event: dict[str, Any],
) -> dict[str, Any]:
    away_name = event.get(
        "away_team"
    )

    home_name = event.get(
        "home_team"
    )

    away_abbr = normalize_team_name(
        away_name
    )

    home_abbr = normalize_team_name(
        home_name
    )

    h2h_rows = []
    spread_rows = []
    total_rows = []

    latest_update = None

    for bookmaker in event.get(
        "bookmakers",
        [],
    ):
        bookmaker_key = bookmaker.get(
            "key"
        )

        bookmaker_title = (
            bookmaker.get("title")
        )

        bookmaker_link = (
            bookmaker.get("link")
        )

        last_update = bookmaker.get(
            "last_update"
        )

        if (
            last_update
            and (
                latest_update is None
                or last_update
                > latest_update
            )
        ):
            latest_update = last_update

        h2h_outcomes = market_outcomes(
            bookmaker,
            "h2h",
        )

        away_moneyline = outcome_for_team(
            h2h_outcomes,
            away_name,
        )

        home_moneyline = outcome_for_team(
            h2h_outcomes,
            home_name,
        )

        if (
            away_moneyline
            or home_moneyline
        ):
            h2h_rows.append(
                {
                    "bookmaker":
                        bookmaker_title,
                    "bookmaker_key":
                        bookmaker_key,
                    "link":
                        bookmaker_link,
                    "last_update":
                        last_update,
                    "away": (
                        away_moneyline.get(
                            "price"
                        )
                        if away_moneyline
                        else None
                    ),
                    "home": (
                        home_moneyline.get(
                            "price"
                        )
                        if home_moneyline
                        else None
                    ),
                }
            )

        spread_outcomes = (
            market_outcomes(
                bookmaker,
                "spreads",
            )
        )

        away_spread = outcome_for_team(
            spread_outcomes,
            away_name,
        )

        home_spread = outcome_for_team(
            spread_outcomes,
            home_name,
        )

        if away_spread or home_spread:
            spread_rows.append(
                {
                    "bookmaker":
                        bookmaker_title,
                    "bookmaker_key":
                        bookmaker_key,
                    "link":
                        bookmaker_link,
                    "last_update":
                        last_update,
                    "away": (
                        {
                            "point":
                                away_spread.get(
                                    "point"
                                ),
                            "price":
                                away_spread.get(
                                    "price"
                                ),
                        }
                        if away_spread
                        else None
                    ),
                    "home": (
                        {
                            "point":
                                home_spread.get(
                                    "point"
                                ),
                            "price":
                                home_spread.get(
                                    "price"
                                ),
                        }
                        if home_spread
                        else None
                    ),
                }
            )

        total_outcomes = market_outcomes(
            bookmaker,
            "totals",
        )

        over = total_outcome(
            total_outcomes,
            "Over",
        )

        under = total_outcome(
            total_outcomes,
            "Under",
        )

        if over or under:
            total_rows.append(
                {
                    "bookmaker":
                        bookmaker_title,
                    "bookmaker_key":
                        bookmaker_key,
                    "link":
                        bookmaker_link,
                    "last_update":
                        last_update,
                    "over": (
                        {
                            "point":
                                over.get("point"),
                            "price":
                                over.get("price"),
                        }
                        if over
                        else None
                    ),
                    "under": (
                        {
                            "point":
                                under.get(
                                    "point"
                                ),
                            "price":
                                under.get(
                                    "price"
                                ),
                        }
                        if under
                        else None
                    ),
                }
            )

    return {
        "event_id": event.get("id"),
        "sport_key": event.get(
            "sport_key"
        ),
        "commence_time": event.get(
            "commence_time"
        ),
        "away_team": {
            "name": away_name,
            "abbr": away_abbr,
        },
        "home_team": {
            "name": home_name,
            "abbr": home_abbr,
        },
        "moneyline": summarize_h2h(
            h2h_rows
        ),
        "run_line": summarize_spreads(
            spread_rows
        ),
        "total": summarize_totals(
            total_rows
        ),
        "opening": None,
        "movement": None,
        "closing": None,
        "last_update": latest_update,
    }


def build_market_snapshot() -> dict[str, Any]:
    events, quota = fetch_mlb_odds()

    parsed_events = [
        parse_market_event(event)
        for event in events
    ]

    parsed_events.sort(
        key=lambda event: (
            event.get(
                "commence_time"
            )
            or "",
            event.get(
                "away_team",
                {},
            ).get(
                "abbr"
            )
            or "",
        )
    )

    return {
        "schema_version": "1.0",
        "updated_at": datetime.now(
            timezone.utc
        ).isoformat(),
        "sport": "MLB",
        "quota": quota,
        "events": parsed_events,
    }


def to_float(
    value: Any,
) -> float | None:
    if value in {
        None,
        "",
        "-",
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
    snapshot = build_market_snapshot()

    print(
        json.dumps(
            snapshot,
            indent=2,
        )
    )

    event_count = len(
        snapshot.get(
            "events",
            [],
        )
    )

    remaining = (
        snapshot
        .get("quota", {})
        .get("requests_remaining")
    )

    print(
        f"\nLoaded {event_count} MLB market event(s).",
        file=sys.stderr,
    )

    if remaining is not None:
        print(
            f"Odds API requests remaining: "
            f"{remaining}",
            file=sys.stderr,
        )


if __name__ == "__main__":
    main()
