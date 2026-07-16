from __future__ import annotations

from datetime import date
from typing import Any
import json
import urllib.request

FANGRAPHS_SPLITS_URL = "https://www.fangraphs.com/api/leaders/splits/splits-leaders"

# FanGraphs split-leaderboard identifiers. They can be combined, which lets
# Boring Bets ask for (for example) away games vs RHP over an exact date range.
SPLIT_IDS = {
    "vs_lhp": 1,
    "vs_rhp": 2,
    "home": 7,
    "away": 8,
}

TEAM_NAME_TO_MLB_ID = {
    "angels": 108, "los angeles angels": 108,
    "diamondbacks": 109, "arizona diamondbacks": 109, "d-backs": 109,
    "orioles": 110, "baltimore orioles": 110,
    "red sox": 111, "boston red sox": 111,
    "cubs": 112, "chicago cubs": 112,
    "reds": 113, "cincinnati reds": 113,
    "guardians": 114, "cleveland guardians": 114,
    "rockies": 115, "colorado rockies": 115,
    "tigers": 116, "detroit tigers": 116,
    "astros": 117, "houston astros": 117,
    "royals": 118, "kansas city royals": 118,
    "dodgers": 119, "los angeles dodgers": 119,
    "nationals": 120, "washington nationals": 120,
    "mets": 121, "new york mets": 121,
    "athletics": 133, "oakland athletics": 133, "a's": 133,
    "pirates": 134, "pittsburgh pirates": 134,
    "padres": 135, "san diego padres": 135,
    "mariners": 136, "seattle mariners": 136,
    "giants": 137, "san francisco giants": 137,
    "cardinals": 138, "st. louis cardinals": 138, "st louis cardinals": 138,
    "rays": 139, "tampa bay rays": 139,
    "rangers": 140, "texas rangers": 140,
    "blue jays": 141, "toronto blue jays": 141,
    "twins": 142, "minnesota twins": 142,
    "phillies": 143, "philadelphia phillies": 143,
    "braves": 144, "atlanta braves": 144,
    "white sox": 145, "chicago white sox": 145,
    "marlins": 146, "miami marlins": 146,
    "yankees": 147, "new york yankees": 147,
    "brewers": 158, "milwaukee brewers": 158,
}


def fetch_team_wrc_plus(
    start_date: date,
    end_date: date,
    location: str,
    hand: str,
) -> dict[int, float]:
    split_ids: list[int] = []
    if location in ("home", "away"):
        split_ids.append(SPLIT_IDS[location])
    if hand in ("vs_lhp", "vs_rhp"):
        split_ids.append(SPLIT_IDS[hand])

    payload = {
        "strPlayerId": "all",
        "strSplitArr": split_ids,
        "strGroup": "season",
        "strPosition": "B",
        "strType": "2",
        "strStartDate": start_date.isoformat(),
        "strEndDate": end_date.isoformat(),
        "strSplitTeams": False,
        "dctFilters": [],
        "strStatType": "team",
        "strAutoPt": "false",
        "arrPlayerId": [],
        "strSplitArrPitch": [],
        "arrWxTemperature": None,
        "arrWxPressure": None,
        "arrWxAirDensity": None,
        "arrWxElevation": None,
        "arrWxWindSpeed": None,
        "arrPageSize": "100",
    }
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        FANGRAPHS_SPLITS_URL,
        data=body,
        headers={
            "User-Agent": "Mozilla/5.0 BoringBets/1.0",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Referer": "https://www.fangraphs.com/leaders/splits-leaderboards",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=45) as response:
        raw = json.loads(response.read())

    result: dict[int, float] = {}
    for row in raw.get("data", []):
        team_name = _team_name(row)
        team_id = _team_id(row, team_name)
        value = _number(row.get("wRC+") or row.get("wRCPlus") or row.get("wrcPlus"))
        if team_id is not None and value is not None:
            result[team_id] = value
    return result


def _team_name(row: dict[str, Any]) -> str:
    value = row.get("TeamName") or row.get("Team") or row.get("teamName") or ""
    if isinstance(value, dict):
        value = value.get("name") or value.get("Name") or ""
    return str(value).strip().lower()


def _team_id(row: dict[str, Any], team_name: str) -> int | None:
    for key in ("teamid", "teamId", "TeamId", "xMLBAMID"):
        try:
            value = int(row.get(key))
            if value > 0:
                return value
        except (TypeError, ValueError):
            pass
    return TEAM_NAME_TO_MLB_ID.get(team_name)


def _number(value: Any) -> float | None:
    try:
        return float(str(value).replace("%", "").strip())
    except (TypeError, ValueError):
        return None
