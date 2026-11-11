"""AI provider settings and the API key.

Settings (provider, model, base URL) live in the database's settings table.
The key does NOT: it lives in a separate secrets file in your user config folder,
readable only by you, so backups and exports never contain it. The
OPENROUTER_API_KEY environment variable, if set, wins.
"""

from __future__ import annotations

import json
import os
import sqlite3
from dataclasses import dataclass
from pathlib import Path

from platformdirs import user_config_dir

OPENROUTER_URL = "https://openrouter.ai/api/v1"
OLLAMA_URL = "http://127.0.0.1:11434"

PROVIDERS = ("openrouter", "ollama", "custom")


def secrets_path() -> Path:
    folder = Path(os.environ.get("HISAAB_CONFIG_DIR") or user_config_dir("hisaab", appauthor=False))
    folder.mkdir(parents=True, exist_ok=True)
    return folder / "secrets.json"


def _read_secrets() -> dict:
    try:
        return json.loads(secrets_path().read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def get_key(provider: str) -> str:
    if provider == "openrouter" and os.environ.get("OPENROUTER_API_KEY"):
        return os.environ["OPENROUTER_API_KEY"]
    return _read_secrets().get(f"{provider}_key", "")


def set_key(provider: str, key: str | None) -> None:
    data = _read_secrets()
    if key:
        data[f"{provider}_key"] = key.strip()
    else:
        data.pop(f"{provider}_key", None)
    path = secrets_path()
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data))
    os.chmod(tmp, 0o600)
    tmp.replace(path)


def mask(key: str) -> str:
    return f"{key[:6]}…{key[-4:]}" if len(key) > 12 else ("set" if key else "")


@dataclass
class AiConfig:
    provider: str
    model: str
    base_url: str
    key: str
    fallbacks: list[str]

    @property
    def ready(self) -> bool:
        if not self.model:
            return False
        return bool(self.key) if self.provider == "openrouter" else bool(self.base_url)

    @property
    def chat_url(self) -> str:
        base = self.base_url.rstrip("/")
        if self.provider == "ollama" and not base.endswith("/v1"):
            base += "/v1"
        return f"{base}/chat/completions"


def load(db: sqlite3.Connection) -> AiConfig:
    s = {r[0]: r[1] for r in db.execute("SELECT key, value FROM settings WHERE key LIKE 'ai_%'")}
    provider = s.get("ai_provider", "openrouter")
    from hisaab.ai.models import DEFAULT_CHAT_MODEL, DEFAULT_FALLBACKS

    model = s.get("ai_model") or (DEFAULT_CHAT_MODEL if provider == "openrouter" else "")
    base = {"openrouter": OPENROUTER_URL, "ollama": s.get("ai_base_url") or OLLAMA_URL}.get(
        provider, s.get("ai_base_url", ""))
    fallbacks = json.loads(s.get("ai_fallbacks", "null") or "null")
    if fallbacks is None:
        fallbacks = DEFAULT_FALLBACKS if provider == "openrouter" and model == DEFAULT_CHAT_MODEL else []
    return AiConfig(provider, model, base, get_key(provider), fallbacks)


def save(db: sqlite3.Connection, **values: str) -> None:
    with db:
        for k, v in values.items():
            db.execute("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
                       (f"ai_{k}", v))
