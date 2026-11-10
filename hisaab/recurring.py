"""Bills, subscriptions and regular income: spotting them, and tracking what's due."""

from __future__ import annotations

import re
import sqlite3
import statistics
from datetime import date, timedelta

CADENCE_DAYS = {"daily": 1, "weekly": 7, "monthly": 30.44, "yearly": 365.25}
MONTHLY_FACTOR = {"daily": 30.44, "weekly": 52 / 12, "monthly": 1, "yearly": 1 / 12}


def add_cadence(day: date, cadence: str, interval: int = 1) -> date:
    if cadence == "daily":
        return day + timedelta(days=interval)
    if cadence == "weekly":
        return day + timedelta(weeks=interval)
    months = interval * (12 if cadence == "yearly" else 1)
    index = day.year * 12 + day.month - 1 + months
    year, month = index // 12, index % 12 + 1
    for d in (day.day, 30, 29, 28):  # 31 Jan + 1 month = 28/29 Feb
        try:
            return date(year, month, d)
        except ValueError:
            continue
    raise ValueError(day)


def monthly_cost(amount: int, cadence: str, interval: int = 1) -> int:
    return round(abs(amount) * MONTHLY_FACTOR[cadence] / interval)


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", text.lower())


def _find_payment(conn: sqlite3.Connection, item: sqlite3.Row, around: date, window: int = 6) -> sqlite3.Row | None:
    """A transaction that looks like this item's payment near `around`."""
    key = item["match_text"] or item["payee"]
    low, high = sorted((abs(item["amount"]) * 0.8, abs(item["amount"]) * 1.25))
    for t in conn.execute(
        "SELECT id, date, amount, payee FROM transactions WHERE transfer_id IS NULL AND split_parent_id IS NULL"
        " AND date BETWEEN ? AND ? AND ABS(amount) BETWEEN ? AND ? AND (amount > 0) = ?"
        " ORDER BY ABS(julianday(date) - julianday(?))",
        ((around - timedelta(days=window)).isoformat(), (around + timedelta(days=window)).isoformat(),
         low, high, int(item["amount"] > 0), around.isoformat()),
    ):
        if _norm(key) and (_norm(key) in _norm(t["payee"]) or _norm(t["payee"]) in _norm(key)):
            return t
    return None


def sync(conn: sqlite3.Connection, today: date | None = None) -> dict:
    """Move each item's due date past payments already made, and auto-post due items that are set to.

    Safe to run any time; it only moves forward.
    """
    today = today or date.today()
    advanced = posted = 0
    with conn:
        for item in conn.execute("SELECT * FROM recurring WHERE active = 1").fetchall():
            due = date.fromisoformat(item["next_due"])
            last_paid = item["last_paid"]
            for _ in range(60):  # never loop forever on bad data
                if due > today + timedelta(days=3):
                    break
                payment = _find_payment(conn, item, due)
                if payment:
                    last_paid = payment["date"]
                elif item["auto_post"] and due <= today and item["account_id"]:
                    conn.execute(
                        "INSERT INTO transactions (account_id, date, amount, payee, category_id, recurring_id, reviewed)"
                        " VALUES (?,?,?,?,?,?,1)",
                        (item["account_id"], due.isoformat(), item["amount"], item["payee"], item["category_id"], item["id"]),
                    )
                    last_paid = due.isoformat()
                    posted += 1
                else:
                    break
                due = add_cadence(due, item["cadence"], item["interval"])
                advanced += 1
            conn.execute("UPDATE recurring SET next_due = ?, last_paid = ? WHERE id = ?",
                         (due.isoformat(), last_paid, item["id"]))
    return {"advanced": advanced, "posted": posted}


