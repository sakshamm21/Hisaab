"""Monthly budgets per category, with rollover, suggestions and safe-to-spend."""

from __future__ import annotations

import sqlite3
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Path
from pydantic import BaseModel

from hisaab import periods
from hisaab.api.deps import DB
from hisaab.totals import SPEND

router = APIRouter(tags=["budget"])

Period = Annotated[str, Path(pattern=r"^\d{4}-\d{2}$")]


def spent_by_category(db: sqlite3.Connection, start: str, end: str) -> dict[int | None, int]:
    rows = db.execute(
        f"""
        SELECT t.category_id, -SUM(t.amount) AS spent
        FROM report_tx t LEFT JOIN categories c ON c.id = t.category_id
        LEFT JOIN category_groups g ON g.id = c.group_id
        WHERE t.date >= ? AND t.date < ? AND {SPEND}
        GROUP BY t.category_id
        """,
        (start, end),
    )
    return {r["category_id"]: r["spent"] for r in rows}


def _carry_in(db: sqlite3.Connection, category_id: int, label: str, start_day: int) -> int:
    """Unspent (or overspent) money carried into `label` for a rollover category."""
    first = db.execute("SELECT MIN(month) FROM budgets WHERE category_id = ?", (category_id,)).fetchone()[0]
    if not first or first >= label:
        return 0
    carry, p = 0, first
    while p < label:
        start, end = periods.bounds(p, start_day)
        budget = db.execute("SELECT amount FROM budgets WHERE month = ? AND category_id = ?",
                            (p, category_id)).fetchone()
        spent = spent_by_category(db, start.isoformat(), end.isoformat()).get(category_id, 0)
        carry += (budget[0] if budget else 0) - spent
        p = periods.shift(p, 1)
    return carry


@router.get("/budget/{period}")
def get_budget(period: Period, db: DB) -> dict:
    start_day = periods.month_start_day(db)
    info = periods.describe(period, start_day)
    start, end = periods.bounds(period, start_day)
    spent = spent_by_category(db, start.isoformat(), end.isoformat())
    budgets = dict(db.execute("SELECT category_id, amount FROM budgets WHERE month = ?", (period,)).fetchall())

    # Average and last-period spending, for suggestions.
    history: list[dict[int | None, int]] = []
    for n in (1, 2, 3):
        s, e = periods.bounds(periods.shift(period, -n), start_day)
        history.append(spent_by_category(db, s.isoformat(), e.isoformat()))

    groups = []
    for g in db.execute("SELECT id, name FROM category_groups WHERE kind = 'expense' ORDER BY sort, id").fetchall():
        cats = []
        for c in db.execute("SELECT id, name, icon, color, bucket, rollover FROM categories"
                            " WHERE group_id = ? AND archived = 0 ORDER BY sort, id", (g["id"],)).fetchall():
            budgeted = budgets.get(c["id"], 0)
            carry = _carry_in(db, c["id"], period, start_day) if c["rollover"] else 0
            used = spent.get(c["id"], 0)
            avg = round(sum(h.get(c["id"], 0) for h in history) / 3)
            cats.append({
                **dict(c), "budgeted": budgeted, "carry": carry, "spent": used,
                "available": budgeted + carry - used, "average": max(avg, 0),
                "last": max(history[0].get(c["id"], 0), 0), "has_budget": c["id"] in budgets,
            })
        groups.append({"id": g["id"], "name": g["name"], "categories": cats})

    flat = [c for g in groups for c in g["categories"]]
    budgeted_total = sum(c["budgeted"] for c in flat)
    with_budget = [c for c in flat if c["has_budget"]]
    spent_total = sum(v for v in spent.values() if v > 0)
    unbudgeted_spend = sum(c["spent"] for c in flat if not c["has_budget"]) + max(spent.get(None, 0), 0)
    income = db.execute(
        "SELECT COALESCE(SUM(t.amount), 0) FROM report_tx t JOIN categories c ON c.id = t.category_id"
        " JOIN category_groups g ON g.id = c.group_id WHERE g.kind = 'income' AND t.date >= ? AND t.date < ?",
        (start.isoformat(), end.isoformat()),
    ).fetchone()[0]

    # Safe to spend per day: what's left in budgets (or, without budgets, income left over),
    # spread over the days remaining.
    if with_budget:
        left = sum(max(c["available"], 0) for c in with_budget) - unbudgeted_spend
    else:
        left = income - spent_total
    days_left = max(info["days_left"], 1)
    safe = max(left, 0) // days_left // 100 * 100 if info["is_current"] else None  # whole rupees, rounded down

    settings = {r["key"]: r["value"] for r in db.execute("SELECT key, value FROM settings")}
    buckets = {b: sum(c["spent"] for c in flat if c["bucket"] == b) for b in ("need", "want", "saving")}
    return {
        **info,
        "groups": groups,
        "totals": {
            "budgeted": budgeted_total, "spent": spent_total, "income": income,
            "available": sum(c["available"] for c in with_budget),
            "unbudgeted_spend": unbudgeted_spend, "safe_per_day": safe,
            "to_budget": income - budgeted_total,
        },
        "split": {
            "actual": buckets,
            "base": income or sum(buckets.values()),
            "targets": {
                "need": int(settings.get("needs_target", 50)),
                "want": int(settings.get("wants_target", 30)),
                "saving": int(settings.get("savings_target", 20)),
            },
        },
    }


class BudgetIn(BaseModel):
    amount: int  # paise; 0 removes the budget


@router.put("/budget/{period}/{category_id}")
def set_budget(period: Period, category_id: int, body: BudgetIn, db: DB) -> dict:
    if body.amount < 0:
        raise HTTPException(422, "A budget can't be negative")
    with db:
        if body.amount == 0:
            db.execute("DELETE FROM budgets WHERE month = ? AND category_id = ?", (period, category_id))
        else:
            db.execute("INSERT INTO budgets (month, category_id, amount) VALUES (?,?,?)"
                       " ON CONFLICT (month, category_id) DO UPDATE SET amount = excluded.amount",
                       (period, category_id, body.amount))
    return {"ok": True}


class FillIn(BaseModel):
    mode: Literal["average", "last", "copy"]
    overwrite: bool = False


@router.post("/budget/{period}/fill")
def fill_budget(period: Period, body: FillIn, db: DB) -> dict:
    """Set budgets from the 3-month average, last month's spending, or last month's budgets.
    Averages are rounded up to the nearest ₹100 so the budget is realistic."""
    current = get_budget(period, db)
    prev = periods.shift(period, -1)
    prev_budgets = dict(db.execute("SELECT category_id, amount FROM budgets WHERE month = ?", (prev,)).fetchall())
    changed = 0
    with db:
        for g in current["groups"]:
            for c in g["categories"]:
                if c["has_budget"] and not body.overwrite:
                    continue
                if body.mode == "copy":
                    amount = prev_budgets.get(c["id"], 0)
                else:
                    raw = c["average"] if body.mode == "average" else c["last"]
                    amount = -(-raw // 10000) * 10000  # round up to ₹100
                if amount > 0:
                    db.execute("INSERT INTO budgets (month, category_id, amount) VALUES (?,?,?)"
                               " ON CONFLICT (month, category_id) DO UPDATE SET amount = excluded.amount",
                               (period, c["id"], amount))
                    changed += 1
    return {"changed": changed}


@router.delete("/budget/{period}")
def clear_budget(period: Period, db: DB) -> dict:
    with db:
        n = db.execute("DELETE FROM budgets WHERE month = ?", (period,)).rowcount
    return {"removed": n}
