#!/usr/bin/env python3
"""Build the recursive, Mike-safe Boring Bets venue image index."""

from __future__ import annotations

import json
import re
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CANONICAL_ROOT = ROOT / "assets" / "images" / "venues"
LEGACY_BASEBALL_ROOT = (
    ROOT / "assets" / "images" / "stadiums" / "venues"
)
JSON_OUTPUT = CANONICAL_ROOT / "venue-index.json"
JS_OUTPUT = ROOT / "assets" / "js" / "venue-image-index.js"
LEGACY_JSON_OUTPUT = LEGACY_BASEBALL_ROOT / "venue-index.json"

IMAGE_EXTENSIONS = {"webp", "jpg", "jpeg", "png", "avif"}
FORMAT_PRIORITY = {
    "webp": 0,
    "avif": 1,
    "jpg": 2,
    "jpeg": 3,
    "png": 4,
}

WEATHER_CONDITIONS = (
    "fair",
    "partly-cloudy",
    "cloudy",
    "overcast",
    "haze",
    "smoke",
    "fog",
    "windy",
    "drizzle",
    "rain",
    "heavy-rain",
    "thunderstorm",
    "lightning",
    "hail",
    "freezing-rain",
    "sleet",
    "snow",
    "heavy-snow",
    "dust",
    "extreme-heat",
    "extreme-cold",
)

EVENT_STATES = (
    "rain-delay",
    "weather-delay",
    "suspended-weather",
    "postponed-weather",
)

ROOF_STATES = (
    "open",
    "closed",
    "fixed-dome",
    "unknown",
)

NUMBERED_PATTERN = re.compile(
    r"^(?P<variant>[a-z0-9]+(?:-[a-z0-9]+)*)"
    r"-(?P<priority>\d{2,3})"
    r"\.(?P<extension>webp|jpg|jpeg|png|avif)$"
)

LEGACY_PATTERN = re.compile(
    r"^(?P<variant>[a-z0-9]+(?:-[a-z0-9]+)*)"
    r"\.(?P<extension>webp|jpg|jpeg|png|avif)$"
)

PHOTO_GUIDE = """# Venue photo folder guide

This folder is safe to give to a nontechnical photo researcher.

## Priority

Inside any category folder:

    day-01.webp
    day-02.webp
    dusk-01.webp
    night-01.webp

- `01` is primary.
- `02` is the first fallback.
- `03` is the next fallback.
- Incorrect filenames are ignored.
- Missing categories fall back safely.
- Legacy flat files remain supported.

## Weather folders

    weather/fair/
    weather/partly-cloudy/
    weather/cloudy/
    weather/overcast/
    weather/haze/
    weather/smoke/
    weather/fog/
    weather/windy/
    weather/drizzle/
    weather/rain/
    weather/heavy-rain/
    weather/thunderstorm/
    weather/lightning/
    weather/hail/
    weather/freezing-rain/
    weather/sleet/
    weather/snow/
    weather/heavy-snow/
    weather/dust/
    weather/extreme-heat/
    weather/extreme-cold/

Each weather folder may contain:

    day-01.webp
    dusk-01.webp
    night-01.webp
    default-01.webp

## Event-state folders

Tarp and delay photographs are not ordinary rain:

    event-state/rain-delay/
    event-state/weather-delay/
    event-state/suspended-weather/
    event-state/postponed-weather/

## Venue-state folders

    roof/open/
    roof/closed/
    roof/fixed-dome/
    roof/unknown/
    interior/
    exterior/

Examples:

    roof/closed/night-01.webp
    interior/night-01.webp
    exterior/day-01.webp

Closed indoor venues ignore outside weather. T-Mobile Park remains the explicit
weather-exposed exception.

## Image recommendations

- Landscape orientation.
- Recommended export: 1916 x 821.
- Real venue photography.
- Avoid watermarks and promotional text.
- Record source and license in `ATTRIBUTION.md` when known.

After adding photos, run:

    python3 scripts/build_venue_image_index.py
"""

WEATHER_REFERENCE = """# Weather category reference

The resolver starts with the exact condition and moves only toward visually
safer, broader fallbacks.

Examples:

- Lightning: lightning -> thunderstorm -> heavy-rain -> rain -> overcast
  -> cloudy -> partly-cloudy -> fair -> default
- Rain: rain -> drizzle -> overcast -> cloudy -> partly-cloudy -> fair
  -> default
- Fog: fog -> haze -> overcast -> cloudy -> fair -> default
- Snow: snow -> overcast -> cloudy -> partly-cloudy -> fair -> default
- Fair: fair -> partly-cloudy -> cloudy -> default

A missing rain image never escalates into lightning.

Times:

    day-01.webp
    dusk-01.webp
    night-01.webp
    default-01.webp

Priority:

    01 primary
    02 first fallback
    03 next fallback
"""


