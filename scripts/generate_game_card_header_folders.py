#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".avif"}
SAFE_IMAGE_NAME = re.compile(
    r"^(?:day|dusk|night|pregame|live|final|playoffs|rivalry|neutral|"
    r"practice|qualifying|race|night-race|post-race|walkout|title-fight|"
    r"weigh-in|championship|interior|exterior|open|closed|fair|cloudy|"
    r"rain|snow|fog|extreme-heat|extreme-cold)-\d{2,3}\.(?:jpg|jpeg|png|webp|avif)$",
    re.IGNORECASE,
)

CATEGORY_PROFILES = {
    "outdoor_team_venue": [
        "weather/fair/day", "weather/fair/dusk", "weather/fair/night",
        "weather/cloudy/day", "weather/cloudy/night",
        "weather/rain/day", "weather/rain/night",
        "weather/snow/day", "weather/snow/night",
        "weather/fog/day", "weather/fog/night",
        "weather/extreme-heat/day", "weather/extreme-cold/day",
        "state/pregame", "state/live", "state/final",
        "state/playoffs", "state/rivalry", "state/neutral",
        "roof/open", "roof/closed",
    ],
    "indoor_team_venue": [
        "lighting/interior/pregame", "lighting/interior/live", "lighting/interior/final",
        "lighting/exterior/day", "lighting/exterior/dusk", "lighting/exterior/night",
        "state/playoffs", "state/rivalry", "state/neutral",
    ],
    "mixed_tournament": [
        "outdoor/weather/fair/day", "outdoor/weather/fair/dusk", "outdoor/weather/fair/night",
        "outdoor/weather/cloudy", "outdoor/weather/rain",
        "indoor/state/pregame", "indoor/state/live", "indoor/state/final",
        "state/championship", "state/neutral",
    ],
    "outdoor_tournament": [
        "weather/fair/day", "weather/fair/dusk", "weather/fair/night",
        "weather/cloudy", "weather/rain", "weather/fog",
        "weather/extreme-heat", "weather/extreme-cold",
        "state/pregame", "state/live", "state/final", "state/championship",
    ],
    "indoor_event": [
        "state/pregame", "state/walkout", "state/live", "state/final",
        "state/title-fight", "state/weigh-in", "state/championship", "state/neutral",
        "lighting/exterior/day", "lighting/exterior/night",
    ],
    "outdoor_track": [
        "weather/fair/day", "weather/fair/dusk", "weather/fair/night",
        "weather/cloudy/day", "weather/cloudy/night",
        "weather/rain/day", "weather/rain/night",
        "weather/fog/day", "weather/extreme-heat/day", "weather/extreme-cold/day",
        "session/practice", "session/qualifying", "session/race",
        "session/night-race", "session/post-race",
    ],
}

def read_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise SystemExit(f"MISSING: {path}")
    except json.JSONDecodeError as error:
        raise SystemExit(f"INVALID JSON: {path}: {error}")
    if not isinstance(payload, dict):
        raise SystemExit(f"INVALID ROOT OBJECT: {path}")
    return payload

def slug(value: Any) -> str:
    text = str(value or "").strip().lower()
    text = re.sub(r"[’']", "", text)
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-") or "unknown"

def slate_coverage_errors(registry: dict[str, Any], slate: dict[str, Any]) -> list[str]:
    registry_sports = {sport["id"]: sport for sport in registry.get("sports", [])}
    errors: list[str] = []
    for sport in slate.get("sports", []):
        sport_id = sport.get("id")
        if sport_id not in registry_sports:
            errors.append(
                f"NEW SPORT NEEDS HEADER COVERAGE: {sport_id}. "
                "Add comprehensive leagues, guides, manifests, and category rules."
            )
            continue
        registered_leagues = {
            league.get("id") for league in registry_sports[sport_id].get("leagues", [])
        }
        for league in sport.get("leagues", []):
            league_id = league.get("id")
            if league_id not in registered_leagues:
                errors.append(
                    f"NEW LEAGUE NEEDS HEADER COVERAGE: {sport_id}/{league_id}."
                )
    return errors

def guide_text(sport: dict[str, Any], league: dict[str, Any]) -> str:
    return f"""# {league["label"]} Game-Card Header Photos

Location: `{sport["folder"]}/{league["id"]}`  
Sport: {sport["label"]}  
Profile: `{sport["profile"]}`

## Mike’s workflow

1. Create or open the team, venue, arena, track, course, tournament, or event folder
   inside `entities/`.
2. Copy this league’s category skeleton into that entity folder.
3. Put each wide game-card header image into the most accurate category.
4. Use numbered names such as `day-01.webp`, `night-02.jpg`, or `live-01.webp`.
5. Run:

   `python3 scripts/generate_game_card_header_folders.py`

   `python3 scripts/check_game_card_header_coverage.py`

## Photo requirements

- Wide horizontal composition; recommended minimum width: 1900 px.
- The venue, track, course, arena, event stage, or recognizable setting should be clear.
- Avoid close-up player portraits unless the event has no stable venue identity.
- Avoid score graphics, watermarks, heavy text overlays, and misleading weather.
- Keep licensing and attribution in the entity folder’s `ATTRIBUTION.md`.
- Do not place images directly in the league root.

## Selector principle

Every game card needs a header. Weather folders are used only when weather can
materially affect the sport or scene. Indoor sports use lighting and event-state
folders instead.
"""

