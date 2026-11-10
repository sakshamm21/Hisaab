"""Financial months.

With a month start day of 1, a period is a calendar month. With 25, the period labelled
"2026-10" runs from 25 Oct to 24 Nov: the label is the month the period starts in, and the
UI always shows the actual dates.
"""

from __future__ import annotations

import sqlite3
from datetime import date, timedelta


def month_start_day(conn: sqlite3.Connection) -> int:
    row = conn.execute("SELECT value FROM settings WHERE key = 'month_start_day'").fetchone()
    try:
        return min(max(int(row[0]), 1), 28) if row else 1
    except ValueError:
        return 1


def _add_months(year: int, month: int, n: int) -> tuple[int, int]:
    index = year * 12 + (month - 1) + n
    return index // 12, index % 12 + 1


def period_of(day: date, start_day: int) -> str:
    """The label of the period containing `day`."""
    year, month = day.year, day.month
    if day.day < start_day:
        year, month = _add_months(year, month, -1)
    return f"{year:04d}-{month:02d}"


def bounds(label: str, start_day: int) -> tuple[date, date]:
    """(first day, first day of the next period) for a label like '2026-10'."""
    year, month = (int(p) for p in label.split("-"))
    start = date(year, month, start_day)
    ny, nm = _add_months(year, month, 1)
    return start, date(ny, nm, start_day)


def shift(label: str, n: int) -> str:
    year, month = (int(p) for p in label.split("-"))
    y, m = _add_months(year, month, n)
    return f"{y:04d}-{m:02d}"


def current(conn: sqlite3.Connection, today: date | None = None) -> str:
    return period_of(today or date.today(), month_start_day(conn))


def describe(label: str, start_day: int, today: date | None = None) -> dict:
    """Everything the UI needs to show a period."""
    today = today or date.today()
    start, end = bounds(label, start_day)
    last = end - timedelta(days=1)
    total_days = (end - start).days
    if today < start:
        elapsed, left = 0, total_days
    elif today >= end:
        elapsed, left = total_days, 0
    else:
        elapsed = (today - start).days + 1
        left = (end - today).days  # including today
    return {
        "period": label,
        "start": start.isoformat(),
        "end": last.isoformat(),
        "days": total_days,
        "days_elapsed": elapsed,
        "days_left": left,
        "is_current": start <= today < end,
        "label": (start.strftime("%B %Y") if start_day == 1
                  else f"{start.day} {start:%b} – {last.day} {last:%b %Y}"),
    }
