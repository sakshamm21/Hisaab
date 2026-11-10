"""SQLite connection and migrations.

Migrations are numbered .sql files in ./migrations. The number of the last one
applied is stored in SQLite's built-in `PRAGMA user_version`.
"""

from __future__ import annotations

import re
import sqlite3
from pathlib import Path

MIGRATIONS_DIR = Path(__file__).resolve().parent / "migrations"
_MIGRATION_NAME = re.compile(r"^(\d{3})_[a-z0-9_]+\.sql$")


def connect(path: Path | str) -> sqlite3.Connection:
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


def _migrations() -> list[tuple[int, Path]]:
    found = []
    for file in MIGRATIONS_DIR.iterdir():
        match = _MIGRATION_NAME.match(file.name)
        if match:
            found.append((int(match.group(1)), file))
    return sorted(found)


def migrate(conn: sqlite3.Connection) -> int:
    """Apply every migration newer than the database. Returns the resulting version."""
    current = conn.execute("PRAGMA user_version").fetchone()[0]
    for number, file in _migrations():
        if number <= current:
            continue
        sql = file.read_text(encoding="utf-8")
        try:  # one transaction per migration: it applies fully or not at all
            conn.executescript(f"BEGIN;\n{sql}\nPRAGMA user_version = {number};\nCOMMIT;")
        except Exception:
            if conn.in_transaction:
                conn.execute("ROLLBACK")
            raise
        current = number
    return current


def open_database(path: Path | str) -> sqlite3.Connection:
    """Connect, bring the schema up to date and make sure default data exists."""
    from hisaab.db.seed import seed_defaults

    conn = connect(path)
    migrate(conn)
    seed_defaults(conn)
    return conn
