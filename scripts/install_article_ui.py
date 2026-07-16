#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
GAME_HTML = ROOT / "game.html"
GAME_JS = ROOT / "game.js"
STYLES = ROOT / "styles.css"

HTML_MARKER = '      <section\n        class="game-lifecycle-panel"'
HTML_BLOCK = '      <section\n        class="game-articles-panel"\n        aria-labelledby="gameArticlesHeading"\n      >\n        <div class="game-articles-heading">\n          <div>\n            <p class="kicker">GAME WRITE-UP</p>\n            <h2 id="gameArticlesHeading">Articles</h2>\n          </div>\n        </div>\n\n        <div id="gameArticles">\n          <p class="module-note">\n            No article published for this game.\n          </p>\n        </div>\n      </section>\n\n'
CSS_MARKER = "/* BORING BETS ARTICLE UI */"
CSS_BLOCK = '\n/* BORING BETS ARTICLE UI */\n\n.game-articles-panel {\n  margin-top: 14px;\n  padding: 18px;\n  background: var(--panel);\n  border: 1px solid var(--border);\n  border-radius: var(--radius-md);\n}\n\n.game-articles-heading {\n  margin-bottom: 12px;\n}\n\n.game-articles-heading h2 {\n  margin: 0;\n  font-size: clamp(1.35rem, 3vw, 2rem);\n}\n\n#gameArticles {\n  display: grid;\n  gap: 12px;\n}\n\n.game-article {\n  padding: 16px;\n  background: var(--bg-soft);\n  border: 1px solid var(--border);\n  border-radius: var(--radius-sm);\n}\n\n.game-article-meta {\n  display: flex;\n  justify-content: space-between;\n  gap: 12px;\n  color: var(--muted);\n  font-family: var(--font-data);\n  font-size: 0.62rem;\n  letter-spacing: 0.06em;\n  text-transform: uppercase;\n}\n\n.game-article h3 {\n  margin: 10px 0;\n  color: var(--white);\n  font-size: clamp(1.05rem, 2.5vw, 1.45rem);\n}\n\n.game-article-summary {\n  color: var(--teal-soft);\n  font-weight: 700;\n}\n\n.game-article-body {\n  color: var(--text);\n  line-height: 1.75;\n}\n\n.game-article-body p {\n  margin: 0 0 1.15em;\n}\n\n.game-article-body p:last-child {\n  margin-bottom: 0;\n}\n'
ARTICLE_FUNCTIONS = '\nfunction renderGameArticles() {\n  const container =\n    document.getElementById(\n      "gameArticles"\n    );\n\n  if (!container) return;\n\n  const gameId =\n    state.game?.id;\n\n  const articles =\n    state.articles.filter(\n      article =>\n        article.game_id === gameId &&\n        article.status !== "draft"\n    );\n\n  if (!articles.length) {\n    container.innerHTML = `\n      <p class="module-note">\n        No article published for this game.\n      </p>\n    `;\n    return;\n  }\n\n  container.innerHTML = articles\n    .map(article => `\n      <article class="game-article">\n        <div class="game-article-meta">\n          <span>\n            ${escapeHtml(\n              article.author || "Boring Bets"\n            )}\n          </span>\n\n          <span>\n            ${escapeHtml(\n              formatArticleTime(\n                article.updated_at ||\n                article.published_at\n              )\n            )}\n          </span>\n        </div>\n\n        <h3>\n          ${escapeHtml(\n            article.title || "Game Analysis"\n          )}\n        </h3>\n\n        ${\n          article.summary\n            ? `\n              <p class="game-article-summary">\n                ${escapeHtml(article.summary)}\n              </p>\n            `\n            : ""\n        }\n\n        <div class="game-article-body">\n          ${formatArticleBody(\n            article.body || ""\n          )}\n        </div>\n      </article>\n    `)\n    .join("");\n}\n\nfunction formatArticleBody(value) {\n  return escapeHtml(value)\n    .split(/\\n\\s*\\n/)\n    .map(paragraph => `\n      <p>\n        ${paragraph.replaceAll("\\n", "<br>")}\n      </p>\n    `)\n    .join("");\n}\n\nfunction formatArticleTime(value) {\n  if (!value) return "Published";\n\n  const date = new Date(value);\n\n  if (Number.isNaN(date.getTime())) {\n    return "Published";\n  }\n\n  return date.toLocaleTimeString(\n    "en-US",\n    {\n      hour: "numeric",\n      minute: "2-digit",\n      timeZoneName: "short"\n    }\n  );\n}\n\n'

