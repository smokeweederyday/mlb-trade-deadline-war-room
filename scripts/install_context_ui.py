#!/usr/bin/env python3

from __future__ import annotations

from pathlib import Path
import shutil


ROOT = Path(__file__).resolve().parents[1]

GAME_HTML = ROOT / "game.html"
GAME_JS = ROOT / "game.js"
STYLES_CSS = ROOT / "styles.css"

WIDGET_SOURCE = (
    ROOT
    / "assets"
    / "js"
    / "widgets"
    / "contextWidget.js"
)


HTML_MARKER = '''      <section
        class="game-sequence-navigation
               game-sequence-navigation-bottom"'''

HTML_BLOCK = '''      <section
        id="context"
        class="game-context-panel"
        aria-labelledby="contextHeading"
      >
        <div class="context-section-heading">
          <div>
            <p class="kicker">GAME INTELLIGENCE</p>
            <h2 id="contextHeading">Context</h2>
          </div>

          <p>
            Lineups, starters, bullpen usage,
            weather, and market conditions.
          </p>
        </div>

        <div id="gameContext">
          <div class="context-empty">
            Context is loading…
          </div>
        </div>
      </section>

'''

IMPORT_MARKER = '''import {
  renderMarketWidget
} from "./assets/js/widgets/marketWidget.js";
'''

IMPORT_BLOCK = '''import {
  renderMarketWidget
} from "./assets/js/widgets/marketWidget.js";

import {
  renderContextWidget
} from "./assets/js/widgets/contextWidget.js";
'''

RENDER_MARKER = '''  renderContextCards();
  renderGameLifecycle();
'''

RENDER_BLOCK = '''  renderContextCards();
  renderGameContext();
  renderGameLifecycle();
'''

FUNCTION_MARKER = '''function renderGameLifecycle() {
'''

FUNCTION_BLOCK = '''function renderGameContext() {
  renderContextWidget({
    container:
      document.getElementById(
        "gameContext"
      ),

    context:
      state.game?.context || null
  });
}

function renderGameLifecycle() {
'''

FALLBACK_MARKER = '''    bullpens: {},
    weather: {},
    market: {},
    injuries: [],
'''

FALLBACK_BLOCK = '''    bullpens: {},
    weather: {},
    market: {},
    context: {
      score: null,
      label: "PENDING",
      alerts: [],
      positives: [],
      information: [],
      sources: {}
    },
    injuries: [],
'''

CSS_MARKER = "/* BORING BETS CONTEXT V1 UI */"

CSS_BLOCK = r'''

/* BORING BETS CONTEXT V1 UI */

.game-context-panel {
  margin-top: 14px;
  padding: 18px;
  background:
    linear-gradient(
      145deg,
      rgba(15, 29, 22, 0.96),
      rgba(7, 16, 11, 0.96)
    );
  border: 1px solid var(--border-teal);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.context-section-heading {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 20px;
  margin-bottom: 14px;
}

.context-section-heading h2 {
  margin: 0;
  font-size: clamp(1.35rem, 3vw, 2rem);
}

.context-section-heading > p {
  max-width: 440px;
  margin: 0;
  color: var(--muted);
  text-align: right;
}

.context-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 18px;
  padding: 14px;
  margin-bottom: 12px;
  background: var(--bg-soft);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.context-header h2 {
  margin: 0;
  color: var(--white);
  font-family: var(--font-heading);
}

.context-score {
  display: flex;
  align-items: baseline;
  gap: 4px;
  color: var(--green);
  font-family: var(--font-data);
}

.context-score strong {
  font-size: clamp(2rem, 5vw, 3.2rem);
  line-height: 1;
}

.context-score span {
  color: var(--muted);
  font-size: 0.82rem;
}

.context-columns {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.context-group {
  min-width: 0;
  padding: 12px;
  background: rgba(3, 7, 5, 0.45);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.context-group h3 {
  margin: 0 0 9px;
  color: var(--teal);
  font-family: var(--font-data);
  font-size: 0.68rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.context-list {
  display: grid;
  gap: 7px;
}

.context-item {
  padding: 10px;
  border-radius: 5px;
  border-left: 3px solid var(--muted);
  background: rgba(255, 255, 255, 0.025);
}

.context-item strong {
  display: block;
  margin-bottom: 3px;
  font-size: 0.75rem;
  letter-spacing: 0.035em;
}

.context-item p {
  margin: 0;
  color: var(--text);
  font-size: 0.72rem;
  line-height: 1.4;
}

.context-good {
  border-left-color: var(--green);
  background: rgba(57, 255, 136, 0.07);
}

.context-good strong {
  color: #9dffbd;
}

.context-caution {
  border-left-color: var(--gold);
  background: rgba(255, 209, 102, 0.07);
}

.context-caution strong {
  color: #f2d77e;
}

.context-warning {
  border-left-color: var(--red);
  background: rgba(255, 97, 117, 0.09);
}

.context-warning strong {
  color: #ff9eaa;
}

.context-info {
  border-left-color: var(--teal);
  background: rgba(24, 216, 216, 0.055);
}

.context-info strong {
  color: var(--teal-soft);
}

.context-group-empty,
.context-empty {
  margin: 0;
  color: var(--muted);
  font-size: 0.75rem;
}

.context-future-sources {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 12px;
}

.context-future-sources span {
  padding: 5px 8px;
  border-radius: 999px;
  font-family: var(--font-data);
  font-size: 0.58rem;
  letter-spacing: 0.06em;
}

.context-source-active {
  color: var(--green);
  background: rgba(57, 255, 136, 0.08);
  border: 1px solid rgba(57, 255, 136, 0.2);
}

.context-source-backlog {
  color: var(--muted);
  background: rgba(130, 144, 135, 0.05);
  border: 1px solid var(--border);
}

@media (max-width: 850px) {
  .context-columns {
    grid-template-columns: 1fr;
  }

  .context-section-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .context-section-heading > p {
    text-align: left;
  }
}

@media (max-width: 620px) {
  .game-context-panel {
    padding: 12px;
  }

  .context-header {
    padding: 11px;
  }

  .context-item {
    padding: 9px;
  }
}
'''


