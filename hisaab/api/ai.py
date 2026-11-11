"""AI endpoints: settings, models, chat (streamed), categorize, review write-up, offline models."""

from __future__ import annotations

import json
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Path, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from hisaab import review
from hisaab.ai import agent, config, jobs, models, offline
from hisaab.ai.client import AiError, complete, log_request
from hisaab.api.deps import DB
from hisaab.db import connect

router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/status")
def status(db: DB) -> dict:
    cfg = config.load(db)
    return {"provider": cfg.provider, "model": cfg.model, "base_url": cfg.base_url, "ready": cfg.ready,
            "key": config.mask(cfg.key), "fallbacks": cfg.fallbacks,
            "key_from_env": cfg.provider == "openrouter" and bool(__import__("os").environ.get("OPENROUTER_API_KEY")),
            "recommended": models.RECOMMENDED, "offline": models.OFFLINE}


class SettingsIn(BaseModel):
    provider: Literal["openrouter", "ollama", "custom"]
    model: str = ""
    base_url: str = ""
    key: str | None = None  # None leaves the saved key alone; "" removes it
    fallbacks: list[str] | None = None


@router.put("/settings")
def save_settings(body: SettingsIn, db: DB) -> dict:
    values = {"provider": body.provider, "model": body.model.strip()}
    if body.provider != "openrouter":
        values["base_url"] = body.base_url.strip() or (config.OLLAMA_URL if body.provider == "ollama" else "")
    if body.fallbacks is not None:
        values["fallbacks"] = json.dumps(body.fallbacks)
    config.save(db, **values)
    if body.key is not None:
        config.set_key(body.provider, body.key)
    return status(db)


@router.get("/models")
def list_models() -> dict:
    try:
        return {"models": models.live_models(), "recommended": models.RECOMMENDED}
    except Exception as exc:  # offline: still show the recommendations
        return {"models": [], "recommended": models.RECOMMENDED, "error": f"Couldn't load the live list: {exc}"}


@router.post("/test")
def test(db: DB) -> dict:
    cfg = config.load(db)
    if not cfg.ready:
        raise HTTPException(422, "Add a key (or choose an offline model) first")
    messages = [{"role": "user", "content": "Reply with just the word: ready"}]
    log_request(db, cfg, "test", messages)
    try:
        reply = complete(cfg, messages, timeout=60)
    except AiError as exc:
        raise HTTPException(502, str(exc)) from exc
    return {"ok": True, "reply": reply[:200], "model": cfg.model}


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    thread_id: str | None = None


@router.post("/chat")
def chat(body: ChatIn, request: Request, db: DB) -> StreamingResponse:
    cfg = config.load(db)
    if not cfg.ready:
        raise HTTPException(422, "The assistant isn't set up yet. Add your OpenRouter key in Settings → AI.")
    db_path = request.app.state.db_path

    def events():
        conn = connect(db_path)  # the request's connection closes before the stream finishes
        try:
            for event in agent.run(conn, cfg, body.message, body.thread_id):
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        except Exception as exc:  # never leave the UI hanging
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"
        finally:
            conn.close()

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


@router.get("/threads/{thread_id}")
def thread(thread_id: str, db: DB) -> list[dict]:
    return [dict(r) for r in db.execute(
        "SELECT role, content, tool_calls, created_at FROM ai_messages WHERE thread_id = ? ORDER BY id", (thread_id,))]


@router.get("/log")
def sent_log(db: DB, limit: int = 30) -> list[dict]:
    return [dict(r) for r in db.execute("SELECT * FROM ai_requests ORDER BY id DESC LIMIT ?", (min(limit, 200),))]


@router.delete("/log")
def clear_log(db: DB) -> dict:
    with db:
        db.execute("DELETE FROM ai_requests")
        db.execute("DELETE FROM ai_messages")
    return {"ok": True}


@router.post("/categorize")
def categorize(db: DB) -> dict:
    cfg = config.load(db)
    if not cfg.ready:
        raise HTTPException(422, "The assistant isn't set up yet.")
    try:
        return {"suggestions": jobs.suggest_categories(db, cfg)}
    except AiError as exc:
        raise HTTPException(502, str(exc)) from exc


@router.post("/review/{period}")
def review_writeup(period: Annotated[str, Path(pattern=r"^\d{4}-\d{2}$")], db: DB) -> dict:
    cfg = config.load(db)
    if not cfg.ready:
        raise HTTPException(422, "The assistant isn't set up yet.")
    try:
        return {"text": jobs.write_review(db, cfg, review.build(db, period))}
    except AiError as exc:
        raise HTTPException(502, str(exc)) from exc


@router.get("/offline")
def offline_status(db: DB) -> dict:
    cfg = config.load(db)
    base = cfg.base_url if cfg.provider == "ollama" else config.OLLAMA_URL
    return offline.status(base) | {"recommended": models.OFFLINE}


class PullIn(BaseModel):
    model: str = Field(pattern=r"^[\w.:\-/]+$")


@router.post("/offline/pull")
def offline_pull(body: PullIn, db: DB) -> StreamingResponse:
    cfg = config.load(db)
    base = cfg.base_url if cfg.provider == "ollama" else config.OLLAMA_URL

    def events():
        try:
            for p in offline.pull(body.model, base):
                yield f"data: {json.dumps(p)}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'status': 'error', 'message': f'Ollama is not reachable: {exc}'})}\n\n"

    return StreamingResponse(events(), media_type="text/event-stream")