def backup(path: Path) -> None:
    backup_path = path.with_suffix(path.suffix + ".before-article-ui")
    if not backup_path.exists():
        shutil.copy2(path, backup_path)

def replace_once(text: str, marker: str, replacement: str, label: str) -> str:
    if replacement in text:
        return text
    if marker not in text:
        raise SystemExit(f"Could not find {label}.")
    return text.replace(marker, replacement, 1)

def patch_html() -> None:
    text = GAME_HTML.read_text(encoding="utf-8")
    if 'id="gameArticles"' in text:
        print("Article section already exists in game.html.")
        return
    backup(GAME_HTML)
    text = replace_once(
        text,
        HTML_MARKER,
        HTML_BLOCK + HTML_MARKER,
        "Official Plays section in game.html",
    )
    GAME_HTML.write_text(text, encoding="utf-8")
    print("Patched game.html")

def patch_js() -> None:
    text = GAME_JS.read_text(encoding="utf-8")
    if "function renderGameArticles()" in text:
        print("Article JavaScript already exists.")
        return

    backup(GAME_JS)

    replacements = [
        (
            '  evaluations: [],\n  timeframe: "last_30",',
            '  evaluations: [],\n  articles: [],\n  timeframe: "last_30",',
            "articles state",
        ),
        (
            '      evaluationsResponse\n    ] = await Promise.all([',
            '      evaluationsResponse,\n      articlesResponse\n    ] = await Promise.all([',
            "Promise response list",
        ),
        (
            '      fetch(\n        `data/evaluations.json?v=${Date.now()}`\n      )\n    ]);',
            '      fetch(\n        `data/evaluations.json?v=${Date.now()}`\n      ),\n      fetch(\n        `data/articles.json?v=${Date.now()}`\n      )\n    ]);',
            "articles fetch",
        ),
        (
            '    const evaluationsData =\n      evaluationsResponse.ok\n        ? await evaluationsResponse.json()\n        : { evaluations: [] };',
            '    const evaluationsData =\n      evaluationsResponse.ok\n        ? await evaluationsResponse.json()\n        : { evaluations: [] };\n\n    const articlesData =\n      articlesResponse.ok\n        ? await articlesResponse.json()\n        : { articles: [] };',
            "articles response parsing",
        ),
        (
            '    state.evaluations =\n      Array.isArray(\n        evaluationsData.evaluations\n      )\n        ? evaluationsData.evaluations\n        : [];\n\n    state.timeframe =',
            '    state.evaluations =\n      Array.isArray(\n        evaluationsData.evaluations\n      )\n        ? evaluationsData.evaluations\n        : [];\n\n    state.articles =\n      Array.isArray(\n        articlesData.articles\n      )\n        ? articlesData.articles\n        : [];\n\n    state.timeframe =',
            "articles state assignment",
        ),
        (
            '  renderGameContext();\n  renderGameLifecycle();',
            '  renderGameContext();\n  renderGameArticles();\n  renderGameLifecycle();',
            "article render call",
        ),
    ]

    for marker, replacement, label in replacements:
        text = replace_once(text, marker, replacement, label)

    marker = "function renderGameLifecycle() {"
    text = replace_once(
        text,
        marker,
        ARTICLE_FUNCTIONS + marker,
        "renderGameLifecycle function",
    )

    GAME_JS.write_text(text, encoding="utf-8")
    print("Patched game.js")

def patch_css() -> None:
    text = STYLES.read_text(encoding="utf-8")
    if CSS_MARKER in text:
        print("Article styles already exist.")
        return
    backup(STYLES)
    STYLES.write_text(
        text.rstrip() + "\n" + CSS_BLOCK + "\n",
        encoding="utf-8",
    )
    print("Patched styles.css")

def main() -> None:
    missing = [
        path.name
        for path in (GAME_HTML, GAME_JS, STYLES)
        if not path.exists()
    ]
    if missing:
        raise SystemExit(
            "Run this from the Boring Bets project. Missing: "
            + ", ".join(missing)
        )

    patch_html()
    patch_js()
    patch_css()
    print("\nArticle UI installed. Hard-refresh the game page.")

if __name__ == "__main__":
    main()
