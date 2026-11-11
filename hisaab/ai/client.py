"""One small client for any OpenAI-compatible chat API: OpenRouter, Ollama, LM Studio, and others.

Streams the response and yields text deltas and completed tool calls as they arrive.
"""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Iterator
from dataclasses import dataclass, field

import httpx

from hisaab.ai.config import AiConfig


class AiError(RuntimeError):
    pass


# Tests swap this for an httpx.MockTransport; normally None (real network).
TRANSPORT: httpx.BaseTransport | None = None


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: str = ""

    def args(self) -> dict:
        try:
            return json.loads(self.arguments or "{}")
        except json.JSONDecodeError:
            return {}


@dataclass
class Turn:
    """What the model said in one round."""
    text: str = ""
    tool_calls: list[ToolCall] = field(default_factory=list)
    model: str = ""


FRIENDLY = {
    401: "The API key was rejected. Check it in Settings → AI.",
    402: "Your OpenRouter account is out of credit for this model. Pick a free model or add credit.",
    404: "That model isn't available. Pick another in Settings → AI.",
    429: "The model is busy or you've hit the free limit for today. Try again shortly, or pick another model.",
}


def _headers(cfg: AiConfig) -> dict:
    h = {"Content-Type": "application/json"}
    if cfg.key:
        h["Authorization"] = f"Bearer {cfg.key}"
    if cfg.provider == "openrouter":
        h["HTTP-Referer"] = "https://github.com/sakshamm21/Hisaab"
        h["X-Title"] = "Hisaab"
    return h


def log_request(db: sqlite3.Connection | None, cfg: AiConfig, purpose: str, messages: list[dict], status: str = "ok") -> None:
    if db is None:
        return
    with db:
        db.execute("INSERT INTO ai_requests (provider, model, purpose, payload, status) VALUES (?,?,?,?,?)",
                   (cfg.provider, cfg.model, purpose, json.dumps(messages, ensure_ascii=False)[:20000], status))
        db.execute("DELETE FROM ai_requests WHERE id NOT IN (SELECT id FROM ai_requests ORDER BY id DESC LIMIT 200)")


def stream_chat(cfg: AiConfig, messages: list[dict], tools: list[dict] | None = None, *,
                transport: httpx.BaseTransport | None = None, timeout: float = 120,
                temperature: float = 0.2) -> Iterator[tuple[str, object]]:
    """Yield ("text", str) for each text delta, then ("turn", Turn) once the round is complete."""
    body: dict = {"model": cfg.model, "messages": messages, "stream": True, "temperature": temperature}
    if tools:
        body["tools"] = tools
    if cfg.provider == "openrouter" and cfg.fallbacks:
        body["models"] = [cfg.model, *cfg.fallbacks]  # OpenRouter tries these in order if the first fails

    turn = Turn(model=cfg.model)
    calls: dict[int, ToolCall] = {}
    with httpx.Client(transport=transport or TRANSPORT, timeout=httpx.Timeout(timeout, connect=10)) as http:
        try:
            with http.stream("POST", cfg.chat_url, headers=_headers(cfg), json=body) as r:
                if r.status_code >= 400:
                    r.read()
                    detail = ""
                    try:
                        detail = r.json().get("error", {}).get("message", "")
                    except Exception:
                        detail = r.text[:200]
                    raise AiError(FRIENDLY.get(r.status_code, f"The AI provider returned an error ({r.status_code}). {detail}".strip()))
                for line in r.iter_lines():
                    if not line or not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    if chunk.get("error"):
                        raise AiError(chunk["error"].get("message", "The AI provider returned an error."))
                    turn.model = chunk.get("model", turn.model)
                    for choice in chunk.get("choices", []):
                        delta = choice.get("delta") or {}
                        if delta.get("content"):
                            turn.text += delta["content"]
                            yield "text", delta["content"]
                        for tc in delta.get("tool_calls") or []:
                            i = tc.get("index", len(calls))
                            call = calls.setdefault(i, ToolCall(id=tc.get("id") or f"call_{i}", name=""))
                            if tc.get("id"):
                                call.id = tc["id"]
                            fn = tc.get("function") or {}
                            if fn.get("name"):
                                call.name = fn["name"]
                            if fn.get("arguments"):
                                call.arguments += fn["arguments"]
        except httpx.ConnectError as exc:
            where = "Ollama isn't running. Start it, or switch to OpenRouter." if cfg.provider == "ollama" else "Couldn't reach the AI provider. Check your internet connection."
            raise AiError(where) from exc
        except httpx.TimeoutException as exc:
            raise AiError("The AI took too long to answer. Try again, or pick a faster model.") from exc
    turn.tool_calls = [calls[i] for i in sorted(calls) if calls[i].name]
    yield "turn", turn


def complete(cfg: AiConfig, messages: list[dict], **kw) -> str:
    """A plain, non-tool completion: returns the whole text."""
    text = ""
    for kind, value in stream_chat(cfg, messages, **kw):
        if kind == "text":
            text += str(value)
    return text.strip()