def league_manifest(sport: dict[str, Any], league: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema_version": "1.0",
        "sport_id": sport["id"],
        "sport_label": sport["label"],
        "league_id": league["id"],
        "league_label": league["label"],
        "region": league.get("region"),
        "level": league.get("level"),
        "gender": league.get("gender"),
        "profile": sport["profile"],
        "entity_root": "entities",
        "category_template": f"_CATEGORY-TEMPLATE-{sport['profile']}",
        "image_contract": {
            "purpose": "game-card-header",
            "recommended_width": 1900,
            "recommended_aspect_ratio": "1916:821",
            "allowed_extensions": sorted(IMAGE_EXTENSIONS),
            "numbered_names_required": True,
        },
    }

def write_if_changed(path: Path, content: str) -> bool:
    if path.exists() and path.read_text(encoding="utf-8") == content:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return True

def build_category_template(league_root: Path, profile: str) -> int:
    template = league_root / f"_CATEGORY-TEMPLATE-{profile}"
    created = 0
    for relative in CATEGORY_PROFILES[profile]:
        folder = template / relative
        if not folder.exists():
            folder.mkdir(parents=True, exist_ok=True)
            created += 1
        keep = folder / ".gitkeep"
        if not keep.exists():
            keep.write_text("", encoding="utf-8")
    return created

def collect_index(root: Path, registry: dict[str, Any]) -> dict[str, Any]:
    index = {
        "schema_version": "1.0",
        "root": str(root.as_posix()),
        "sports": {},
    }
    for sport in registry.get("sports", []):
        sport_data = {"label": sport["label"], "folder": sport["folder"], "leagues": {}}
        for league in sport.get("leagues", []):
            league_root = root / sport["folder"] / league["id"]
            images = []
            if league_root.exists():
                for path in league_root.rglob("*"):
                    if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS:
                        images.append(path.relative_to(root).as_posix())
            sport_data["leagues"][league["id"]] = {
                "label": league["label"],
                "profile": sport["profile"],
                "path": league_root.relative_to(root).as_posix(),
                "images": sorted(images),
            }
        index["sports"][sport["id"]] = sport_data
    return index

def main() -> int:
    parser = argparse.ArgumentParser(
        description="Create and index Mike-ready all-sports game-card header folders."
    )
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--allow-missing-slate-coverage", action="store_true")
    args = parser.parse_args()

    repo = args.root.resolve()
    registry_path = repo / "data" / "game-card-header-registry.json"
    slate_path = repo / "data" / "sports-card-config.json"
    output_root = repo / "assets" / "images" / "game-card-headers"

    registry = read_json(registry_path)
    slate = read_json(slate_path)

    errors = slate_coverage_errors(registry, slate)
    if errors and not args.allow_missing_slate_coverage:
        print("\n".join(f"ERROR: {item}" for item in errors))
        print(
            "\nPROMPT: A sport or league was added to Today’s Card / Slate. "
            "Review all relevant major, lower, women’s, college, international, "
            "regional, developmental, tour, series, and competition folders for "
            "which usable data exists before continuing."
        )
        return 2

    output_root.mkdir(parents=True, exist_ok=True)

    root_readme = """# Boring Bets Game-Card Header Library

This is the human-maintained source library for every game-card header across
Today’s Card and the future Slate.

Organization:

`<sport>/<league-or-series>/entities/<team-venue-track-event>/...`

The generated league folders intentionally cover more competitions than the
current UI. Every current Slate sport and league must be represented here.

Run:

- `python3 scripts/generate_game_card_header_folders.py`
- `python3 scripts/check_game_card_header_coverage.py`
"""
    changed = int(write_if_changed(output_root / "README.md", root_readme))
    folder_count = 0
    league_count = 0

    for sport in registry.get("sports", []):
        profile = sport.get("profile")
        if profile not in CATEGORY_PROFILES:
            raise SystemExit(f"UNKNOWN PROFILE: {profile}")
        for league in sport.get("leagues", []):
            league_count += 1
            league_root = output_root / sport["folder"] / league["id"]
            entities = league_root / "entities"
            entities.mkdir(parents=True, exist_ok=True)
            unassigned = entities / "_UNASSIGNED"
            unassigned.mkdir(parents=True, exist_ok=True)

            changed += int(write_if_changed(
                league_root / "HEADER-GUIDE.md",
                guide_text(sport, league),
            ))
            changed += int(write_if_changed(
                league_root / "manifest.json",
                json.dumps(league_manifest(sport, league), indent=2, ensure_ascii=False) + "\n",
            ))
            changed += int(write_if_changed(
                unassigned / "README.md",
                "Place uncategorized candidate images here temporarily. "
                "Move approved images into a named entity and category before commit.\n",
            ))
            folder_count += build_category_template(league_root, profile)

    index = collect_index(output_root, registry)
    changed += int(write_if_changed(
        output_root / "header-index.json",
        json.dumps(index, indent=2, ensure_ascii=False) + "\n",
    ))

    js = "window.BORING_BETS_GAME_CARD_HEADER_INDEX = " + json.dumps(
        index, ensure_ascii=False, separators=(",", ":")
    ) + ";\n"
    changed += int(write_if_changed(
        repo / "assets" / "js" / "game-card-header-index.js",
        js,
    ))

    print(f"PASS: {league_count} league/series header roots are ready.")
    print(f"PASS: {folder_count} category folders were created.")
    print(f"PASS: header index written with {changed} changed generated files.")
    if errors:
        print("WARNINGS:")
        for item in errors:
            print(f"- {item}")
    else:
        print("PASS: every current Today’s Card sport and league has registry coverage.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