def slugify(value):
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(
        char for char in text
        if not unicodedata.combining(char)
    )
    text = text.lower().replace("&", " and ")
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


def normalize_variant_parts(parts):
    return "/".join(
        slugify(part)
        for part in parts
        if slugify(part)
    )


def write_if_changed(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.read_text(encoding="utf-8") == content:
        return False
    temporary = path.with_suffix(path.suffix + ".part")
    temporary.write_text(content, encoding="utf-8")
    temporary.replace(path)
    return True


def read_manifest(folder):
    path = folder / "manifest.json"
    if not path.exists():
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except Exception:
        return {}


def ensure_folder_skeleton(folder):
    for condition in WEATHER_CONDITIONS:
        (folder / "weather" / condition).mkdir(
            parents=True,
            exist_ok=True,
        )

    for state in EVENT_STATES:
        (folder / "event-state" / state).mkdir(
            parents=True,
            exist_ok=True,
        )

    for state in ROOF_STATES:
        (folder / "roof" / state).mkdir(
            parents=True,
            exist_ok=True,
        )

    (folder / "interior").mkdir(parents=True, exist_ok=True)
    (folder / "exterior").mkdir(parents=True, exist_ok=True)

    write_if_changed(
        folder / "PHOTO-GUIDE.md",
        PHOTO_GUIDE,
    )
    write_if_changed(
        folder / "WEATHER-CATEGORIES.md",
        WEATHER_REFERENCE,
    )


def parse_image_file(path, folder):
    lower_name = path.name.lower()

    match = NUMBERED_PATTERN.fullmatch(lower_name)
    if match:
        parsed = {
            "leaf": match.group("variant"),
            "priority": int(match.group("priority")),
            "legacy": False,
            "extension": match.group("extension"),
        }
    else:
        match = LEGACY_PATTERN.fullmatch(lower_name)
        if match:
            parsed = {
                "leaf": match.group("variant"),
                "priority": 9999,
                "legacy": True,
                "extension": match.group("extension"),
            }
        elif path.suffix.lower().lstrip(".") in IMAGE_EXTENSIONS:
            return {"invalid": True}
        else:
            return None

    relative_parent = path.relative_to(folder).parent
    parent_parts = (
        []
        if str(relative_parent) == "."
        else list(relative_parent.parts)
    )

    parsed["variant"] = normalize_variant_parts(
        [*parent_parts, parsed["leaf"]]
    )

    return parsed


def discover_folders():
    found = []

    if CANONICAL_ROOT.exists():
        for sport_folder in sorted(CANONICAL_ROOT.iterdir()):
            if not sport_folder.is_dir():
                continue
            if sport_folder.name.startswith("_"):
                continue

            sport = slugify(sport_folder.name) or "unknown"

            for venue_folder in sorted(sport_folder.iterdir()):
                if (
                    venue_folder.is_dir()
                    and not venue_folder.name.startswith("_")
                ):
                    found.append(
                        (sport, venue_folder, "canonical")
                    )

    if LEGACY_BASEBALL_ROOT.exists():
        for venue_folder in sorted(LEGACY_BASEBALL_ROOT.iterdir()):
            if (
                venue_folder.is_dir()
                and not venue_folder.name.startswith("_")
            ):
                found.append(
                    ("baseball", venue_folder, "legacy-stadium")
                )

    return found


def build_entry(sport, folder, source_type):
    ensure_folder_skeleton(folder)

    manifest = read_manifest(folder)
    slug = slugify(
        manifest.get("folder") or folder.name
    ) or folder.name
    venue_name = str(
        manifest.get("venue_name")
        or manifest.get("name")
        or folder.name.replace("-", " ").title()
    ).strip()
    venue_id = str(
        manifest.get("venue_id")
        or manifest.get("id")
        or ""
    ).strip()

    aliases = {
        slug,
        slugify(folder.name),
        slugify(venue_name),
    }

    for value in manifest.get("aliases", []):
        alias = slugify(value)
        if alias:
            aliases.add(alias)

    files = defaultdict(list)
    warnings = []

    for path in sorted(folder.rglob("*")):
        if not path.is_file():
            continue
        if any(part.startswith(".") for part in path.relative_to(folder).parts):
            continue

        parsed = parse_image_file(path, folder)
        if parsed is None:
            continue

        if parsed.get("invalid"):
            warnings.append(
                f"Ignored invalid image filename: "
                f"{path.relative_to(folder).as_posix()}"
            )
            continue

        relative = path.relative_to(ROOT).as_posix()
        files[parsed["variant"]].append(
            {
                "path": relative,
                "priority": parsed["priority"],
                "legacy": parsed["legacy"],
                "format": parsed["extension"],
                "filename": path.name,
            }
        )

    normalized_files = {}

    for variant, items in sorted(files.items()):
        items.sort(
            key=lambda item: (
                item["priority"],
                FORMAT_PRIORITY.get(item["format"], 99),
                item["filename"].lower(),
            )
        )

        seen_priority = set()

        for item in items:
            key = (item["priority"], item["legacy"])
            if key in seen_priority and not item["legacy"]:
                warnings.append(
                    f"Duplicate numbered priority for "
                    f"{variant}: {item['priority']:02d}"
                )
            seen_priority.add(key)

        normalized_files[variant] = items

    return {
        "sport": slugify(
            manifest.get("sport") or sport
        ) or "unknown",
        "slug": slug,
        "venue_id": venue_id,
        "venue_name": venue_name,
        "aliases": sorted(alias for alias in aliases if alias),
        "source_type": source_type,
        "folder": folder.relative_to(ROOT).as_posix(),
        "files": normalized_files,
        "warnings": warnings,
    }


def merge_entries(entries):
    merged = {}

    for entry in entries:
        key = (entry["sport"], entry["slug"])

        if key not in merged:
            merged[key] = entry
            continue

        current = merged[key]

        if (
            current["source_type"] != "canonical"
            and entry["source_type"] == "canonical"
        ):
            primary = entry
            secondary = current
        else:
            primary = current
            secondary = entry

        for alias in secondary["aliases"]:
            if alias not in primary["aliases"]:
                primary["aliases"].append(alias)

        if not primary["venue_id"] and secondary["venue_id"]:
            primary["venue_id"] = secondary["venue_id"]

        for variant, files in secondary["files"].items():
            existing_paths = {
                item["path"]
                for item in primary["files"].get(variant, [])
            }
            primary["files"].setdefault(variant, [])

            for item in files:
                if item["path"] not in existing_paths:
                    primary["files"][variant].append(item)

            primary["files"][variant].sort(
                key=lambda item: (
                    item["priority"],
                    FORMAT_PRIORITY.get(item["format"], 99),
                    item["filename"].lower(),
                )
            )

        primary["warnings"].extend(secondary["warnings"])
        primary["aliases"] = sorted(set(primary["aliases"]))
        merged[key] = primary

    return list(merged.values())


def main():
    CANONICAL_ROOT.mkdir(parents=True, exist_ok=True)
    JS_OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    discovered = [
        build_entry(sport, folder, source_type)
        for sport, folder, source_type in discover_folders()
    ]

    venues = merge_entries(discovered)
    venues.sort(
        key=lambda entry: (
            entry["sport"],
            entry["venue_name"].lower(),
            entry["slug"],
        )
    )

    payload = {
        "version": 2,
        "generated_at": datetime.now(
            timezone.utc
        ).isoformat(),
        "naming": {
            "recursive": (
                "<category>/<condition>/<time>-01.<extension>"
            ),
            "primary": "<time>-01.<extension>",
            "fallback": "<time>-02.<extension>",
            "legacy": "<variant>.<extension>",
        },
        "weather_conditions": list(WEATHER_CONDITIONS),
        "event_states": list(EVENT_STATES),
        "venue_count": len(venues),
        "venues": venues,
    }

    json_text = json.dumps(
        payload,
        indent=2,
        ensure_ascii=False,
    ) + "\n"

    js_text = (
        "window.BORING_BETS_VENUE_IMAGE_INDEX = "
        + json.dumps(
            payload,
            ensure_ascii=False,
            separators=(",", ":"),
        )
        + ";\n"
    )

    write_if_changed(JSON_OUTPUT, json_text)
    write_if_changed(JS_OUTPUT, js_text)

    if LEGACY_BASEBALL_ROOT.exists():
        write_if_changed(LEGACY_JSON_OUTPUT, json_text)

    warning_count = sum(
        len(entry["warnings"])
        for entry in venues
    )
    image_count = sum(
        len(items)
        for entry in venues
        for items in entry["files"].values()
    )

    print(
        f"PASS: indexed {image_count} venue images "
        f"across {len(venues)} venues."
    )
    print("PASS: recursive weather folders are active.")
    print(
        "PASS: numbered images sort before legacy "
        "unnumbered fallbacks."
    )
    print(
        "PASS: invalid image filenames are ignored "
        "instead of breaking the site."
    )
    print(
        f"PASS: prepared weather folder skeletons for "
        f"{len(discovered)} venue folders."
    )
    print(f"WARNINGS: {warning_count}")
    print(f"JSON: {JSON_OUTPUT}")
    print(f"JS: {JS_OUTPUT}")


if __name__ == "__main__":
    main()
