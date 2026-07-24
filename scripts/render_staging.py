#!/usr/bin/env python3
"""Protected Boring Bets staging server for Render.

Serves the existing static site, supervises the MLB live refresh process,
and stores generated live data on Render's persistent disk.
"""

from __future__ import annotations

import base64
import hmac
import os
import shutil
import subprocess
import sys
import threading
import time
from datetime import datetime, timedelta
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
EASTERN = ZoneInfo("America/New_York")

PERSISTENT_ROOT = Path(
    os.environ.get(
        "BORING_BETS_DATA_ROOT",
        str(ROOT / ".runtime-data"),
    )
)

LIVE_DIRECTORY = ROOT / "data" / "live-games"
PERSISTENT_LIVE_DIRECTORY = PERSISTENT_ROOT / "live-games"

STAGING_USERNAME = os.environ.get("STAGING_USERNAME", "").strip()
STAGING_PASSWORD = os.environ.get("STAGING_PASSWORD", "")


def prepare_persistent_live_directory() -> None:
    """Point data/live-games at persistent Render storage."""

    PERSISTENT_LIVE_DIRECTORY.mkdir(parents=True, exist_ok=True)
    LIVE_DIRECTORY.parent.mkdir(parents=True, exist_ok=True)

    if LIVE_DIRECTORY.is_symlink():
        try:
            if (
                LIVE_DIRECTORY.resolve()
                == PERSISTENT_LIVE_DIRECTORY.resolve()
            ):
                return
        except OSError:
            pass

        LIVE_DIRECTORY.unlink()

    elif LIVE_DIRECTORY.exists():
        if LIVE_DIRECTORY.is_dir():
            shutil.copytree(
                LIVE_DIRECTORY,
                PERSISTENT_LIVE_DIRECTORY,
                dirs_exist_ok=True,
            )
            shutil.rmtree(LIVE_DIRECTORY)
        else:
            LIVE_DIRECTORY.unlink()

    LIVE_DIRECTORY.symlink_to(
        PERSISTENT_LIVE_DIRECTORY,
        target_is_directory=True,
    )

    print(
        "Persistent live-data link:",
        LIVE_DIRECTORY,
        "->",
        PERSISTENT_LIVE_DIRECTORY,
        flush=True,
    )


class LiveRefreshSupervisor(threading.Thread):
    """Keep the MLB live updater running for the current Eastern date."""

    def __init__(self) -> None:
        super().__init__(daemon=True)
        self.stop_event = threading.Event()
        self.process: subprocess.Popen[str] | None = None
        self.running_date: str | None = None

    def current_eastern_date(self) -> str:
        return datetime.now(EASTERN).date().isoformat()

    def start_refresh_process(self, target_date: str) -> None:
        command = [
            sys.executable,
            "-u",
            str(ROOT / "scripts" / "live_mlb_refresh.py"),
            "--date",
            target_date,
            "--interval",
            "2",
            "--pregame-interval",
            "10",
            "--settled-interval",
            "60",
        ]

        environment = os.environ.copy()
        environment["PYTHONUNBUFFERED"] = "1"

        print(
            "Starting MLB live refresh:",
            " ".join(command),
            flush=True,
        )

        self.process = subprocess.Popen(
            command,
            cwd=ROOT,
            env=environment,
            text=True,
        )
        self.running_date = target_date

    def stop_refresh_process(self) -> None:
        process = self.process
        self.process = None
        self.running_date = None

        if process is None or process.poll() is not None:
            return

        print("Stopping MLB live refresh.", flush=True)
        process.terminate()

        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)

    def run(self) -> None:
        while not self.stop_event.is_set():
            target_date = self.current_eastern_date()

            process_missing = self.process is None
            process_stopped = (
                self.process is not None
                and self.process.poll() is not None
            )
            date_changed = self.running_date != target_date

            if process_missing or process_stopped or date_changed:
                self.stop_refresh_process()

                try:
                    self.start_refresh_process(target_date)
                except Exception as error:
                    print(
                        f"Unable to start MLB live refresh: {error}",
                        flush=True,
                    )

            self.stop_event.wait(5)

        self.stop_refresh_process()

    def stop(self) -> None:
        self.stop_event.set()
        self.stop_refresh_process()


