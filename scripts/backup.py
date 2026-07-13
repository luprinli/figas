#!/usr/bin/env python3
"""FIGAS project backup script.
Creates compressed zip archives with timestamped names, excludes heavy
dependency/build directories, and ensures the backup destination is in
.gitignore.
"""

import os
import sys
import zipfile
import datetime
from pathlib import Path
from typing import Set

PROJECT_ROOT = Path(__file__).resolve().parent.parent
BACKUP_DIR = PROJECT_ROOT / "backups"

EXCLUDE_DIRS: Set[str] = {
    "node_modules",
    ".venv",
    "venv",
    "build",
    "generated",
    "test-results",
    "playwright-report",
    ".cache",
    ".netlify",
    "__pycache__",
    ".git",
    ".pnp",
    "backups",
    "supabase",
}

EXCLUDE_FILES: Set[str] = {
    ".DS_Store",
    ".env",
    ".pnp.js",
}

SEPARATOR = "=" * 56


def _ensure_dir() -> None:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)


def _add_to_gitignore() -> bool:
    gitignore = PROJECT_ROOT / ".gitignore"
    entry = "backups/"

    try:
        lines = gitignore.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError:
        print(f"WARNING: .gitignore not found at {gitignore}")
        return False

    for line in lines:
        if line.strip() == entry:
            return False

    try:
        content = gitignore.read_text(encoding="utf-8")
        needs_newline = content and not content.endswith("\n")
        with open(gitignore, "a", encoding="utf-8") as f:
            if needs_newline:
                f.write("\n")
            f.write(f"{entry}\n")
        print(f"[OK] Added 'backups/' to .gitignore")
        return True
    except OSError as e:
        print(f"[FAIL] Could not update .gitignore: {e}")
        return False


def _create_archive() -> Path:
    _ensure_dir()

    timestamp = datetime.datetime.now().strftime("%Y-%m-%d_%H%M%S")
    archive_name = f"figas_backup_{timestamp}"
    archive_path = BACKUP_DIR / f"{archive_name}.zip"

    print(f"Source  : {PROJECT_ROOT}")
    print(f"Target  : {archive_path}")
    sys.stdout.flush()

    file_count = 0
    total_bytes = 0

    with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(PROJECT_ROOT, topdown=True):
            dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]

            rel_root = os.path.relpath(root, PROJECT_ROOT)

            for filename in files:
                if filename in EXCLUDE_FILES:
                    continue

                filepath = os.path.join(root, filename)

                if rel_root == ".":
                    arcname = filename
                else:
                    arcname = os.path.join(rel_root, filename)

                try:
                    zf.write(filepath, arcname)
                    file_count += 1
                    total_bytes += os.path.getsize(filepath)
                except OSError as e:
                    print(f"  SKIP  {arcname}: {e}")

    archive_size_kb = total_bytes / 1024

    print(f"\n  Files  : {file_count:,}")
    print(f"  Size   : {archive_size_kb:,.1f} KB")
    print(f"[OK]  Backup created successfully")

    return archive_path


def main() -> int:
    print(SEPARATOR)
    print("FIGAS Project Backup")
    print(SEPARATOR)

    _add_to_gitignore()

    try:
        _create_archive()
        print(SEPARATOR)
        return 0
    except Exception as exc:
        print(f"[FAIL] {exc}")
        print(SEPARATOR)
        return 1


if __name__ == "__main__":
    sys.exit(main())
