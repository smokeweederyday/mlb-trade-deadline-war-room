#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".avif"}
NUMBERED_IMAGE = re.compile(r"^[a-z0-9-]+-\d{2,3}\.(?:jpg|jpeg|png|webp|avif)$", re.I)

def load(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise SystemExit(f"MISSING: {path}")
    except json.JSONDecodeError as error:
        raise SystemExit(f"INVALID JSON: {path}: {error}")
    if not isinstance(data, dict):
        raise SystemExit(f"INVALID ROOT OBJECT: {path}")
    return data

def main() -> int:
    repo = Path.cwd()
    registry = load(repo / "data" / "game-card-header-registry.json")
    slate = load(repo / "data" / "sports-card-config.json")
    root = repo / "assets" / "images" / "game-card-headers"

    errors: list[str] = []
    warnings: list[str] = []

    registered = {
        sport["id"]: {
            "sport": sport,
            "leagues": {league["id"]: league for league in sport.get("leagues", [])},
        }
        for sport in registry.get("sports", [])
    }

    for sport in slate.get("sports", []):
        sport_id = sport.get("id")
        if sport_id not in registered:
            errors.append(
                f"NEW SPORT WITHOUT HEADER LIBRARY: {sport_id}. "
                "Create comprehensive league coverage before release."
            )
            continue
        for league in sport.get("leagues", []):
            league_id = league.get("id")
            if league_id not in registered[sport_id]["leagues"]:
                errors.append(f"NEW SLATE LEAGUE WITHOUT HEADER LIBRARY: {sport_id}/{league_id}")

    expected_leagues = 0
    for item in registered.values():
        sport = item["sport"]
        for league_id in item["leagues"]:
            expected_leagues += 1
            league_root = root / sport["folder"] / league_id
            for required in ("HEADER-GUIDE.md", "manifest.json", "entities"):
                if not (league_root / required).exists():
                    errors.append(f"MISSING: {(league_root / required).relative_to(repo)}")

    for path in root.rglob("*") if root.exists() else []:
        if not path.is_file() or path.suffix.lower() not in IMAGE_EXTENSIONS:
            continue
        relative = path.relative_to(root)
        if "_CATEGORY-TEMPLATE-" in relative.as_posix():
            warnings.append(f"IMAGE INSIDE TEMPLATE: {relative}")
        if "entities" not in relative.parts:
            errors.append(f"IMAGE OUTSIDE ENTITY FOLDER: {relative}")
        if not NUMBERED_IMAGE.match(path.name):
            errors.append(f"INVALID IMAGE NAME: {relative}")

    if warnings:
        print("WARNINGS:")
        for warning in warnings:
            print(f"- {warning}")

    if errors:
        print("FAIL:")
        for error in errors:
            print(f"- {error}")
        print(
            "\nACTION REQUIRED: When a new sport is added to Today’s Card / Slate, "
            "prompt the team to add comprehensive major, lower, women’s, college, "
            "international, regional, tour, series, and competition header folders "
            "for all leagues with usable data."
        )
        return 1

    print(f"PASS: {expected_leagues} league/series header roots validated.")
    print("PASS: every current Today’s Card sport and league has header-library coverage.")
    print("PASS: all discovered header images are inside entity folders and use numbered names.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
