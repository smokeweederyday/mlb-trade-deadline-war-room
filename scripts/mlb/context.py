from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any
import json
import sys


ROOT = Path(__file__).resolve().parents[2]
GAMES_FILE = ROOT / "data/games.json"


def load_games() -> list[dict[str, Any]]:
    if not GAMES_FILE.exists():
        return []

    payload = json.loads(
        GAMES_FILE.read_text(
            encoding="utf-8"
        )
    )

    games = payload.get(
        "games",
        [],
    )

    return (
        games
        if isinstance(games, list)
        else []
    )


def build_context_snapshot(
    game: dict[str, Any],
) -> dict[str, Any]:
    """
    Build Context V1 from data already imported into the game.

    This first version does not invent travel, trade-deadline,
    standings, streak, or injury information. Those become
    separate context sources later.
    """

    alerts: list[dict[str, Any]] = []
    positives: list[dict[str, Any]] = []
    information: list[dict[str, Any]] = []

    evaluate_lineups(
        game,
        alerts,
        positives,
        information,
    )

    evaluate_starters(
        game,
        alerts,
        positives,
        information,
    )

    evaluate_bullpens(
        game,
        alerts,
        positives,
        information,
    )

    evaluate_weather(
        game,
        alerts,
        positives,
        information,
    )

    evaluate_market(
        game,
        alerts,
        positives,
        information,
    )

    score = calculate_context_score(
        alerts,
        positives,
    )

    return {
        "version": "1.0",
        "score": score,
        "label": score_label(score),
        "alerts": alerts,
        "positives": positives,
        "information": information,
        "sources": {
            "lineups": True,
            "starters": True,
            "bullpens": True,
            "weather": True,
            "market": True,
            "travel": False,
            "trade_deadline": False,
            "standings": False,
            "streaks": False,
            "injuries": False,
        },
        "updated_at": datetime.now(
            timezone.utc
        ).isoformat(),
    }


def evaluate_lineups(
    game: dict[str, Any],
    alerts: list[dict[str, Any]],
    positives: list[dict[str, Any]],
    information: list[dict[str, Any]],
) -> None:
    lineups = game.get(
        "lineups",
        {},
    )

    confirmed = 0

    for side in ("away", "home"):
        lineup = lineups.get(
            side,
            {},
        )

        players = lineup.get(
            "players",
            [],
        )

        if (
            lineup.get("status")
            == "confirmed"
            and isinstance(players, list)
            and len(players) >= 9
        ):
            confirmed += 1

    if confirmed == 2:
        positives.append(
            context_item(
                "LINEUPS CONFIRMED",
                "Both clubs have confirmed batting orders.",
                "good",
                8,
            )
        )
    elif confirmed == 1:
        information.append(
            context_item(
                "ONE LINEUP CONFIRMED",
                "One club has confirmed its batting order.",
                "info",
                0,
            )
        )
    else:
        alerts.append(
            context_item(
                "LINEUPS NOT CONFIRMED",
                "Both batting orders remain projected or unavailable.",
                "caution",
                -6,
            )
        )


def evaluate_starters(
    game: dict[str, Any],
    alerts: list[dict[str, Any]],
    positives: list[dict[str, Any]],
    information: list[dict[str, Any]],
) -> None:
    pitchers = game.get(
        "pitchers",
        {},
    )

    known = 0

    for side in ("away", "home"):
        pitcher = pitchers.get(
            side,
            {},
        )

        if pitcher.get("id"):
            known += 1

    if known == 2:
        positives.append(
            context_item(
                "STARTERS SET",
                "Both probable starters are available in the matchup data.",
                "good",
                5,
            )
        )
    elif known == 1:
        alerts.append(
            context_item(
                "ONE STARTER TBD",
                "One probable starter is still unavailable.",
                "caution",
                -5,
            )
        )
    else:
        alerts.append(
            context_item(
                "STARTERS TBD",
                "Neither probable starter is currently available.",
                "warning",
                -10,
            )
        )


