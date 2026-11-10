"""Where Hisaab keeps its files."""

from __future__ import annotations

import os
from pathlib import Path

from platformdirs import user_data_dir

APP_NAME = "hisaab"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8765

PACKAGE_DIR = Path(__file__).resolve().parent
STATIC_DIR = PACKAGE_DIR / "static"


def data_dir(override: str | os.PathLike[str] | None = None) -> Path:
    """The folder that holds the database and backups.

    Order: explicit override, then the HISAAB_DATA_DIR environment variable,
    then the operating system's user data folder (e.g. ~/.local/share/hisaab).
    """
    raw = override or os.environ.get("HISAAB_DATA_DIR") or user_data_dir(APP_NAME, appauthor=False)
    path = Path(raw).expanduser().resolve()
    path.mkdir(parents=True, exist_ok=True)
    return path


def database_path(folder: Path, demo: bool = False) -> Path:
    """Real data and demo data live in separate files, so demo mode never touches your data."""
    return folder / ("demo.db" if demo else "hisaab.db")
