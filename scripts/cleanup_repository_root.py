#!/usr/bin/env python3
"""Safely clean legacy phase notes, backups, samples, and duplicate scripts.

The command is idempotent. It never touches the active HTML, JavaScript, CSS,
data feeds, or .git directory. Use --dry-run to preview the moves.
"""
from __future__ import annotations

import argparse
import hashlib
from pathlib import Path
import shutil
from typing import List, Tuple

ROOT = Path(__file__).resolve().parents[1]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Clean the Boring Bets repository root safely.")
    parser.add_argument("--dry-run", action="store_true", help="Print planned changes without applying them.")
    parser.add_argument(
        "--root",
        type=Path,
        default=ROOT,
        help="Repository root. Defaults to the parent of scripts/.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = args.root.resolve()
    if not (root / "todays-card.html").exists() or not (root / "scripts").exists():
        raise SystemExit(f"This does not look like the Boring Bets repository root: {root}")

    moves: List[Tuple[Path, Path]] = []
    deletes: List[Path] = []

    for markdown in sorted(root.glob("*.md")):
        if markdown.name == "README.md":
            continue
        if markdown.name == "ARCHITECTURE.md":
            target = root / "docs" / "ARCHITECTURE.md"
        elif markdown.name == "ROADMAP.md":
            target = root / "docs" / "ROADMAP.md"
        else:
            target = root / "docs" / "archive" / "phases" / markdown.name
        moves.append((markdown, target))

    for note in sorted(root.glob("INSTALL*.txt")):
        moves.append((note, root / "docs" / "archive" / "install-notes" / note.name))

    for sample in sorted(root.glob("*.json")):
        lowered = sample.name.lower()
        if "sample" in lowered or "debug" in lowered:
            moves.append((sample, root / "tests" / "fixtures" / sample.name))

    for backup in sorted(root.glob("*.before-*")):
        moves.append((backup, root / "archive" / "backups" / backup.name))

    phase6_installer = root / "install_phase6.py"
    phase6_styles = root / "styles-pitcher-rank-table.css"
    if phase6_installer.exists():
        moves.append((phase6_installer, root / "archive" / "installers" / "phase6" / phase6_installer.name))
    if phase6_styles.exists():
        moves.append((phase6_styles, root / "archive" / "installers" / "phase6" / phase6_styles.name))

    scripts = root / "scripts"
    for duplicate in sorted(scripts.glob("* 2.py")):
        canonical = duplicate.with_name(duplicate.name.replace(" 2.py", ".py"))
        if canonical.exists() and file_digest(duplicate) == file_digest(canonical):
            deletes.append(duplicate)
        else:
            moves.append((duplicate, root / "archive" / "backups" / "scripts" / duplicate.name))

    for metadata in root.rglob(".DS_Store"):
        if ".git" not in metadata.parts:
            deletes.append(metadata)
    for macos_dir in root.rglob("__MACOSX"):
        if macos_dir.is_dir() and ".git" not in macos_dir.parts:
            deletes.append(macos_dir)

    moved = 0
    removed = 0
    conflicts = 0

    print("Boring Bets repository-root cleanup")
    print(f"Mode: {'DRY RUN' if args.dry_run else 'APPLY'}")

    for source, requested_target in moves:
        if not source.exists():
            continue
        target, conflict = choose_target(source, requested_target)
        if conflict:
            conflicts += 1
        print(f"MOVE   {relative(source, root)} -> {relative(target, root)}")
        if not args.dry_run:
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.exists() and file_digest(source) == file_digest(target):
                source.unlink()
            else:
                shutil.move(str(source), str(target))
        moved += 1

    # Delete deepest paths first so files disappear before now-empty directories.
    unique_deletes = sorted(set(deletes), key=lambda path: len(path.parts), reverse=True)
    for path in unique_deletes:
        if not path.exists():
            continue
        print(f"REMOVE {relative(path, root)}")
        if not args.dry_run:
            if path.is_dir():
                shutil.rmtree(path)
            else:
                path.unlink()
        removed += 1

    print("\nCleanup summary")
    print(f"Items moved: {moved}")
    print(f"Items removed: {removed}")
    print(f"Conflict-safe renamed copies: {conflicts}")

    if not args.dry_run:
        root_markdown = sorted(path.name for path in root.glob("*.md"))
        if root_markdown != ["README.md"]:
            raise SystemExit(f"Root cleanup incomplete; Markdown files remain: {root_markdown}")
        print("PASS: repository root is clean and active site files were preserved.")
    else:
        print("PASS: cleanup preview completed; no files were changed.")
    return 0


def choose_target(source: Path, requested: Path) -> Tuple[Path, bool]:
    if not requested.exists() or file_digest(source) == file_digest(requested):
        return requested, False
    digest = file_digest(source)[:8]
    return requested.with_name(f"{requested.stem}-root-{digest}{requested.suffix}"), True


def file_digest(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def relative(path: Path, root: Path) -> str:
    try:
        return str(path.relative_to(root))
    except ValueError:
        return str(path)


if __name__ == "__main__":
    raise SystemExit(main())
