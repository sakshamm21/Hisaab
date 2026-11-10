"""Period summary for the dashboard.

Rules (from the report_tx view): transfers never count; a split counts through its parts;
refunds in an expense category reduce that category's spend; uncategorized money out counts
as spending so nothing is hidden.
"""

from __future__ import annotations

import sqlite3
from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Query

from hisaab import periods
from hisaab.api.deps import DB

router = APIRouter(tags=["summary"])

SPEND = "(g.kind = 'expense' OR (c.id IS NULL AND t.amount < 0))"


def period_totals(db: sqlite3.Connection, start: str, end: str) -> dict:
    """Income, spending and spending by category between two ISO dates (end exclusive)."""
    base = """
        FROM report_tx t
        LEFT JOIN categories c ON c.id = t.category_id
        LEFT JOIN category_groups g ON g.id = c.group_id
        WHERE t.date >= ? AND t.date < ?
    """
    totals = db.execute(
        f"""
        SELECT COALESCE(SUM(CASE WHEN g.kind = 'income' THEN t.amount END), 0) AS income,
               COALESCE(-SUM(CASE WHEN {SPEND} THEN t.amount END), 0) AS spending,
               COUNT(*) AS transaction_count
        {base}
        """,
        (start, end),
    ).fetchone()
    by_category = db.execute(
        f"""
        SELECT c.id, COALESCE(c.name, 'Uncategorized') AS name,
               COALESCE(c.icon, 'circle-help') AS icon, COALESCE(c.color, '#8b8693') AS color,
               c.bucket, -SUM(t.amount) AS spent, COUNT(*) AS count
        {base} AND {SPEND}
        GROUP BY c.id ORDER BY spent DESC
        """,
        (start, end),
    ).fetchall()
    return {"income": totals["income"], "spending": totals["spending"],
            "transaction_count": totals["transaction_count"], "by_category": [dict(r) for r in by_category]}


@router.get("/summary")
def summary(db: DB, month: Annotated[str | None, Query(pattern=r"^\d{4}-\d{2}$")] = None) -> dict:
    start_day = periods.month_start_day(db)
    label = month or periods.current(db)
    start, end = periods.bounds(label, start_day)
    totals = period_totals(db, start.isoformat(), end.isoformat())
    net = totals["income"] - totals["spending"]
    prev_start, prev_end = periods.bounds(periods.shift(label, -1), start_day)
    prev = period_totals(db, prev_start.isoformat(), prev_end.isoformat())
    # The same number of days into last month, so a half-finished month isn't compared with a whole one.
    info = periods.describe(label, start_day)
    same_point = min(prev_start + timedelta(days=info["days_elapsed"]), prev_end)
    prev_to_date = period_totals(db, prev_start.isoformat(), same_point.isoformat())
    return {
        "month": label,
        **periods.describe(label, start_day),
        **totals,
        "net": net,
        "savings_rate": round(net / totals["income"], 4) if totals["income"] > 0 else None,
        "previous": {"income": prev["income"], "spending": prev["spending"],
                     "spending_to_date": prev_to_date["spending"]},
        "inbox_count": db.execute("SELECT COUNT(*) FROM transactions WHERE reviewed = 0").fetchone()[0],
    }
