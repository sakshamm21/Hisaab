"""The assistant's loop: ask the model, run the tools it asks for, repeat, stream the answer."""

from __future__ import annotations

import json
import sqlite3
import uuid
from collections.abc import Iterator
from datetime import date

import httpx

from hisaab import periods
from hisaab.ai import tools
from hisaab.ai.client import AiError, log_request, stream_chat
from hisaab.ai.config import AiConfig
from hisaab.ai.privacy import Masker

MAX_ROUNDS = 6
HISTORY = 12  # earlier messages kept in a thread


def system_prompt(db: sqlite3.Connection) -> str:
    start_day = periods.month_start_day(db)
    current = periods.describe(periods.current(db), start_day)
    settings = {r[0]: r[1] for r in db.execute("SELECT key, value FROM settings")}
    cats = ", ".join(r[0] for r in db.execute(
        "SELECT c.name FROM categories c JOIN category_groups g ON g.id = c.group_id WHERE c.archived = 0 ORDER BY g.sort, c.sort"))
    return f"""You are Hisaab's assistant: you help one person understand their own money.

Today is {date.today():%A %d %B %Y}. Currency: {settings.get('currency', 'INR')}. The user's month starts on day {start_day}; the current month is {current['label']} (period {current['period']}).
Categories: {cats}.

Rules:
- Get every number from the tools. Never guess or invent amounts, dates or payees. If the tools don't have it, say so.
- Amounts from tools are in rupees. Write them like ₹1,23,456 (Indian grouping), without paise unless they matter.
- Spending figures already exclude transfers between the user's own accounts and count refunds against their category.
- Be brief and concrete: lead with the answer, then 2-4 short supporting points. Use simple words. No tables unless asked.
- People's names appear as "Person A", "Person B" for privacy. Use those labels as given.
- You can't change anything. To suggest a change (a budget, a category, a rule), call a propose_* tool; the user approves it.
- For "can I afford" questions, use the forecast, budgets, goals and upcoming bills, and show the arithmetic briefly.
- Don't give investment advice about specific securities; general budgeting guidance is fine."""


def _mask_obj(obj, masker: Masker):
    if isinstance(obj, str):
        return masker.mask(obj)
    if isinstance(obj, list):
        return [_mask_obj(x, masker) for x in obj]
    if isinstance(obj, dict):
        return {k: _mask_obj(v, masker) for k, v in obj.items()}
    return obj


def _history(db: sqlite3.Connection, thread_id: str) -> list[dict]:
    rows = db.execute("SELECT role, content FROM ai_messages WHERE thread_id = ? AND role IN ('user', 'assistant')"
                      " ORDER BY id DESC LIMIT ?", (thread_id, HISTORY)).fetchall()
    return [{"role": r["role"], "content": r["content"]} for r in reversed(rows)]


def run(db: sqlite3.Connection, cfg: AiConfig, question: str, thread_id: str | None = None, *,
        transport: httpx.BaseTransport | None = None) -> Iterator[dict]:
    """Yield events: thread, tool, text, proposal, done, error."""
    thread_id = thread_id or uuid.uuid4().hex
    yield {"type": "thread", "thread_id": thread_id}
    masker = Masker(db)
    messages = [{"role": "system", "content": system_prompt(db)}, *[
        {"role": m["role"], "content": masker.mask(m["content"])} for m in _history(db, thread_id)],
        {"role": "user", "content": masker.mask(question)}]
    with db:
        db.execute("INSERT INTO ai_messages (thread_id, role, content) VALUES (?, 'user', ?)", (thread_id, question))

    answer, used = "", []
    try:
        for round_no in range(MAX_ROUNDS):
            final_round = round_no == MAX_ROUNDS - 1
            log_request(db, cfg, "chat", messages)
            turn = None
            buffered = ""
            for kind, value in stream_chat(cfg, messages, None if final_round else tools.SCHEMAS, transport=transport):
                if kind == "text":
                    buffered += str(value)
                    yield {"type": "text", "delta": masker.unmask(str(value))}
                else:
                    turn = value
            if turn is None:
                break
            if not turn.tool_calls:
                answer = buffered
                break
            messages.append({"role": "assistant", "content": buffered or None, "tool_calls": [
                {"id": c.id, "type": "function", "function": {"name": c.name, "arguments": c.arguments or "{}"}}
                for c in turn.tool_calls]})
            for call in turn.tool_calls:
                args = call.args()
                yield {"type": "tool", "name": call.name, "label": tools.LABELS.get(call.name, call.name), "args": args}
                result = tools.run_tool(db, call.name, args)
                used.append(call.name)
                if isinstance(result, dict) and "proposal" in result:
                    yield {"type": "proposal", **result["proposal"]}
                messages.append({"role": "tool", "tool_call_id": call.id,
                                 "content": json.dumps(_mask_obj(result, masker), ensure_ascii=False)})
            if buffered:
                yield {"type": "text", "delta": "\n\n"}
        else:
            answer = answer or "I couldn't finish working that out. Try asking a narrower question."
    except AiError as exc:
        yield {"type": "error", "message": str(exc)}
        return
    final = masker.unmask(answer.strip())
    with db:
        db.execute("INSERT INTO ai_messages (thread_id, role, content, tool_calls) VALUES (?, 'assistant', ?, ?)",
                   (thread_id, final, json.dumps(used)))
    yield {"type": "done", "thread_id": thread_id, "tools": used, "text": final}