def backup(path: Path) -> None:
    backup_path = path.with_suffix(
        path.suffix + ".before-context"
    )

    if not backup_path.exists():
        shutil.copy2(
            path,
            backup_path,
        )


def replace_once(
    text: str,
    marker: str,
    replacement: str,
    label: str,
) -> str:
    if replacement in text:
        return text

    if marker not in text:
        raise RuntimeError(
            f"Could not find {label} marker."
        )

    return text.replace(
        marker,
        replacement,
        1,
    )


def patch_game_html() -> None:
    text = GAME_HTML.read_text(
        encoding="utf-8"
    )

    if 'id="gameContext"' in text:
        print(
            "game.html already contains Context UI."
        )
        return

    text = replace_once(
        text,
        HTML_MARKER,
        HTML_BLOCK + HTML_MARKER,
        "game.html insertion",
    )

    backup(GAME_HTML)

    GAME_HTML.write_text(
        text,
        encoding="utf-8",
    )

    print("Patched game.html")


def patch_game_js() -> None:
    text = GAME_JS.read_text(
        encoding="utf-8"
    )

    text = replace_once(
        text,
        IMPORT_MARKER,
        IMPORT_BLOCK,
        "context widget import",
    )

    text = replace_once(
        text,
        RENDER_MARKER,
        RENDER_BLOCK,
        "renderAll context call",
    )

    text = replace_once(
        text,
        FUNCTION_MARKER,
        FUNCTION_BLOCK,
        "renderGameContext function",
    )

    if FALLBACK_MARKER in text:
        text = text.replace(
            FALLBACK_MARKER,
            FALLBACK_BLOCK,
            1,
        )

    backup(GAME_JS)

    GAME_JS.write_text(
        text,
        encoding="utf-8",
    )

    print("Patched game.js")


def patch_styles() -> None:
    text = STYLES_CSS.read_text(
        encoding="utf-8"
    )

    if CSS_MARKER in text:
        print(
            "styles.css already contains Context UI."
        )
        return

    backup(STYLES_CSS)

    STYLES_CSS.write_text(
        text.rstrip()
        + "\n"
        + CSS_BLOCK
        + "\n",
        encoding="utf-8",
    )

    print("Patched styles.css")


def main() -> None:
    missing = [
        path.name
        for path in (
            GAME_HTML,
            GAME_JS,
            STYLES_CSS,
        )
        if not path.exists()
    ]

    if missing:
        raise SystemExit(
            "Run this from the Boring Bets project. "
            f"Missing: {', '.join(missing)}"
        )

    if not WIDGET_SOURCE.exists():
        raise SystemExit(
            "contextWidget.js is missing."
        )

    patch_game_html()
    patch_game_js()
    patch_styles()

    print(
        "\nContext V1 is now visible in Game Center."
    )

    print(
        "Backup files end in .before-context."
    )


if __name__ == "__main__":
    main()
