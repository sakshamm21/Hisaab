"""Tools the assistant can call. Every one is read-only SQL over your database and returns a small,
aggregated answer. Amounts are in rupees (not paise) so the model reads them naturally.

Changes are never made here: the `propose_*` tools return a suggestion the user applies with a click.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Callable
from datetime import date, timedelta

from hisaab import insights, periods, recurring
from hisaab.totals import SPEND, period_totals


def rs(paise: int | float | None) -> float:
    return round((paise or 0) / 100, 2)


def _period_range(db: sqlite3.Connection, period: str | None, date_from: str | None, date_to: str | None) -> tuple[str, str, str]:
    """(start, end exclusive, description). Defaults to the current financial month."""
    if date_from or date_to:
        start = date_from or "1900-01-01"
        end = (date.fromisoformat(date_to) + timedelta(days=1)).isoformat() if date_to else "9999-12-31"
        return start, end, f"{date_from or 'the beginning'} to {date_to or 'today'}"
    start_day = periods.month_start_day(db)
    label = period or periods.current(db)
    s, e = periods.bounds(label, start_day)
    return s.isoformat(), e.isoformat(), periods.describe(label, start_day)["label"]


def _category_id(db: sqlite3.Connection, name: str | None) -> int | None:
    if not name:
        return None
    row = db.execute("SELECT id FROM categories WHERE name = ? COLLATE NOCASE", (name,)).fetchone() or db.execute(
        "SELECT id FROM categories WHERE name LIKE ? COLLATE NOCASE ORDER BY length(name) LIMIT 1", (f"%{name}%",)).fetchone()
    return row[0] if row else None


def get_summary(db, period: str | None = None, date_from: str | None = None, date_to: str | None = None) -> dict:
    start, end, label = _period_range(db, period, date_from, date_to)
    t = period_totals(db, start, end)
    return {"period": label, "income": rs(t["income"]), "spending": rs(t["spending"]),
            "left_over": rs(t["income"] - t["spending"]),
            "savings_rate_percent": round((t["income"] - t["spending"]) / t["income"] * 100, 1) if t["income"] > 0 else None,
            "transactions": t["transaction_count"]}


def spending_by(db, group_by: str = "category", period: str | None = None, date_from: str | None = None,
                date_to: str | None = None, category: str | None = None, limit: int = 15) -> dict:
    start, end, label = _period_range(db, period, date_from, date_to)
    key = {"category": "COALESCE(c.name, 'Uncategorized')", "group": "COALESCE(g.name, 'Uncategorized')",
           "merchant": "t.payee", "tag": "t.tags", "month": "substr(t.date, 1, 7)", "weekday": "strftime('%w', t.date)"}.get(group_by)
    if not key:
        return {"error": "group_by must be category, group, merchant, month, weekday or tag"}
    extra, params = "", [start, end]
    if cid := _category_id(db, category):
        extra = " AND t.category_id = ?"
        params.append(cid)
    rows = db.execute(
        f"""SELECT {key} AS k, -SUM(t.amount) AS spent, COUNT(*) AS n FROM report_tx t
            LEFT JOIN categories c ON c.id = t.category_id LEFT JOIN category_groups g ON g.id = c.group_id
            WHERE t.date >= ? AND t.date < ? AND {SPEND}{extra} GROUP BY k ORDER BY spent DESC LIMIT ?""",
        (*params, min(limit, 40))).fetchall()
    names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    return {"period": label, "group_by": group_by, "rows": [
        {"name": names[int(r["k"])] if group_by == "weekday" else (r["k"] or "(none)"), "spent": rs(r["spent"]), "count": r["n"]}
        for r in rows]}


def search_transactions(db, text: str | None = None, category: str | None = None, account: str | None = None,
                        date_from: str | None = None, date_to: str | None = None, min_amount: float | None = None,
                        max_amount: float | None = None, direction: str | None = None, limit: int = 20) -> dict:
    where, params = ["t.split_parent_id IS NULL"], []
    if text:
        where.append("(t.payee LIKE ? OR t.notes LIKE ? OR t.tags LIKE ?)")
        params += [f"%{text}%"] * 3
    if category and (cid := _category_id(db, category)):
        where.append("t.category_id = ?")
        params.append(cid)
    if account:
        where.append("a.name LIKE ?")
        params.append(f"%{account}%")
    if date_from:
        where.append("t.date >= ?")
        params.append(date_from)
    if date_to:
        where.append("t.date <= ?")
        params.append(date_to)
    if min_amount is not None:
        where.append("ABS(t.amount) >= ?")
        params.append(int(min_amount * 100))
    if max_amount is not None:
        where.append("ABS(t.amount) <= ?")
        params.append(int(max_amount * 100))
    if direction in ("in", "out"):
        where.append("t.amount > 0" if direction == "in" else "t.amount < 0")
    clause = " AND ".join(where)
    q = f"FROM transactions t JOIN accounts a ON a.id = t.account_id LEFT JOIN categories c ON c.id = t.category_id WHERE {clause}"
    total, count = db.execute(f"SELECT COALESCE(SUM(t.amount), 0), COUNT(*) {q}", params).fetchone()
    rows = db.execute(f"SELECT t.date, t.payee, t.amount, c.name AS category, a.name AS account, t.notes,"
                      f" t.transfer_id IS NOT NULL AS transfer {q} ORDER BY t.date DESC LIMIT ?", (*params, min(limit, 50))).fetchall()
    return {"matches": count, "net_total": rs(total),
            "transactions": [{"date": r["date"], "payee": r["payee"], "amount": rs(r["amount"]), "category": r["category"],
                              "account": r["account"], **({"transfer": True} if r["transfer"] else {}),
                              **({"notes": r["notes"]} if r["notes"] else {})} for r in rows],
            **({"note": f"showing the latest {len(rows)}"} if count > len(rows) else {})}


def budget_status(db, period: str | None = None) -> dict:
    from hisaab.api.budget import get_budget

    b = get_budget(period or periods.current(db), db)
    rows = [{"category": c["name"], "budget": rs(c["budgeted"] + c["carry"]), "spent": rs(c["spent"]), "left": rs(c["available"])}
            for g in b["groups"] for c in g["categories"] if c["has_budget"]]
    return {"period": b["label"], "days_left": b["days_left"], "categories": rows,
            "total_budget": rs(b["totals"]["budgeted"]), "total_spent": rs(b["totals"]["spent"]),
            "safe_to_spend_per_day": rs(b["totals"]["safe_per_day"]) if b["totals"]["safe_per_day"] is not None else None,
            "spent_outside_budgets": rs(b["totals"]["unbudgeted_spend"])}


def compare_periods(db, a: str, b: str) -> dict:
    start_day = periods.month_start_day(db)
    out = {}
    for name, label in (("a", a), ("b", b)):
        s, e = periods.bounds(label, start_day)
        out[name] = period_totals(db, s.isoformat(), e.isoformat())
    cats = {}
    for name in ("a", "b"):
        for c in out[name]["by_category"]:
            cats.setdefault(c["name"], {"a": 0, "b": 0})[name] = c["spent"]
    changes = sorted(({"category": k, a: rs(v["a"]), b: rs(v["b"]), "change": rs(v["b"] - v["a"])} for k, v in cats.items()),
                     key=lambda r: -abs(r["change"]))
    return {a: {"income": rs(out["a"]["income"]), "spending": rs(out["a"]["spending"])},
            b: {"income": rs(out["b"]["income"]), "spending": rs(out["b"]["spending"])}, "by_category": changes[:12]}


def list_recurring(db) -> dict:
    recurring.sync(db)
    items = db.execute("SELECT r.*, c.name AS category FROM recurring r LEFT JOIN categories c ON c.id = r.category_id"
                       " WHERE r.active = 1 ORDER BY r.next_due").fetchall()
    return {"items": [{"name": r["name"], "kind": r["kind"], "amount": rs(r["amount"]), "every": f"{r['interval']} {r['cadence']}",
                       "next_due": r["next_due"], "monthly_cost": rs(recurring.monthly_cost(r["amount"], r["cadence"], r["interval"]))}
                      for r in items],
            "spotted_but_not_tracked": [{"name": d["name"], "amount": rs(d["amount"]), "cadence": d["cadence"]}
                                        for d in recurring.detect(db)][:5]}


def goals_status(db) -> dict:
    from hisaab.api.plan import goal_view

    return {"goals": [{k: (rs(v) if k in ("target_amount", "saved", "remaining", "pace_per_month", "needed_per_month") and v is not None else v)
                       for k, v in goal_view(db, g).items() if k in ("name", "target_amount", "target_date", "saved", "remaining",
                                                                     "pace_per_month", "needed_per_month", "projected_date")}
                      for g in db.execute("SELECT * FROM goals WHERE archived = 0")]}


def get_forecast(db) -> dict:
    f = insights.forecast(db)
    return {k: (rs(v) if isinstance(v, int) and k != "period" else v) for k, v in f.items()}


def account_balances(db) -> dict:
    rows = db.execute("SELECT a.name, a.kind, a.opening_balance + COALESCE(SUM(t.amount), 0) AS balance FROM accounts a"
                      " LEFT JOIN transactions t ON t.account_id = a.id AND t.split_parent_id IS NULL WHERE a.archived = 0 GROUP BY a.id").fetchall()
    return {"accounts": [{"name": r["name"], "type": r["kind"], "balance": rs(r["balance"])} for r in rows],
            "net_worth": rs(sum(r["balance"] for r in rows))}


# ---- Proposals: suggestions the user applies with a click ---------------------------------------

def propose_budget(db, category: str, amount: float, period: str | None = None) -> dict:
    cid = _category_id(db, category)
    if not cid:
        return {"error": f"No category called {category}"}
    name = db.execute("SELECT name FROM categories WHERE id = ?", (cid,)).fetchone()[0]
    return {"proposal": {"kind": "budget", "category_id": cid, "category": name, "amount": round(amount * 100),
                         "period": period or periods.current(db)}, "status": "Shown to the user to approve."}


def propose_recategorize(db, payee: str, category: str) -> dict:
    cid = _category_id(db, category)
    if not cid:
        return {"error": f"No category called {category}"}
    n = db.execute("SELECT COUNT(*) FROM transactions WHERE payee = ? COLLATE NOCASE AND transfer_id IS NULL", (payee,)).fetchone()[0]
    name = db.execute("SELECT name FROM categories WHERE id = ?", (cid,)).fetchone()[0]
    return {"proposal": {"kind": "recategorize", "payee": payee, "category_id": cid, "category": name, "count": n},
            "status": "Shown to the user to approve."}


def propose_rule(db, contains: str, category: str) -> dict:
    cid = _category_id(db, category)
    if not cid:
        return {"error": f"No category called {category}"}
    name = db.execute("SELECT name FROM categories WHERE id = ?", (cid,)).fetchone()[0]
    return {"proposal": {"kind": "rule", "pattern": contains, "category_id": cid, "category": name},
            "status": "Shown to the user to approve."}


# ---- Schemas -----------------------------------------------------------------------------------

PERIOD = {"type": "string", "description": "Month as YYYY-MM (the user's financial month). Omit for the current month."}
DATE = {"type": "string", "description": "YYYY-MM-DD"}


def _fn(name: str, description: str, properties: dict, required: list[str] | None = None) -> dict:
    return {"type": "function", "function": {"name": name, "description": description,
                                             "parameters": {"type": "object", "properties": properties, "required": required or []}}}


SCHEMAS = [
    _fn("get_summary", "Income, spending, money left over and savings rate for a month or a date range.",
        {"period": PERIOD, "date_from": DATE, "date_to": DATE}),
    _fn("spending_by", "Spending totals grouped by category, group, merchant, month, weekday or tag, biggest first.",
        {"group_by": {"type": "string", "enum": ["category", "group", "merchant", "month", "weekday", "tag"]},
         "period": PERIOD, "date_from": DATE, "date_to": DATE,
         "category": {"type": "string", "description": "Only this category, e.g. 'Food delivery'"},
         "limit": {"type": "integer"}}, ["group_by"]),
    _fn("search_transactions", "Find individual transactions. Returns the latest matches and their net total (negative = money out).",
        {"text": {"type": "string", "description": "Payee, note or tag text"}, "category": {"type": "string"},
         "account": {"type": "string"}, "date_from": DATE, "date_to": DATE,
         "min_amount": {"type": "number", "description": "Rupees"}, "max_amount": {"type": "number", "description": "Rupees"},
         "direction": {"type": "string", "enum": ["in", "out"]}, "limit": {"type": "integer"}}),
    _fn("budget_status", "This month's budgets: budget, spent and left per category, plus safe to spend per day.", {"period": PERIOD}),
    _fn("compare_periods", "Compare two months: income, spending and the biggest category changes.",
        {"a": PERIOD, "b": PERIOD}, ["a", "b"]),
    _fn("list_recurring", "Bills, subscriptions and regular income: amounts, next due dates, monthly cost.", {}),
    _fn("goals_status", "Savings goals: target, saved, monthly amount needed, current pace.", {}),
    _fn("get_forecast", "Where this month is heading: projected spending, income and savings at the current pace.", {}),
    _fn("account_balances", "Current balance of every account and total net worth.", {}),
    _fn("propose_budget", "Suggest setting a category's monthly budget. The user approves it; nothing changes until then.",
        {"category": {"type": "string"}, "amount": {"type": "number", "description": "Rupees"}, "period": PERIOD},
        ["category", "amount"]),
    _fn("propose_recategorize", "Suggest moving every transaction from a payee to a category. The user approves it.",
        {"payee": {"type": "string"}, "category": {"type": "string"}}, ["payee", "category"]),
    _fn("propose_rule", "Suggest an auto-categorize rule: payees containing this text go to a category. The user approves it.",
        {"contains": {"type": "string"}, "category": {"type": "string"}}, ["contains", "category"]),
]

TOOLS: dict[str, Callable] = {
    "get_summary": get_summary, "spending_by": spending_by, "search_transactions": search_transactions,
    "budget_status": budget_status, "compare_periods": compare_periods, "list_recurring": list_recurring,
    "goals_status": goals_status, "get_forecast": get_forecast, "account_balances": account_balances,
    "propose_budget": propose_budget, "propose_recategorize": propose_recategorize, "propose_rule": propose_rule,
}

LABELS = {
    "get_summary": "Totals", "spending_by": "Spending breakdown", "search_transactions": "Searched transactions",
    "budget_status": "Budgets", "compare_periods": "Compared months", "list_recurring": "Bills & subscriptions",
    "goals_status": "Goals", "get_forecast": "Forecast", "account_balances": "Account balances",
    "propose_budget": "Suggested a budget", "propose_recategorize": "Suggested a category", "propose_rule": "Suggested a rule",
}


def run_tool(db: sqlite3.Connection, name: str, args: dict) -> dict:
    fn = TOOLS.get(name)
    if not fn:
        return {"error": f"Unknown tool {name}"}
    try:
        return fn(db, **{k: v for k, v in args.items() if v is not None and v != ""})
    except TypeError as exc:
        return {"error": f"Bad arguments: {exc}"}
    except Exception as exc:  # a tool failing shouldn't end the conversation
        return {"error": str(exc)}
