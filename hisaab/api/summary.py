"""Period summary for the dashboard.

Rules (from the report_tx view): transfers never count; a split counts through its parts;
refunds in an expense category reduce that category's spend; uncategorized money out counts
as spending so nothing is hidden.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Query

from hisaab import periods
from hisaab.api.deps import DB
from hisaab.totals import SPEND, period_totals  # noqa: F401  (re-exported)

router = APIRouter(tags=["summary"])

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