def evaluate_bullpens(
    game: dict[str, Any],
    alerts: list[dict[str, Any]],
    positives: list[dict[str, Any]],
    information: list[dict[str, Any]],
) -> None:
    bullpens = game.get(
        "bullpens",
        {},
    )

    for side, team_key in (
        ("away", "away_team"),
        ("home", "home_team"),
    ):
        team = (
            game
            .get(team_key, {})
            .get("abbr")
            or side.upper()
        )

        bullpen = bullpens.get(
            side,
            {},
        )

        used_yesterday = safe_int(
            bullpen.get(
                "used_yesterday"
            )
        )

        back_to_back = safe_int(
            bullpen.get(
                "back_to_back"
            )
        )

        if (
            used_yesterday is not None
            and used_yesterday >= 5
        ):
            alerts.append(
                context_item(
                    f"{team} BULLPEN TAXED",
                    f"{used_yesterday} relievers were used yesterday.",
                    "warning",
                    -10,
                )
            )
        elif (
            used_yesterday is not None
            and used_yesterday <= 2
        ):
            positives.append(
                context_item(
                    f"{team} BULLPEN RESTED",
                    f"Only {used_yesterday} reliever(s) were used yesterday.",
                    "good",
                    5,
                )
            )

        if (
            back_to_back is not None
            and back_to_back >= 3
        ):
            alerts.append(
                context_item(
                    f"{team} BACK-TO-BACK ARMS",
                    f"{back_to_back} relievers have worked on consecutive days.",
                    "warning",
                    -8,
                )
            )
        elif back_to_back is not None:
            information.append(
                context_item(
                    f"{team} B2B ARMS",
                    f"{back_to_back} reliever(s) have worked on consecutive days.",
                    "info",
                    0,
                )
            )


def evaluate_weather(
    game: dict[str, Any],
    alerts: list[dict[str, Any]],
    positives: list[dict[str, Any]],
    information: list[dict[str, Any]],
) -> None:
    weather = game.get(
        "weather",
        {},
    )

    if not weather:
        alerts.append(
            context_item(
                "WEATHER PENDING",
                "Game-time weather has not been imported.",
                "caution",
                -3,
            )
        )
        return

    rain_probability = safe_float(
        weather.get(
            "rain_probability"
        )
    )

    wind_speed = safe_float(
        weather.get(
            "wind_speed"
        )
    )

    temperature = safe_float(
        weather.get(
            "temperature"
        )
    )

    if (
        rain_probability is not None
        and rain_probability >= 50
    ):
        alerts.append(
            context_item(
                "RAIN RISK",
                f"Rain probability is {round(rain_probability)}% near first pitch.",
                "warning",
                -8,
            )
        )
    elif rain_probability is not None:
        information.append(
            context_item(
                "RAIN CHECK",
                f"Rain probability is {round(rain_probability)}% near first pitch.",
                "info",
                0,
            )
        )

    if (
        wind_speed is not None
        and wind_speed >= 15
    ):
        alerts.append(
            context_item(
                "STRONG WIND",
                f"Wind is projected at {wind_speed:.1f} mph.",
                "caution",
                -4,
            )
        )
    elif wind_speed is not None:
        information.append(
            context_item(
                "WIND",
                f"Wind is projected at {wind_speed:.1f} mph.",
                "info",
                0,
            )
        )

    if temperature is not None:
        information.append(
            context_item(
                "TEMPERATURE",
                f"Game-time temperature is projected near {round(temperature)}°F.",
                "info",
                0,
            )
        )


def evaluate_market(
    game: dict[str, Any],
    alerts: list[dict[str, Any]],
    positives: list[dict[str, Any]],
    information: list[dict[str, Any]],
) -> None:
    market = game.get(
        "market",
        {},
    )

    away_best = (
        market
        .get("moneyline", {})
        .get("best", {})
        .get("away")
    )

    home_best = (
        market
        .get("moneyline", {})
        .get("best", {})
        .get("home")
    )

    if away_best or home_best:
        positives.append(
            context_item(
                "MARKET AVAILABLE",
                "Current sportsbook prices are attached to this game.",
                "good",
                4,
            )
        )
    else:
        alerts.append(
            context_item(
                "MARKET PENDING",
                "Current sportsbook prices are unavailable.",
                "caution",
                -4,
            )
        )


def calculate_context_score(
    alerts: list[dict[str, Any]],
    positives: list[dict[str, Any]],
) -> int:
    score = 60

    score += sum(
        safe_int(item.get("weight")) or 0
        for item in positives
    )

    score += sum(
        safe_int(item.get("weight")) or 0
        for item in alerts
    )

    return max(
        0,
        min(
            100,
            score,
        ),
    )


def context_item(
    title: str,
    summary: str,
    level: str,
    weight: int,
) -> dict[str, Any]:
    return {
        "title": title,
        "summary": summary,
        "level": level,
        "weight": weight,
    }


def score_label(
    score: int,
) -> str:
    if score >= 85:
        return "CLEAR"
    if score >= 70:
        return "GOOD"
    if score >= 55:
        return "MIXED"
    if score >= 40:
        return "CAUTION"
    return "WARNING"


def safe_float(
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


def safe_int(
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
            "Usage: python3 scripts/mlb/context.py "
            "<game_id>"
        )

    requested_game_id = sys.argv[1]

    game = next(
        (
            item
            for item in load_games()
            if item.get("id")
            == requested_game_id
        ),
        None,
    )

    if not game:
        raise SystemExit(
            f"Game not found: {requested_game_id}"
        )

    snapshot = build_context_snapshot(
        game
    )

    print(
        json.dumps(
            snapshot,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
