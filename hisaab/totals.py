"""Income and spending totals shared by the dashboard, budgets, reports and insights.

Rules (from the report_tx view): transfers never count; a split counts through its parts;
refunds in an expense category reduce that category's spend; uncategorized money out counts
as spending so nothing is hidden.
"""

from __future__ import annotations

import sqlite3

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
