#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
GAME_HTML = ROOT / "game.html"
STYLES_CSS = ROOT / "styles.css"

HTML_MARKER = '''      <section
        id="context"
        class="game-context-panel"'''

HTML_BLOCK = '''      <section
        class="game-lifecycle-panel"
        aria-labelledby="gameLifecycleHeading"
      >
        <div class="game-lifecycle-heading">
          <div>
            <p class="kicker">PUBLISHING LIFECYCLE</p>
            <h2 id="gameLifecycleHeading">Official Plays</h2>
          </div>
          <span id="gameLifecycleStatus" class="game-lifecycle-status">
            NO OFFICIAL PLAY
          </span>
        </div>

        <div class="game-lifecycle-grid">
          <section class="game-lifecycle-group">
            <h3>Official Plays</h3>
            <div id="gameOfficialPlays">
              <p class="module-note">No official plays published.</p>
            </div>
          </section>

          <section class="game-lifecycle-group">
            <h3>Results</h3>
            <div id="gameResults">
              <p class="module-note">Results pending.</p>
            </div>
          </section>

          <section class="game-lifecycle-group">
            <h3>Evaluation</h3>
            <div id="gameEvaluations">
              <p class="module-note">Postgame evaluation pending.</p>
            </div>
          </section>
        </div>
      </section>

'''

CSS_MARKER = "/* BORING BETS GAME LIFECYCLE UI */"
CSS_BLOCK = r'''

/* BORING BETS GAME LIFECYCLE UI */
.game-lifecycle-panel{margin-top:14px;padding:18px;background:var(--panel);border:1px solid var(--border);border-radius:var(--radius-md)}
.game-lifecycle-heading{display:flex;justify-content:space-between;align-items:end;gap:18px;margin-bottom:14px}
.game-lifecycle-heading h2{margin:0;font-size:clamp(1.35rem,3vw,2rem)}
.game-lifecycle-status{padding:6px 9px;color:var(--teal);font-family:var(--font-data);font-size:.62rem;font-weight:900;letter-spacing:.08em;border:1px solid var(--border-teal);border-radius:999px}
.game-lifecycle-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.game-lifecycle-group{min-width:0;padding:12px;background:var(--bg-soft);border:1px solid var(--border);border-radius:var(--radius-sm)}
.game-lifecycle-group h3{margin:0 0 10px;color:var(--teal);font-family:var(--font-data);font-size:.68rem;letter-spacing:.1em;text-transform:uppercase}
#gameOfficialPlays,#gameResults,#gameEvaluations{display:grid;gap:8px}
.lifecycle-item{display:grid;gap:4px;padding:10px;color:inherit;text-decoration:none;background:rgba(255,255,255,.025);border:1px solid var(--border);border-radius:5px}
a.lifecycle-item:hover{border-color:var(--green-dark);background:rgba(57,255,136,.05)}
.lifecycle-item strong{color:var(--white);font-size:.78rem}
.lifecycle-item span{color:var(--text);font-size:.72rem}
.lifecycle-item small{color:var(--muted);font-size:.66rem}
@media(max-width:850px){.game-lifecycle-grid{grid-template-columns:1fr}}
@media(max-width:620px){.game-lifecycle-panel{padding:12px}.game-lifecycle-heading{align-items:flex-start;flex-direction:column}}
'''

def backup(path: Path) -> None:
    backup_path = path.with_suffix(path.suffix + ".before-lifecycle")
    if not backup_path.exists():
        shutil.copy2(path, backup_path)

def main() -> None:
    if not GAME_HTML.exists() or not STYLES_CSS.exists():
        raise SystemExit("Run this from the Boring Bets project.")

    html = GAME_HTML.read_text(encoding="utf-8")
    if 'id="gameOfficialPlays"' not in html:
        if HTML_MARKER not in html:
            raise SystemExit("Could not find the Context section in game.html.")
        backup(GAME_HTML)
        GAME_HTML.write_text(html.replace(HTML_MARKER, HTML_BLOCK + HTML_MARKER, 1), encoding="utf-8")
        print("Patched game.html")
    else:
        print("game.html already contains lifecycle UI.")

    css = STYLES_CSS.read_text(encoding="utf-8")
    if CSS_MARKER not in css:
        backup(STYLES_CSS)
        STYLES_CSS.write_text(css.rstrip() + "\n" + CSS_BLOCK + "\n", encoding="utf-8")
        print("Patched styles.css")
    else:
        print("styles.css already contains lifecycle UI.")

    print("\nOfficial Plays, Results, and Evaluation are now visible on game.html.")

if __name__ == "__main__":
    main()
