#!/usr/bin/env python3
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
DRAFT_FILE = ROOT / "data/publish-article.json"
ARTICLES_FILE = ROOT / "data/articles.json"

REQUIRED_FIELDS = {
    "id", "game_id", "date", "sport", "title", "author", "body"
}


def load_json(path: Path, default: dict[str, Any]) -> dict[str, Any]:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as error:
        raise SystemExit(f"Could not read {path}: {error}")


def validate_article(article: dict[str, Any]) -> None:
    missing = sorted(
        field for field in REQUIRED_FIELDS
        if article.get(field) in {None, ""}
    )
    if missing:
        raise SystemExit("Missing required field(s): " + ", ".join(missing))


def normalize_article(article: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(article)
    normalized.setdefault("status", "published")
    normalized.setdefault("published_at", datetime.now(timezone.utc).isoformat())
    normalized["updated_at"] = datetime.now(timezone.utc).isoformat()
    normalized.setdefault("summary", "")
    normalized.setdefault("tags", [])
    if not isinstance(normalized.get("tags"), list):
        normalized["tags"] = []
    return normalized


def upsert_article(
    articles: list[dict[str, Any]],
    incoming: dict[str, Any],
) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    found = False

    for article in articles:
        if article.get("id") == incoming["id"]:
            merged = dict(article)
            merged.update(incoming)
            output.append(normalize_article(merged))
            found = True
        else:
            output.append(article)

    if not found:
        output.append(incoming)

    output.sort(
        key=lambda article: (
            article.get("date") or "",
            article.get("game_id") or "",
            article.get("published_at") or "",
            article.get("id") or "",
        )
    )
    return output


def main() -> None:
    draft_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DRAFT_FILE
    draft = load_json(draft_path, {})
    article = draft.get("article", draft)

    if not isinstance(article, dict):
        raise SystemExit("Draft must contain one article object.")

    validate_article(article)
    normalized = normalize_article(article)

    archive = load_json(
        ARTICLES_FILE,
        {
            "schema_version": "1.0",
            "updated_at": None,
            "articles": [],
        },
    )

    articles = archive.get("articles", [])
    if not isinstance(articles, list):
        articles = []

    archive["schema_version"] = "1.0"
    archive["updated_at"] = datetime.now(timezone.utc).isoformat()
    archive["articles"] = upsert_article(articles, normalized)

    ARTICLES_FILE.write_text(
        json.dumps(archive, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    print(f"Published article: {normalized['title']}")
    print(f"Game: {normalized['game_id']}")
    print("Updated data/articles.json")


if __name__ == "__main__":
    main()
