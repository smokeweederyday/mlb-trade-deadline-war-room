#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
GAME_HTML = ROOT / "game.html"
GAME_JS = ROOT / "game.js"
STYLES = ROOT / "styles.css"

ARTICLE_SECTION = '''      <section
        class="game-articles-panel"
        aria-labelledby="gameArticlesHeading"
      >
        <div class="game-articles-heading">
          <div>
            <p class="kicker">GAME WRITE-UP</p>
            <h2 id="gameArticlesHeading">Articles</h2>
          </div>
        </div>

        <div id="gameArticles">
          <p class="module-note">
            No article published for this game.
          </p>
        </div>
      </section>

'''

CSS_MARKER = "/* BORING BETS ARTICLE UI */"
CSS_BLOCK = '''
/* BORING BETS ARTICLE UI */
.game-articles-panel{margin-top:14px;padding:18px;background:var(--panel);border:1px solid var(--border);border-radius:var(--radius-md)}
.game-articles-heading{margin-bottom:12px}.game-articles-heading h2{margin:0;font-size:clamp(1.35rem,3vw,2rem)}
#gameArticles{display:grid;gap:12px}.game-article{padding:16px;background:var(--bg-soft);border:1px solid var(--border);border-radius:var(--radius-sm)}
.game-article-meta{display:flex;justify-content:space-between;gap:12px;color:var(--muted);font-family:var(--font-data);font-size:.62rem;letter-spacing:.06em;text-transform:uppercase}
.game-article h3{margin:10px 0;color:var(--white);font-size:clamp(1.05rem,2.5vw,1.45rem)}
.game-article-summary{color:var(--teal-soft);font-weight:700}.game-article-body{color:var(--text);line-height:1.75}.game-article-body p{margin:0 0 1.15em}.game-article-body p:last-child{margin-bottom:0}
'''

ARTICLE_FUNCTIONS = r'''
function renderGameArticles() {
  const container = document.getElementById("gameArticles");
  if (!container) return;

  const articles = state.articles.filter(
    article =>
      article.game_id === state.game?.id &&
      article.status !== "draft"
  );

  if (!articles.length) {
    container.innerHTML = `<p class="module-note">No article published for this game.</p>`;
    return;
  }

  container.innerHTML = articles.map(article => `
    <article class="game-article">
      <div class="game-article-meta">
        <span>${escapeHtml(article.author || "Boring Bets")}</span>
        <span>${escapeHtml(formatArticleTime(article.updated_at || article.published_at))}</span>
      </div>
      <h3>${escapeHtml(article.title || "Game Analysis")}</h3>
      ${article.summary ? `<p class="game-article-summary">${escapeHtml(article.summary)}</p>` : ""}
      <div class="game-article-body">${formatArticleBody(article.body || "")}</div>
    </article>
  `).join("");
}

function formatArticleBody(value) {
  return escapeHtml(value)
    .split(/\n\s*\n/)
    .map(paragraph => `<p>${paragraph.replaceAll("\n", "<br>")}</p>`)
    .join("");
}

function formatArticleTime(value) {
  if (!value) return "Published";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Published";
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  });
}

'''

def backup(path: Path) -> None:
    backup_path = path.with_suffix(path.suffix + ".before-article-ui")
    if not backup_path.exists():
        shutil.copy2(path, backup_path)

def patch_html() -> None:
    text = GAME_HTML.read_text(encoding="utf-8")
    if 'id="gameArticles"' in text:
        print("Article section already exists in game.html.")
        return

    marker = 'class="game-lifecycle-panel"'
    index = text.find(marker)
    if index == -1:
        raise SystemExit("Could not find lifecycle panel in game.html.")

    section_start = text.rfind("<section", 0, index)
    if section_start == -1:
        raise SystemExit("Could not find lifecycle section start in game.html.")

    line_start = text.rfind("\n", 0, section_start) + 1
    backup(GAME_HTML)
    text = text[:line_start] + ARTICLE_SECTION + text[line_start:]
    GAME_HTML.write_text(text, encoding="utf-8")
    print("Patched game.html")

def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"Could not find {label} in game.js.")
    return text.replace(old, new, 1)

def patch_js() -> None:
    text = GAME_JS.read_text(encoding="utf-8")
    if "function renderGameArticles()" in text:
        print("Article JavaScript already exists.")
        return

    backup(GAME_JS)
    text = replace_once(text,
        '  evaluations: [],\n  timeframe: "last_30",',
        '  evaluations: [],\n  articles: [],\n  timeframe: "last_30",',
        "articles state")
    text = replace_once(text,
        '      evaluationsResponse\n    ] = await Promise.all([',
        '      evaluationsResponse,\n      articlesResponse\n    ] = await Promise.all([',
        "Promise response list")
    text = replace_once(text,
        '      fetch(\n        `data/evaluations.json?v=${Date.now()}`\n      )\n    ]);',
        '      fetch(\n        `data/evaluations.json?v=${Date.now()}`\n      ),\n      fetch(\n        `data/articles.json?v=${Date.now()}`\n      )\n    ]);',
        "articles fetch")
    text = replace_once(text,
        '    const evaluationsData =\n      evaluationsResponse.ok\n        ? await evaluationsResponse.json()\n        : { evaluations: [] };',
        '    const evaluationsData =\n      evaluationsResponse.ok\n        ? await evaluationsResponse.json()\n        : { evaluations: [] };\n\n    const articlesData =\n      articlesResponse.ok\n        ? await articlesResponse.json()\n        : { articles: [] };',
        "articles parsing")
    text = replace_once(text,
        '    state.evaluations =\n      Array.isArray(\n        evaluationsData.evaluations\n      )\n        ? evaluationsData.evaluations\n        : [];\n\n    state.timeframe =',
        '    state.evaluations =\n      Array.isArray(\n        evaluationsData.evaluations\n      )\n        ? evaluationsData.evaluations\n        : [];\n\n    state.articles =\n      Array.isArray(\n        articlesData.articles\n      )\n        ? articlesData.articles\n        : [];\n\n    state.timeframe =',
        "articles assignment")
    text = replace_once(text,
        '  renderGameContext();\n  renderGameLifecycle();',
        '  renderGameContext();\n  renderGameArticles();\n  renderGameLifecycle();',
        "render call")

    marker = "function renderGameLifecycle() {"
    if marker not in text:
        raise SystemExit("Could not find renderGameLifecycle in game.js.")
    text = text.replace(marker, ARTICLE_FUNCTIONS + marker, 1)
    GAME_JS.write_text(text, encoding="utf-8")
    print("Patched game.js")

def patch_css() -> None:
    text = STYLES.read_text(encoding="utf-8")
    if CSS_MARKER in text:
        print("Article styles already exist.")
        return
    backup(STYLES)
    STYLES.write_text(text.rstrip() + "\n" + CSS_BLOCK + "\n", encoding="utf-8")
    print("Patched styles.css")

def main() -> None:
    missing = [p.name for p in (GAME_HTML, GAME_JS, STYLES) if not p.exists()]
    if missing:
        raise SystemExit("Run from Boring Bets project. Missing: " + ", ".join(missing))
    patch_html()
    patch_js()
    patch_css()
    print("\nArticle UI installed. Hard-refresh the game page.")

if __name__ == "__main__":
    main()
