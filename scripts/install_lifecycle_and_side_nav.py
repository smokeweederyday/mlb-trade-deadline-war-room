#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
GAME_HTML = ROOT / "game.html"
STYLES_CSS = ROOT / "styles.css"

BOTTOM_NAV_MARKER = '      <section\n        class="game-sequence-navigation\n               game-sequence-navigation-bottom"'

LIFECYCLE_BLOCK = '''      <section
        class="game-lifecycle-panel"
        aria-labelledby="gameLifecycleHeading"
      >
        <div class="game-lifecycle-heading">
          <div>
            <p class="kicker">PUBLISHING LIFECYCLE</p>
            <h2 id="gameLifecycleHeading">Official Plays</h2>
          </div>

          <span
            id="gameLifecycleStatus"
            class="game-lifecycle-status"
          >
            NO OFFICIAL PLAY
          </span>
        </div>

        <div class="game-lifecycle-grid">
          <section class="game-lifecycle-group">
            <h3>Official Plays</h3>
            <div id="gameOfficialPlays">
              <p class="module-note">
                No official plays published.
              </p>
            </div>
          </section>

          <section class="game-lifecycle-group">
            <h3>Results</h3>
            <div id="gameResults">
              <p class="module-note">
                Results pending.
              </p>
            </div>
          </section>

          <section class="game-lifecycle-group">
            <h3>Evaluation</h3>
            <div id="gameEvaluations">
              <p class="module-note">
                Postgame evaluation pending.
              </p>
            </div>
          </section>
        </div>
      </section>

'''

CSS_MARKER = "/* BORING BETS LIFECYCLE + SIDE NAV */"

CSS_BLOCK = r'''
/* BORING BETS LIFECYCLE + SIDE NAV */

.game-lifecycle-panel {
  margin-top: 14px;
  padding: 18px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.game-lifecycle-heading {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 18px;
  margin-bottom: 14px;
}

.game-lifecycle-heading h2 {
  margin: 0;
  font-size: clamp(1.35rem, 3vw, 2rem);
}

.game-lifecycle-status {
  padding: 6px 9px;
  color: var(--teal);
  font-family: var(--font-data);
  font-size: 0.62rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  border: 1px solid var(--border-teal);
  border-radius: 999px;
}

.game-lifecycle-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.game-lifecycle-group {
  min-width: 0;
  padding: 12px;
  background: var(--bg-soft);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.game-lifecycle-group h3 {
  margin: 0 0 10px;
  color: var(--teal);
  font-family: var(--font-data);
  font-size: 0.68rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

#gameOfficialPlays,
#gameResults,
#gameEvaluations {
  display: grid;
  gap: 8px;
}

.lifecycle-item {
  display: grid;
  gap: 4px;
  padding: 10px;
  color: inherit;
  text-decoration: none;
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid var(--border);
  border-radius: 5px;
}

a.lifecycle-item:hover {
  border-color: var(--green-dark);
  background: rgba(57, 255, 136, 0.05);
}

.lifecycle-item strong {
  color: var(--white);
  font-size: 0.78rem;
}

.lifecycle-item span {
  color: var(--text);
  font-size: 0.72rem;
}

.lifecycle-item small {
  color: var(--muted);
  font-size: 0.66rem;
}

@media (min-width: 1180px) {
  #previousGameLink,
  #nextGameLink {
    position: fixed;
    top: 50%;
    z-index: 80;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 128px;
    min-height: 74px;
    padding: 12px;
    color: var(--text);
    text-align: center;
    line-height: 1.25;
    text-decoration: none;
    background: rgba(7, 16, 11, 0.94);
    border: 1px solid var(--border-teal);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-md);
    backdrop-filter: blur(12px);
    transform: translateY(-50%);
  }

  #previousGameLink {
    left: max(14px, calc((100vw - 1100px) / 2 - 150px));
  }

  #nextGameLink {
    right: max(14px, calc((100vw - 1100px) / 2 - 150px));
  }

  #previousGameLink:hover,
  #nextGameLink:hover {
    color: var(--green);
    border-color: var(--green-dark);
    box-shadow: var(--shadow-md), var(--glow-green);
  }

  #previousGameLink.disabled,
  #nextGameLink.disabled {
    opacity: 0.28;
    pointer-events: none;
  }
}

@media (max-width: 850px) {
  .game-lifecycle-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 620px) {
  .game-lifecycle-panel {
    padding: 12px;
  }

  .game-lifecycle-heading {
    align-items: flex-start;
    flex-direction: column;
  }
}
'''

def backup(path: Path) -> None:
    backup_path = path.with_suffix(path.suffix + ".before-lifecycle-nav")
    if not backup_path.exists():
        shutil.copy2(path, backup_path)

def patch_html() -> None:
    text = GAME_HTML.read_text(encoding="utf-8")

    if 'id="gameOfficialPlays"' in text:
        print("Lifecycle UI already exists in game.html.")
        return

    if BOTTOM_NAV_MARKER not in text:
        raise SystemExit(
            "Could not find the bottom game navigation block."
        )

    backup(GAME_HTML)
    text = text.replace(
        BOTTOM_NAV_MARKER,
        LIFECYCLE_BLOCK + BOTTOM_NAV_MARKER,
        1,
    )
    GAME_HTML.write_text(text, encoding="utf-8")
    print("Inserted lifecycle below Context.")

def patch_css() -> None:
    text = STYLES_CSS.read_text(encoding="utf-8")

    if CSS_MARKER in text:
        print("Styles already installed.")
        return

    backup(STYLES_CSS)
    STYLES_CSS.write_text(
        text.rstrip() + "\n" + CSS_BLOCK + "\n",
        encoding="utf-8",
    )
    print("Installed lifecycle and side-navigation styles.")

def main() -> None:
    missing = [
        path.name
        for path in (GAME_HTML, STYLES_CSS)
        if not path.exists()
    ]

    if missing:
        raise SystemExit(
            "Run this from the Boring Bets project. Missing: "
            + ", ".join(missing)
        )

    patch_html()
    patch_css()
    print("\nDone. Hard-refresh the game page.")

if __name__ == "__main__":
    main()
