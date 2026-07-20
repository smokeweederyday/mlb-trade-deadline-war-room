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
    "nym": 121, "phi": 143, "nyy": 147, "bos": 111,
    "lad": 119, "sd": 135, "sf": 137, "sea": 136,
    "tb": 139, "tex": 140, "tor": 141, "mil": 158,
    "atl": 144, "mia": 146, "cws": 145, "chc": 112,
    "cle": 114, "cin": 113, "det": 116, "hou": 117,
    "kc": 118, "min": 142, "bal": 110, "pit": 134,
    "stl": 138, "wsh": 120, "col": 115, "ari": 109,
    "ath": 133, "laa": 108,

    # FanGraphs frequently uses these legacy or
    # three-letter abbreviations in split rows.
    "kcr": 118,
    "wsn": 120,
    "sdp": 135,
    "sfg": 137,
    "tbr": 139,
    "chw": 145,

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


def fetch_raw_team_wrc_rows(
    start_date: date,
    end_date: date,
    location: str,
    hand: str,
) -> list[dict[str, Any]]:
    split_ids: list[int] = []
    if location in ("home", "away"):
        split_ids.append(SPLIT_IDS[location])
    if hand in ("vs_lhp", "vs_rhp"):
        split_ids.append(SPLIT_IDS[hand])

    payload = {
        "strPlayerId": "all", "strSplitArr": split_ids, "strGroup": "season",
        "strPosition": "B", "strType": "2",
        "strStartDate": start_date.isoformat(), "strEndDate": end_date.isoformat(),
        "strSplitTeams": False, "dctFilters": [], "strStatType": "team",
        "strAutoPt": "false", "arrPlayerId": [], "strSplitArrPitch": [],
        "arrWxTemperature": None, "arrWxPressure": None,
        "arrWxAirDensity": None, "arrWxElevation": None,
        "arrWxWindSpeed": None, "arrPageSize": "100",
    }
    request = urllib.request.Request(
        FANGRAPHS_SPLITS_URL, data=json.dumps(payload).encode("utf-8"),
        headers={
            "User-Agent": "Mozilla/5.0 BoringBets/1.0",
            "Content-Type": "application/json", "Accept": "application/json",
            "Referer": "https://www.fangraphs.com/leaders/splits-leaderboards",
        }, method="POST",
    )
    with urllib.request.urlopen(request, timeout=45) as response:
        raw = json.loads(response.read())
    if isinstance(raw, dict):
        rows = raw.get("data") or raw.get("rows") or raw.get("results") or []
    elif isinstance(raw, list):
        rows = raw
    else:
        rows = []
    return [row for row in rows if isinstance(row, dict)]


def fetch_team_wrc_plus(
    start_date: date,
    end_date: date,
    location: str,
    hand: str,
) -> dict[int, float]:
    result: dict[int, float] = {}
    for row in fetch_raw_team_wrc_rows(start_date, end_date, location, hand):
        team_name = _team_name(row)
        team_id = _team_id(row, team_name)
        value = _number(
            row.get("wRC+") or row.get("wRCPlus") or row.get("wrcPlus")
            or row.get("wRC_plus") or row.get("WRC+")
        )
        if team_id is not None and value is not None:
            result[team_id] = value
    return result

def _normalize_team_token(value: Any) -> str:
    text = str(value or "").strip().lower()
    text = text.replace("–", "-").replace("—", "-")
    return " ".join(text.split())


def _team_name(row: dict[str, Any]) -> str:
    """Find a team label without assuming FanGraphs' field name.

    Different FanGraphs endpoints have used Team, TeamName, Name, squad, and
    nested team objects. Scan preferred fields first, then every scalar value.
    """
    preferred = (
        "TeamName", "Team", "teamName", "team", "Name", "name",
        "Squad", "squad", "Tm", "tm", "Abbreviation", "abbreviation",
    )
    candidates: list[Any] = []
    for key in preferred:
        if key in row:
            candidates.append(row.get(key))
    candidates.extend(row.values())

    aliases = sorted(TEAM_NAME_TO_MLB_ID, key=len, reverse=True)
    for value in candidates:
        if isinstance(value, dict):
            nested = [
                value.get("name"), value.get("Name"),
                value.get("abbreviation"), value.get("Abbreviation"),
                value.get("shortName"), value.get("displayName"),
            ]
        elif isinstance(value, (str, int, float)):
            nested = [value]
        else:
            continue

        for item in nested:
            token = _normalize_team_token(item)
            if not token:
                continue
            if token in TEAM_NAME_TO_MLB_ID:
                return token
            # Handles labels such as "New York Mets (NYM)" or "Mets - Team".
            padded = f" {token} "
            for alias in aliases:
                if f" {alias} " in padded or token.startswith(alias + " ") or token.endswith(" " + alias):
                    return alias
    return ""

def _team_id(row: dict[str, Any], team_name: str) -> int | None:
    """Return the MLB Stats API team ID, never FanGraphs' internal team ID.

    FanGraphs fields such as ``teamid``/``TeamId`` use FanGraphs' own ID
    namespace. Those values do not match MLBAM IDs and previously caused all
    30 successful wRC+ rows to be discarded during the merge. Prefer the
    normalized team-name mapping; use xMLBAMID only when FanGraphs supplies it.
    """
    mapped = TEAM_NAME_TO_MLB_ID.get(team_name)
    if mapped is not None:
        return mapped

    try:
        value = int(row.get("xMLBAMID"))
        if value > 0:
            return value
    except (TypeError, ValueError):
        pass

    return None


def _number(value: Any) -> float | None:
    try:
        return float(str(value).replace("%", "").strip())
    except (TypeError, ValueError):
        return None
