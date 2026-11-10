"""Month summary for the dashboard.

Phase 0 uses calendar months; the financial month (salary-day start) arrives in Phase 2.
Rules: transfers never count; refunds in an expense category reduce that category's spend;
uncategorized money out counts as spending so nothing is hidden.
"""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from hisaab.api.deps import DB

router = APIRouter(tags=["summary"])


def _month_bounds(month: str) -> tuple[str, str]:
    try:
        year, mon = (int(p) for p in month.split("-"))
        start = date(year, mon, 1)
    except ValueError as exc:
        raise HTTPException(422, "month must look like YYYY-MM") from exc
    end = date(year + (mon == 12), mon % 12 + 1, 1)
    return start.isoformat(), end.isoformat()


@router.get("/summary")
def month_summary(
    db: DB, month: Annotated[str | None, Query(pattern=r"^\d{4}-\d{2}$")] = None
) -> dict:
    month = month or date.today().strftime("%Y-%m")
    start, end = _month_bounds(month)
    base = """
        FROM transactions t
        LEFT JOIN categories c ON c.id = t.category_id
        LEFT JOIN category_groups g ON g.id = c.group_id
        WHERE t.date >= ? AND t.date < ? AND t.transfer_id IS NULL
          AND t.exclude_from_reports = 0 AND t.split_parent_id IS NULL
    """
    totals = db.execute(
        f"""
        SELECT
          COALESCE(SUM(CASE WHEN g.kind = 'income' THEN t.amount END), 0) AS income,
          COALESCE(-SUM(CASE WHEN g.kind = 'expense' OR (c.id IS NULL AND t.amount < 0)
                             THEN t.amount END), 0) AS spending,
          COUNT(*) AS transaction_count
        {base}
        """,
        (start, end),
    ).fetchone()
    by_category = db.execute(
        f"""
        SELECT c.id, COALESCE(c.name, 'Uncategorized') AS name,
               COALESCE(c.icon, 'circle-help') AS icon, COALESCE(c.color, '#8b8693') AS color,
               -SUM(t.amount) AS spent, COUNT(*) AS count
        {base} AND (g.kind = 'expense' OR (c.id IS NULL AND t.amount < 0))
        GROUP BY c.id ORDER BY spent DESC
        """,
        (start, end),
    ).fetchall()
    income, spending = totals["income"], totals["spending"]
    net = income - spending
    return {
        "month": month,
        "income": income,
        "spending": spending,
        "net": net,
        "savings_rate": round(net / income, 4) if income > 0 else None,
        "transaction_count": totals["transaction_count"],
        "by_category": [dict(r) for r in by_category],
        "inbox_count": db.execute("SELECT COUNT(*) FROM transactions WHERE reviewed = 0").fetchone()[0],
    }
