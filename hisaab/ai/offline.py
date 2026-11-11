"""Offline models through Ollama. Nothing is downloaded unless you click Download."""

from __future__ import annotations

import json
from collections.abc import Iterator

import httpx

from hisaab.ai.config import OLLAMA_URL

INSTALL = {
    "linux": "curl -fsSL https://ollama.com/install.sh | sh",
    "mac": "brew install ollama   (or download from ollama.com)",
    "windows": "Download the installer from ollama.com",
}


def status(base_url: str = OLLAMA_URL, transport: httpx.BaseTransport | None = None) -> dict:
    try:
        with httpx.Client(transport=transport, timeout=3) as http:
            version = http.get(f"{base_url}/api/version").json().get("version")
            models = http.get(f"{base_url}/api/tags").json().get("models", [])
    except (httpx.HTTPError, ValueError):
        return {"running": False, "install": INSTALL}
    return {"running": True, "version": version, "install": INSTALL,
            "models": [{"name": m["name"], "size_gb": round(m.get("size", 0) / 1e9, 1)} for m in models]}


def pull(model: str, base_url: str = OLLAMA_URL, transport: httpx.BaseTransport | None = None) -> Iterator[dict]:
    """Download a model through Ollama, yielding progress: {status, completed, total, percent}."""
    with httpx.Client(transport=transport, timeout=httpx.Timeout(None, connect=5)) as http, \
            http.stream("POST", f"{base_url}/api/pull", json={"model": model, "stream": True}) as r:
        if r.status_code >= 400:
            r.read()
            yield {"status": "error", "message": r.text[:200]}
            return
        for line in r.iter_lines():
            if not line:
                continue
            try:
                p = json.loads(line)
            except json.JSONDecodeError:
                continue
            if p.get("error"):
                yield {"status": "error", "message": p["error"]}
                return
            total, done = p.get("total") or 0, p.get("completed") or 0
            yield {"status": p.get("status", ""), "completed": done, "total": total,
                   "percent": round(done / total * 100, 1) if total else None}