class NightlyOffenseSupervisor(threading.Thread):
    """Refresh MLB offense at startup and every day at 2:00 a.m. Eastern."""

    def __init__(self) -> None:
        super().__init__(daemon=True)
        self.stop_event = threading.Event()

    def run_refresh(self) -> None:
        command = [
            sys.executable,
            "-u",
            str(ROOT / "scripts" / "refresh_future_mlb_offense.py"),
        ]

        environment = os.environ.copy()
        environment["PYTHONUNBUFFERED"] = "1"

        print(
            "Starting current/future MLB offense refresh.",
            flush=True,
        )

        completed = subprocess.run(
            command,
            cwd=ROOT,
            env=environment,
            check=False,
        )

        print(
            "MLB offense refresh exited with code "
            f"{completed.returncode}.",
            flush=True,
        )

    def seconds_until_next_run(self) -> float:
        now = datetime.now(EASTERN)
        next_run = now.replace(
            hour=2,
            minute=0,
            second=0,
            microsecond=0,
        )

        if next_run <= now:
            next_run += timedelta(days=1)

        return max(
            1.0,
            (next_run - now).total_seconds(),
        )

    def run(self) -> None:
        # Every deploy starts from committed static JSON, so refresh once on
        # startup as well as on the nightly schedule.
        self.run_refresh()

        while not self.stop_event.is_set():
            delay = self.seconds_until_next_run()

            print(
                "Next MLB offense refresh in "
                f"{round(delay / 3600, 2)} hours.",
                flush=True,
            )

            if self.stop_event.wait(delay):
                break

            self.run_refresh()

    def stop(self) -> None:
        self.stop_event.set()


class StagingRequestHandler(SimpleHTTPRequestHandler):
    """Serve repository files behind browser Basic Authentication."""

    server_version = "BoringBetsStaging/1.0"

    def request_path(self) -> str:
        return urlsplit(self.path).path

    def is_health_check(self) -> bool:
        return self.request_path() == "/healthz"

    def is_authorized(self) -> bool:
        supplied = self.headers.get("Authorization", "")

        expected_token = base64.b64encode(
            f"{STAGING_USERNAME}:{STAGING_PASSWORD}".encode("utf-8")
        ).decode("ascii")

        expected = f"Basic {expected_token}"

        return hmac.compare_digest(supplied, expected)

    def require_authorization(self) -> bool:
        if self.is_authorized():
            return True

        self.send_response(401)
        self.send_header(
            "WWW-Authenticate",
            'Basic realm="Boring Bets Staging", charset="UTF-8"',
        )
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        return False

    def send_health(self, include_body: bool) -> None:
        body = b"ok\n"

        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

        if include_body:
            self.wfile.write(body)

    def do_GET(self) -> None:
        if self.is_health_check():
            self.send_health(include_body=True)
            return

        if not self.require_authorization():
            return

        super().do_GET()

    def do_HEAD(self) -> None:
        if self.is_health_check():
            self.send_health(include_body=False)
            return

        if not self.require_authorization():
            return

        super().do_HEAD()

    def end_headers(self) -> None:
        request_path = self.request_path()

        if (
            request_path.startswith("/data/live-games/")
            or request_path.endswith(".json")
        ):
            self.send_header(
                "Cache-Control",
                "no-store, no-cache, must-revalidate",
            )
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")

        super().end_headers()

    def log_message(self, format_string: str, *args: object) -> None:
        print(
            "%s - %s"
            % (
                self.address_string(),
                format_string % args,
            ),
            flush=True,
        )


class StagingHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main() -> int:
    if not STAGING_USERNAME or not STAGING_PASSWORD:
        raise SystemExit(
            "STAGING_USERNAME and STAGING_PASSWORD must both be configured."
        )

    prepare_persistent_live_directory()

    supervisor = LiveRefreshSupervisor()
    supervisor.start()

    offense_supervisor = NightlyOffenseSupervisor()
    offense_supervisor.start()

    port = int(os.environ.get("PORT", "10000"))

    handler = partial(
        StagingRequestHandler,
        directory=str(ROOT),
    )

    server = StagingHTTPServer(
        ("0.0.0.0", port),
        handler,
    )

    print(
        f"Boring Bets protected staging server listening on port {port}.",
        flush=True,
    )

    try:
        server.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        pass
    finally:
        supervisor.stop()
        supervisor.join(timeout=15)

        offense_supervisor.stop()
        offense_supervisor.join(timeout=15)

        server.server_close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
