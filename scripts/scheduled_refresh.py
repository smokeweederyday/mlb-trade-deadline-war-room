#!/usr/bin/env python3
"""Boring Bets scheduled operations refresh.

This is an orchestrator: it runs existing scripts in a predictable order and
records one machine-readable status report. It intentionally does not contain
sport-stat calculations of its own.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional, Sequence
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
CACHE = ROOT / "data" / "cache"
LOCK_FILE = CACHE / "scheduled-refresh.lock"
STATUS_FILE = CACHE / "scheduled-refresh-status.json"
EASTERN = ZoneInfo("America/New_York")


@dataclass
class StepResult:
    name: str
    command: list[str]
    required: bool
    status: str
    started_at: str
    finished_at: Optional[str] = None
    duration_seconds: Optional[float] = None
    return_code: Optional[int] = None
    message: Optional[str] = None


def parse_args() -> argparse.Namespace:
    today = datetime.now(EASTERN).date().isoformat()
    parser = argparse.ArgumentParser(
        description="Refresh current Boring Bets data with one command."
    )
    parser.add_argument(
        "--date",
        default=today,
        help="First venue-operations date in YYYY-MM-DD format (default: today ET).",
    )
    parser.add_argument(
        "--days-ahead",
        type=int,
        default=1,
        help="Also refresh this many future dates (default: 1, meaning tomorrow).",
    )
    parser.add_argument(
        "--season",
        type=int,
        default=None,
        help="Season used by optional full schedule sync; defaults to --date year.",
    )
    parser.add_argument(
        "--sync-season",
        action="store_true",
        help="Run the full-season schedule sync before current-date updates.",
    )
    parser.add_argument(
        "--trade-deadline",
        action="store_true",
        help="Also run scripts/update_data.py for the trade-deadline data feed.",
    )
    parser.add_argument(
        "--skip-globe",
        action="store_true",
        help="Skip rebuilding data/venues.json.",
    )
    parser.add_argument(
        "--skip-verification",
        action="store_true",
        help="Skip non-mutating health checks.",
    )
    parser.add_argument(
        "--skip-results",
        action="store_true",
        help="Skip official MLB status, score, line-score, and decision synchronization.",
    )
    parser.add_argument(
        "--skip-minors",
        action="store_true",
        help="Skip current-date affiliated Minor League schedule/status refreshes.",
    )
    parser.add_argument(
        "--skip-card-data",
        action="store_true",
        help="Skip rebuilding lightweight data/cards date shards.",
    )
    parser.add_argument(
        "--continue-on-error",
        action="store_true",
        help="Continue after a required step fails; final exit remains nonzero.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the planned commands without running them.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Remove a stale lock file and start anyway.",
    )
    return parser.parse_args()


def iso_now() -> str:
    return datetime.now(EASTERN).isoformat(timespec="seconds")


def require_script(name: str, required: bool = True) -> Optional[Path]:
    path = SCRIPTS / name
    if path.exists():
        return path
    if required:
        raise FileNotFoundError(f"Required script is missing: {path}")
    return None


def command_for(script_name: str, *args: str) -> list[str]:
    return [sys.executable, "-u", str(require_script(script_name)), *args]


def acquire_lock(force: bool) -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    if LOCK_FILE.exists():
        if not force:
            details = LOCK_FILE.read_text(encoding="utf-8", errors="replace").strip()
            raise SystemExit(
                "Another scheduled refresh may be running. "
                f"Lock: {LOCK_FILE}\n{details}\n"
                "Use --force only after confirming no updater is active."
            )
        LOCK_FILE.unlink()
    LOCK_FILE.write_text(
        json.dumps({"pid": os.getpid(), "started_at": iso_now()}, indent=2) + "\n",
        encoding="utf-8",
    )


def release_lock() -> None:
    try:
        LOCK_FILE.unlink()
    except FileNotFoundError:
        pass


def run_step(
    name: str,
    command: Sequence[str],
    required: bool,
    dry_run: bool,
) -> StepResult:
    cmd = list(command)
    result = StepResult(
        name=name,
        command=cmd,
        required=required,
        status="planned" if dry_run else "running",
        started_at=iso_now(),
    )
    print("\n" + "=" * 72)
    print(name)
    print("$ " + " ".join(cmd))
    print("=" * 72)
    if dry_run:
        result.finished_at = iso_now()
        result.duration_seconds = 0.0
        return result

    started = time.monotonic()
    completed = subprocess.run(cmd, cwd=ROOT, check=False)
    result.finished_at = iso_now()
    result.duration_seconds = round(time.monotonic() - started, 2)
    result.return_code = completed.returncode
    result.status = "passed" if completed.returncode == 0 else "failed"
    if completed.returncode != 0:
        result.message = f"Exited with code {completed.returncode}"
    return result


def build_plan(args: argparse.Namespace) -> list[tuple[str, list[str], bool]]:
    first_date = date.fromisoformat(args.date)
    season = args.season or first_date.year
    plan: list[tuple[str, list[str], bool]] = []

    if (SCRIPTS / "assemble_mlb_games.py").exists():
        plan.append((
            "Assemble local MLB working data",
            command_for("assemble_mlb_games.py"),
            True,
        ))

    if args.sync_season:
        plan.append((
            "Sync full MLB schedule",
            command_for("sync_mlb_schedule.py", "--season", str(season)),
            True,
        ))

    for offset in range(args.days_ahead + 1):
        target = (first_date + timedelta(days=offset)).isoformat()
        label = "today" if offset == 0 else f"+{offset} day"
        plan.append((
            f"Refresh MLB games ({label}: {target})",
            command_for("update_games.py", target),
            True,
        ))

    if args.trade_deadline and (SCRIPTS / "update_data.py").exists():
        plan.append((
            "Refresh trade-deadline feed",
            command_for("update_data.py"),
            False,
        ))

    if not args.skip_globe and (SCRIPTS / "build_globe_data.py").exists():
        plan.append((
            "Rebuild globe venue data",
            command_for("build_globe_data.py"),
            False,
        ))

    if (SCRIPTS / "build_public_mlb_data.py").exists():
        plan.append((
            "Build public MLB date files",
            command_for("build_public_mlb_data.py"),
            True,
        ))

    refreshed_dates = [
        (first_date + timedelta(days=offset)).isoformat()
        for offset in range(args.days_ahead + 1)
    ]

    if not args.skip_results and (SCRIPTS / "sync_baseball_final_scores.py").exists():
        for target in refreshed_dates:
            plan.append((
                f"Sync official MLB status and score ({target})",
                command_for(
                    "sync_baseball_final_scores.py",
                    "--season",
                    str(season),
                    "--date",
                    target,
                ),
                True,
            ))

    if not args.skip_minors and (SCRIPTS / "build_minor_league_schedules.py").exists():
        for target in refreshed_dates:
            plan.append((
                f"Refresh affiliated Minor League cards ({target})",
                command_for(
                    "build_minor_league_schedules.py",
                    "--season",
                    str(season),
                    "--date",
                    target,
                    "--daily-only",
                ),
                False,
            ))

    if not args.skip_card_data and (SCRIPTS / "build_todays_card_data.py").exists():
        card_command = [
            sys.executable,
            "-u",
            str(require_script("build_todays_card_data.py")),
        ]
        for target in refreshed_dates:
            card_command.extend(["--date", target])
        plan.append((
            "Build lightweight Today’s Card date feeds",
            card_command,
            True,
        ))

    if not args.skip_verification:
        if (SCRIPTS / "check_sprint_a.py").exists():
            plan.append((
                "Run core health checks",
                command_for("check_sprint_a.py"),
                True,
            ))
        if (SCRIPTS / "check_mlb_schedule_coverage.py").exists():
            plan.append((
                "Report MLB schedule coverage",
                command_for("check_mlb_schedule_coverage.py"),
                False,
            ))

    return plan


def save_status(args: argparse.Namespace, results: list[StepResult], exit_code: int) -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    payload = {
        "schema_version": "1.0",
        "refresh_started_for_date": args.date,
        "days_ahead": args.days_ahead,
        "finished_at": iso_now(),
        "success": exit_code == 0,
        "exit_code": exit_code,
        "steps": [asdict(item) for item in results],
    }
    STATUS_FILE.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    args = parse_args()
    try:
        date.fromisoformat(args.date)
    except ValueError as error:
        raise SystemExit(f"Invalid --date: {args.date}. Use YYYY-MM-DD.") from error
    if args.days_ahead < 0 or args.days_ahead > 14:
        raise SystemExit("--days-ahead must be between 0 and 14.")

    plan = build_plan(args)
    print("Boring Bets scheduled refresh")
    print(f"Operations date: {args.date} (America/New_York)")
    print(f"Dates refreshed: {args.days_ahead + 1}")
    print(f"Steps planned: {len(plan)}")

    if args.dry_run:
        results = [run_step(name, cmd, required, True) for name, cmd, required in plan]
        save_status(args, results, 0)
        return 0

    acquire_lock(args.force)
    results: list[StepResult] = []
    failed_required = False
    try:
        for name, command, required in plan:
            result = run_step(name, command, required, False)
            results.append(result)
            if result.status == "failed" and required:
                failed_required = True
                if not args.continue_on_error:
                    print(f"\nStopping after required step failed: {name}")
                    break
            elif result.status == "failed":
                print(f"\nOptional step failed; continuing: {name}")
    finally:
        exit_code = 1 if failed_required else 0
        save_status(args, results, exit_code)
        release_lock()

    print("\n" + "=" * 72)
    print("SCHEDULED REFRESH COMPLETE" if not failed_required else "SCHEDULED REFRESH FAILED")
    print(f"Status report: {STATUS_FILE}")
    print("=" * 72)
    return 1 if failed_required else 0


if __name__ == "__main__":
    raise SystemExit(main())
