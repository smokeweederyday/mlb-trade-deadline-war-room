#!/usr/bin/env python3
"""Keep Today’s Card data current while developing locally.

Fast cycles synchronize official MLB state, rebuild affiliated Minor League daily
cards, and rebuild the compact MLB card feed. A full enrichment runs periodically
unless --fast-only is supplied.
"""
from __future__ import annotations

import argparse
from datetime import datetime
from pathlib import Path
import subprocess
import sys
import time
from typing import List
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
EASTERN = ZoneInfo("America/New_York")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Continuously refresh local Today’s Card data.")
    parser.add_argument("--interval-minutes", type=float, default=15.0)
    parser.add_argument(
        "--full-every-cycles",
        type=int,
        default=4,
        help="Run full enrichment every N fast cycles (default: 4, or hourly at a 15-minute interval).",
    )
    parser.add_argument("--fast-only", action="store_true", help="Never run the heavier full enrichment.")
    parser.add_argument("--once", action="store_true", help="Run one cycle and exit.")
    parser.add_argument("--skip-minors", action="store_true")
    parser.add_argument("--continue-on-error", action="store_true")
    return parser.parse_args()


def run(command: List[str], required: bool = True) -> bool:
    print("\n$ " + " ".join(command), flush=True)
    completed = subprocess.run(command, cwd=str(ROOT), check=False)
    if completed.returncode == 0:
        return True
    message = "Command failed with exit code {}".format(completed.returncode)
    if required:
        raise RuntimeError(message)
    print("WARNING: " + message, file=sys.stderr, flush=True)
    return False


def fast_cycle(card_date: str, season: str, skip_minors: bool) -> None:
    run([
        sys.executable, "-u", str(SCRIPTS / "sync_baseball_final_scores.py"),
        "--season", season, "--date", card_date,
    ])
    if not skip_minors:
        run([
            sys.executable, "-u", str(SCRIPTS / "build_minor_league_schedules.py"),
            "--season", season, "--date", card_date, "--daily-only",
        ], required=False)
    run([
        sys.executable, "-u", str(SCRIPTS / "build_todays_card_data.py"),
        "--date", card_date,
    ])


def full_cycle(card_date: str, continue_on_error: bool) -> None:
    command = [
        sys.executable, "-u", str(SCRIPTS / "scheduled_refresh.py"),
        "--date", card_date, "--days-ahead", "0",
    ]
    if continue_on_error:
        command.append("--continue-on-error")
    run(command)


def main() -> int:
    args = parse_args()
    if args.interval_minutes <= 0:
        raise SystemExit("--interval-minutes must be greater than zero.")
    if args.full_every_cycles <= 0:
        raise SystemExit("--full-every-cycles must be greater than zero.")

    cycle = 0
    print("Boring Bets local card updater")
    print("Leave this Terminal window open. Press Control-C to stop.")

    while True:
        cycle += 1
        now = datetime.now(EASTERN)
        card_date = now.date().isoformat()
        season = card_date[:4]
        print("\n=== Cycle {} · {} ET ===".format(cycle, now.strftime("%Y-%m-%d %I:%M:%S %p")), flush=True)

        try:
            if not args.fast_only and ((cycle - 1) % args.full_every_cycles == 0):
                full_cycle(card_date, args.continue_on_error)
            else:
                fast_cycle(card_date, season, args.skip_minors)
        except Exception as exc:
            print("REFRESH ERROR: {}".format(exc), file=sys.stderr, flush=True)
            if not args.continue_on_error:
                return 1

        if args.once:
            break
        sleep_seconds = max(60.0, args.interval_minutes * 60.0)
        print("\nNext cycle in {:.0f} minutes.".format(sleep_seconds / 60.0), flush=True)
        try:
            time.sleep(sleep_seconds)
        except KeyboardInterrupt:
            print("\nStopped local card updater.")
            break

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
