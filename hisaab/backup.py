"""Backups: a daily copy on start-up (keep 14), manual backups, and restore."""

from __future__ import annotations

import sqlite3
from datetime import datetime
from pathlib import Path

KEEP = 14
REQUIRED_TABLES = {"accounts", "transactions", "categories", "settings"}


def backups_dir(db_path: Path) -> Path:
    folder = db_path.parent / "backups"
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def create_backup(db_path: Path, label: str = "manual") -> Path:
    stamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    target = backups_dir(db_path) / f"hisaab-{stamp}-{label}.db"
    src = sqlite3.connect(db_path)
    dst = sqlite3.connect(target)
    try:
        src.backup(dst)  # consistent copy even while the app is running
    finally:
        dst.close()
        src.close()
    return target


def daily_backup(db_path: Path) -> Path | None:
    """Make today's automatic backup if there isn't one, and prune old automatic ones."""
    if not db_path.exists():
        return None
    folder = backups_dir(db_path)
    today = datetime.now().strftime("%Y-%m-%d")
    autos = sorted(folder.glob("hisaab-*-auto.db"))
    made = None
    if not any(p.name.startswith(f"hisaab-{today}") for p in autos):
        made = create_backup(db_path, "auto")
        autos.append(made)
    for old in sorted(autos)[:-KEEP]:
        old.unlink(missing_ok=True)
    return made


def list_backups(db_path: Path) -> list[dict]:
    return [
        {"name": p.name, "size": p.stat().st_size,
         "created": datetime.fromtimestamp(p.stat().st_mtime).isoformat(timespec="seconds"),
         "kind": "auto" if p.name.endswith("-auto.db") else "manual" if p.name.endswith("-manual.db") else "other"}
        for p in sorted(backups_dir(db_path).glob("hisaab-*.db"), key=lambda p: p.stat().st_mtime, reverse=True)
    ]


def backup_path(db_path: Path, name: str) -> Path:
    path = (backups_dir(db_path) / name).resolve()
    if path.parent != backups_dir(db_path).resolve() or not path.name.startswith("hisaab-") or not path.exists():
        raise FileNotFoundError(name)
    return path


def validate_database(path: Path) -> None:
    try:
        conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
        ok = conn.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        conn.close()
    except sqlite3.DatabaseError as exc:
        raise ValueError("That file isn't a Hisaab backup.") from exc
    if not tables >= REQUIRED_TABLES or not ok:
        raise ValueError("That file isn't a valid Hisaab backup.")


def restore(db_path: Path, data: bytes) -> Path:
    """Replace the database with an uploaded backup. The current data is backed up first."""
    incoming = backups_dir(db_path) / f"incoming-{datetime.now():%Y%m%d%H%M%S}.db"
    incoming.write_bytes(data)
    try:
        validate_database(incoming)
        safety = create_backup(db_path, "before-restore")
        src = sqlite3.connect(incoming)
        dst = sqlite3.connect(db_path)
        try:
            src.backup(dst)
        finally:
            dst.close()
            src.close()
    finally:
        incoming.unlink(missing_ok=True)
    return safety
