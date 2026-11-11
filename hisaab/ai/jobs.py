"""Two quieter AI jobs: categorizing unknown payees, and writing up the month in review."""

from __future__ import annotations

import json
import re
import sqlite3

import httpx

from hisaab.ai.client import complete, log_request
from hisaab.ai.config import AiConfig
from hisaab.ai.models import DEFAULT_CATEGORIZE_MODEL, DEFAULT_CHAT_MODEL
from hisaab.insights import rupees

BATCH = 50


def _json_block(text: str):
    match = re.search(r"\{.*\}|\[.*\]", text, re.S)
    return json.loads(match.group(0)) if match else None


def suggest_categories(db: sqlite3.Connection, cfg: AiConfig, limit: int = 100,
                       transport: httpx.BaseTransport | None = None) -> list[dict]:
    """Suggest a category for uncategorized payees. Only merchant names and your category list are
    sent; payments to people are never sent."""
    rows = db.execute(
        """SELECT payee, COUNT(*) AS n, -SUM(amount) AS spent, MAX(amount > 0) AS has_income FROM transactions
           WHERE category_id IS NULL AND transfer_id IS NULL AND split_parent_id IS NULL AND is_person = 0 AND payee != ''
           GROUP BY payee COLLATE NOCASE ORDER BY n DESC LIMIT ?""", (limit,)).fetchall()
    if not rows:
        return []
    cats = {r["name"]: r["id"] for r in db.execute("SELECT name, id FROM categories WHERE archived = 0")}
    if cfg.provider == "openrouter" and cfg.model == DEFAULT_CHAT_MODEL:
        cfg = AiConfig(cfg.provider, DEFAULT_CATEGORIZE_MODEL, cfg.base_url, cfg.key, [DEFAULT_CHAT_MODEL, "openrouter/free"])
    out: list[dict] = []
    for i in range(0, len(rows), BATCH):
        chunk = rows[i:i + BATCH]
        messages = [
            {"role": "system", "content": "You categorize Indian bank transaction payees. Reply with JSON only."},
            {"role": "user", "content":
                "Categories: " + ", ".join(cats) + "\n\nFor each payee pick the single best category, or null if you "
                "can't tell (many are small shops or people's names; null is fine). Payees:\n"
                + "\n".join(f"- {r['payee']}" for r in chunk)
                + '\n\nReply as JSON: {"payee name": "Category" or null, ...}'},
        ]
        log_request(db, cfg, "categorize", messages)
        try:
            data = _json_block(complete(cfg, messages, transport=transport, temperature=0)) or {}
        except (json.JSONDecodeError, ValueError):
            data = {}
        if isinstance(data, list):
            data = {d.get("payee"): d.get("category") for d in data if isinstance(d, dict)}
        for r in chunk:
            name = data.get(r["payee"])
            if name and name in cats:
                out.append({"payee": r["payee"], "category_id": cats[name], "category": name, "count": r["n"]})
    return out


def write_review(db: sqlite3.Connection, cfg: AiConfig, facts: dict, transport: httpx.BaseTransport | None = None) -> str:
    """Turn the month's computed facts into a short, friendly paragraph. Numbers come from Python."""
    brief = {
        "month": facts["label"], "income": rupees(facts["income"]), "spending": rupees(facts["spending"]),
        "kept": rupees(facts["net"]) if facts["net"] >= 0 else f"-{rupees(-facts['net'])}",
        "savings_rate": f"{round(facts['savings_rate'] * 100)}%" if facts["savings_rate"] is not None else None,
        "usual_month_spending": rupees(facts["usual_spending"]),
        "top_categories": [f"{c['name']} {rupees(c['spent'])}" for c in facts["top_categories"][:4]],
        "rose": [f"{c['name']} +{rupees(c['change'])}" for c in facts["up"][:3]],
        "fell": [f"{c['name']} -{rupees(-c['change'])}" for c in facts["down"][:3]],
        "budgets_over": [f"{b['name']} ({rupees(b['spent'])} of {rupees(b['budget'])})" for b in facts["budgets"]["over"]],
        "no_spend_days": facts["no_spend_days"],
    }
    messages = [
        {"role": "system", "content": "You write a short monthly money review for one person. Use only the numbers given. "
                                      "Warm, plain, specific. No headings, no lists, 3-5 sentences, end with one concrete suggestion."},
        {"role": "user", "content": json.dumps(brief, ensure_ascii=False)},
    ]
    log_request(db, cfg, "review", messages)
    return complete(cfg, messages, transport=transport, temperature=0.4)