def upcoming(conn: sqlite3.Connection, days: int = 30, today: date | None = None) -> list[dict]:
    """Every occurrence due in the next `days` days (and any overdue), soonest first."""
    today = today or date.today()
    out = []
    for item in conn.execute(
        "SELECT r.*, c.name AS category, c.icon AS category_icon, c.color AS category_color"
        " FROM recurring r LEFT JOIN categories c ON c.id = r.category_id WHERE r.active = 1"
    ).fetchall():
        due = date.fromisoformat(item["next_due"])
        while due <= today + timedelta(days=days):
            out.append({
                "recurring_id": item["id"], "name": item["name"] or item["payee"], "amount": item["amount"],
                "date": due.isoformat(), "kind": item["kind"], "category": item["category"],
                "category_icon": item["category_icon"], "category_color": item["category_color"],
                "status": "overdue" if due < today else "today" if due == today else "upcoming",
                "days": (due - today).days,
            })
            due = add_cadence(due, item["cadence"], item["interval"])
    return sorted(out, key=lambda o: o["date"])


def detect(conn: sqlite3.Connection, today: date | None = None) -> list[dict]:
    """Payments that repeat on a regular schedule and aren't tracked yet."""
    today = today or date.today()
    tracked = {_norm(r[0]) for r in conn.execute("SELECT COALESCE(NULLIF(match_text, ''), payee) FROM recurring")}
    dismissed = {_norm(r[0]) for r in conn.execute("SELECT match_text FROM recurring_dismissed")}
    rows = conn.execute(
        "SELECT t.payee, t.date, t.amount, t.category_id, t.account_id, t.raw_description, c.name AS category"
        " FROM transactions t LEFT JOIN categories c ON c.id = t.category_id"
        " WHERE t.transfer_id IS NULL AND t.split_parent_id IS NULL AND t.payee != ''"
        " AND t.date >= ? ORDER BY t.date",
        ((today - timedelta(days=400)).isoformat(),),
    ).fetchall()
    by_payee: dict[str, list[sqlite3.Row]] = {}
    for r in rows:
        by_payee.setdefault(_norm(r["payee"]), []).append(r)

    found = []
    for key, txs in by_payee.items():
        if not key or key in tracked or key in dismissed or len(txs) < 3:
            continue
        # Use the most common amount band: subscriptions repeat a similar amount.
        median = statistics.median(abs(t["amount"]) for t in txs)
        similar = [t for t in txs if abs(abs(t["amount"]) - median) <= max(median * 0.15, 100)]
        if len(similar) < 3:
            continue
        dates = sorted(date.fromisoformat(t["date"]) for t in similar)
        gaps = [(b - a).days for a, b in zip(dates, dates[1:], strict=False) if (b - a).days > 0]
        if len(gaps) < 2:
            continue
        gap = statistics.median(gaps)
        cadence = next((c for c, (lo, hi) in {"weekly": (6, 8), "monthly": (26, 35), "yearly": (350, 380)}.items()
                        if lo <= gap <= hi), None)
        if not cadence:
            continue
        regular = sum(1 for g in gaps if abs(g - gap) <= max(gap * 0.2, 3)) / len(gaps)
        if regular < 0.7:
            continue
        last = dates[-1]
        nxt = add_cadence(last, cadence)
        if (today - last).days > CADENCE_DAYS[cadence] * 1.6:
            continue  # stopped
        sample = similar[-1]
        amount = round(statistics.median(t["amount"] for t in similar))
        mandate = any("MANDATE" in (t["raw_description"] or "").upper() for t in similar)
        kind = "income" if amount > 0 else "subscription" if (mandate or sample["category"] == "Subscriptions") else "bill"
        found.append({
            "payee": sample["payee"], "name": sample["payee"], "amount": amount, "cadence": cadence,
            "next_due": nxt.isoformat(), "last_paid": last.isoformat(), "kind": kind,
            "category_id": sample["category_id"], "category": sample["category"], "account_id": sample["account_id"],
            "occurrences": len(similar), "monthly_cost": monthly_cost(amount, cadence),
        })
    return sorted(found, key=lambda f: -f["monthly_cost"])
