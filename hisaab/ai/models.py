"""Recommended models, and the live OpenRouter model list.

Recommendations were checked against OpenRouter's live list on 10 Nov 2026 (tool-call support,
price). Models change often: edit this file, then run `python -m hisaab.ai.eval` to check a model
answers the test questions correctly before making it the default.
"""

from __future__ import annotations

import time

import httpx

from hisaab.ai.config import OPENROUTER_URL

DEFAULT_CHAT_MODEL = "google/gemma-4-31b-it:free"
DEFAULT_FALLBACKS = ["nvidia/nemotron-3-ultra-550b-a55b:free", "openrouter/free"]
DEFAULT_CATEGORIZE_MODEL = "google/gemma-4-26b-a4b-it:free"

RECOMMENDED = [
    {"id": "google/gemma-4-31b-it:free", "label": "Gemma 4 31B", "tier": "free",
     "why": "Free default. Good with tools and numbers; same family as the offline models."},
    {"id": "nvidia/nemotron-3-ultra-550b-a55b:free", "label": "Nemotron 3 Ultra", "tier": "free",
     "why": "Free, very large reasoning model. Slower; good fallback."},
    {"id": "anthropic/claude-haiku-5.5", "label": "Claude Haiku 5.5", "tier": "cheap",
     "why": "About ₹0.2 a question. Fast and reliable with tools. Best value once you add credit."},
    {"id": "z-ai/glm-5.3-flash", "label": "GLM 5.3 Flash", "tier": "cheap",
     "why": "Very cheap; fine for categorizing payees."},
    {"id": "anthropic/claude-sonnet-5.5", "label": "Claude Sonnet 5.5", "tier": "best",
     "why": "Best answers for planning questions. About ₹3 a question."},
]

# Offline models, by GPU memory. Pulled through Ollama only when you click Download.
OFFLINE = [
    {"id": "gemma4:e4b", "label": "Gemma 4 E4B", "size_gb": 6.6, "needs": "8 GB GPU, or a 16 GB Apple Silicon Mac"},
    {"id": "gemma4:12b", "label": "Gemma 4 12B", "size_gb": 7.7, "needs": "12 GB GPU"},
    {"id": "gemma4:26b-a4b", "label": "Gemma 4 26B (fast MoE)", "size_gb": 16, "needs": "24 GB GPU, or a 32 GB+ Mac"},
]

_cache: dict = {"at": 0.0, "models": []}


def live_models(timeout: float = 15) -> list[dict]:
    """OpenRouter models that support tool calls (no key needed). Cached for a day."""
    if _cache["models"] and time.time() - _cache["at"] < 86400:
        return _cache["models"]
    r = httpx.get(f"{OPENROUTER_URL}/models", timeout=timeout)
    r.raise_for_status()
    out = []
    for m in r.json()["data"]:
        if "tools" not in (m.get("supported_parameters") or []):
            continue
        pricing = m.get("pricing") or {}
        try:
            prompt, completion = float(pricing.get("prompt", 0)) * 1e6, float(pricing.get("completion", 0)) * 1e6
        except ValueError:
            continue
        out.append({"id": m["id"], "name": m.get("name", m["id"]), "context": m.get("context_length"),
                    "free": prompt == 0 and completion == 0, "price_in": round(prompt, 3), "price_out": round(completion, 3)})
    out.sort(key=lambda m: (not m["free"], m["price_in"], m["id"]))
    _cache.update(at=time.time(), models=out)
    return out
