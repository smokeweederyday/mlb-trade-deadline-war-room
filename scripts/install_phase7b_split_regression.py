#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "scripts" / "mlb" / "pitchers.py"
BACKUP = TARGET.with_suffix(".py.before-phase7b-splits")

if not TARGET.exists():
    raise SystemExit(f"Could not find {TARGET}")

text = TARGET.read_text(encoding="utf-8")
marker = '''            stats_root[timeframe][location] = block\n\n    return {\n'''
insert = '''            stats_root[timeframe][location] = block\n\n    # Restore canonical season/all handedness splits. MLB sometimes leaves\n    # recent or location-specific split pools empty, but these two season\n    # splits are the stable fallback used by the pitcher table. They must be\n    # stored both inside season/all and as backwards-compatible aliases.\n    season_lhh = fetch_safe_split(pitcher_id, season, "vl")\n    season_rhh = fetch_safe_split(pitcher_id, season, "vr")\n\n    season_all = stats_root.setdefault("season", {}).setdefault("all", {})\n    if season_lhh:\n        season_all["vs_lhh"] = season_lhh\n        stats_root["vs_lhh"] = season_lhh\n    if season_rhh:\n        season_all["vs_rhh"] = season_rhh\n        stats_root["vs_rhh"] = season_rhh\n\n    return {\n'''

if 'season_lhh = fetch_safe_split(pitcher_id, season, "vl")' in text:
    print("Phase 7B split regression fix is already installed.")
    raise SystemExit(0)

if marker not in text:
    raise SystemExit(
        "Could not find the expected pitcher snapshot block. "
        "Do not modify the file manually; send the current project zip."
    )

shutil.copy2(TARGET, BACKUP)
TARGET.write_text(text.replace(marker, insert, 1), encoding="utf-8")
print(f"Installed Phase 7B split regression fix: {TARGET}")
print(f"Backup created: {BACKUP}")
