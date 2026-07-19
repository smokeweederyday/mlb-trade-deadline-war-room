from __future__ import annotations

from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]

def require(path: str) -> Path:
    item = ROOT / path
    if not item.exists():
        raise SystemExit(f"FAIL: missing {path}")
    return item

def main() -> int:
    html = require("live.html").read_text(encoding="utf-8")
    css = require("live.css").read_text(encoding="utf-8")
    js_path = require("live.js")
    js = js_path.read_text(encoding="utf-8")
    image = require("assets/images/live/retro-plate-hud-default.png")

    checks = {
        "Embedded plate scene trigger": 'id="openPlateHudButton"' in html,
        "Full-screen Plate HUD": 'id="fullPlateHud"' in html and ".full-plate-hud" in css,
        "Approved retro park artwork": image.stat().st_size > 100_000,
        "Escape / close return path": "closeFullPlateHud" in js and 'event.key === "Escape"' in js,
        "Compact embedded mode": ".plate-hud-view .heatmap-toolbar" in css,
    }
    for label, ok in checks.items():
        print(f"{label}: {'OK' if ok else 'FAIL'}")
        if not ok:
            return 1

    node = shutil.which("node")
    if node:
        result = subprocess.run([node, "--check", str(js_path)], capture_output=True, text=True)
        if result.returncode:
            print(result.stderr)
            return result.returncode
        print("JavaScript syntax check: PASS")
    else:
        print("JavaScript syntax check: SKIPPED (Node.js not installed; non-blocking)")

    print("PASS: Plate HUD Expansion structure is internally consistent.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
