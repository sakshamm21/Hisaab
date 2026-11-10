"""The insights engine: plain Python, offline, always on.

Each check looks at your own history and says something only when it matters.
"""

from __future__ import annotations

import sqlite3
import statistics
from datetime import date, timedelta

from hisaab import periods, recurring
from hisaab.money import from_minor
from hisaab.totals import SPEND, period_totals


def rupees(paise: int) -> str:
    """₹1,23,456 (Indian grouping, no paise) for sentences."""
    value = int(abs(from_minor(paise)).to_integral_value())
    s = str(value)
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        s = ",".join(groups) + "," + tail
    return f"₹{s}"


def _spent_by_cat(db: sqlite3.Connection, start: date, end: date) -> dict[int | None, int]:
    rows = db.execute(
        f"""SELECT t.category_id, -SUM(t.amount) AS spent FROM report_tx t
            LEFT JOIN categories c ON c.id = t.category_id LEFT JOIN category_groups g ON g.id = c.group_id
            WHERE t.date >= ? AND t.date < ? AND {SPEND} GROUP BY t.category_id""",
        (start.isoformat(), end.isoformat()),
    )
    return {r[0]: r[1] for r in rows}


def forecast(db: sqlite3.Connection, today: date | None = None) -> dict:
    """Where this month is heading: spending so far + bills still due + everyday spending at your pace."""
    today = today or date.today()
    start_day = periods.month_start_day(db)
    label = periods.period_of(today, start_day)
    start, end = periods.bounds(label, start_day)
    info = periods.describe(label, start_day, today)
    totals = period_totals(db, start.isoformat(), min(end, today + timedelta(days=1)).isoformat())
    recurring_payees = [r[0] for r in db.execute("SELECT COALESCE(NULLIF(match_text, ''), payee) FROM recurring WHERE active = 1")]
    bills_paid = 0
    if recurring_payees:
        marks = ",".join("?" * len(recurring_payees))
        bills_paid = -db.execute(
            f"SELECT COALESCE(SUM(amount), 0) FROM report_tx WHERE amount < 0 AND date >= ? AND date <= ?"
            f" AND payee COLLATE NOCASE IN ({marks})", (start.isoformat(), today.isoformat(), *recurring_payees),
        ).fetchone()[0]
    everyday = max(totals["spending"] - bills_paid, 0)
    elapsed = max(info["days_elapsed"], 1)
    remaining_days = max((end - today).days - 1, 0)
    bills_due = -sum(u["amount"] for u in recurring.upcoming(db, (end - today).days - 1, today)
                     if u["amount"] < 0 and u["date"] > today.isoformat() and u["date"] < end.isoformat())
    income_due = sum(u["amount"] for u in recurring.upcoming(db, (end - today).days - 1, today)
                     if u["amount"] > 0 and u["date"] > today.isoformat() and u["date"] < end.isoformat())
    projected = totals["spending"] + bills_due + round(everyday / elapsed * remaining_days)
    income = totals["income"] + income_due
    return {"period": label, "spent_so_far": totals["spending"], "bills_due": bills_due,
            "everyday_per_day": round(everyday / elapsed), "projected_spending": projected,
            "projected_income": income, "projected_net": income - projected,
            "projected_savings_rate": round((income - projected) / income, 4) if income > 0 else None}


def generate(db: sqlite3.Connection, today: date | None = None) -> list[dict]:
    today = today or date.today()
    start_day = periods.month_start_day(db)
    label = periods.period_of(today, start_day)
    start, end = periods.bounds(label, start_day)
    info = periods.describe(label, start_day, today)
    elapsed, total_days = max(info["days_elapsed"], 1), info["days"]
    progress = elapsed / total_days
    names = {r["id"]: r["name"] for r in db.execute("SELECT id, name FROM categories")}
    out: list[dict] = []

    now = _spent_by_cat(db, start, today + timedelta(days=1))
    budgets = dict(db.execute("SELECT category_id, amount FROM budgets WHERE month = ?", (label,)).fetchall())

    # 1. Over budget, or heading there at this pace (only once a week of data is in).
    for cid, budget in budgets.items():
        spent = now.get(cid, 0)
        name = names.get(cid, "A category")
        if spent > budget:
            out.append({"kind": "over_budget", "severity": "warn", "title": f"{name} is over budget",
                        "body": f"{rupees(spent)} spent of {rupees(budget)}, {rupees(spent - budget)} over.",
                        "link": f"/transactions?category={cid}&from={start}&to={today}", "weight": 90})
        elif elapsed >= 7 and progress < 0.9 and spent > 0:
            # Pace only means something for everyday spending: several payments, none dominating.
            # (Rent paid once on the 3rd is not "running fast".)
            count, biggest = db.execute(
                "SELECT COUNT(*), COALESCE(MAX(-amount), 0) FROM report_tx WHERE category_id = ? AND amount < 0"
                " AND date >= ? AND date <= ?", (cid, start.isoformat(), today.isoformat())).fetchone()
            if count < 4 or biggest > spent * 0.5:
                continue
            projected = spent / progress
            if projected > budget * 1.1 and projected - budget > 50000:
                out.append({"kind": "budget_pace", "severity": "warn", "title": f"{name} is running fast",
                            "body": f"At this pace it ends near {rupees(round(projected))}, about "
                                    f"{rupees(round(projected - budget))} over its {rupees(budget)} budget.",
                            "link": "/budget", "weight": 70})

    # 2. Unusual spending: this month so far vs the same point in the last 3 months.
    if elapsed >= 5:
        history: dict[int | None, list[int]] = {}
        for n in (1, 2, 3):
            ps, pe = periods.bounds(periods.shift(label, -n), start_day)
            same_point = min(ps + timedelta(days=elapsed), pe)
            for cid, v in _spent_by_cat(db, ps, same_point).items():
                history.setdefault(cid, []).append(v)
        for cid, spent in now.items():
            if cid is None or cid in budgets:
                continue
            past = history.get(cid, []) + [0] * (3 - len(history.get(cid, [])))
            usual = statistics.median(past)
            if usual > 0 and spent > usual * 1.4 and spent - usual > 100000:
                pct = round((spent / usual - 1) * 100)
                out.append({"kind": "unusual", "severity": "info", "title": f"More on {names.get(cid, 'something')} than usual",
                            "body": f"{rupees(spent)} so far, {pct}% more than you usually spend by this point ({rupees(round(usual))}).",
                            "link": f"/transactions?category={cid}&from={start}&to={today}", "weight": 60})

    # 3. Subscriptions: new ones spotted, and price rises on tracked ones.
    for d in recurring.detect(db, today):
        if d["kind"] == "subscription":
            out.append({"kind": "new_subscription", "severity": "info", "title": f"New subscription? {d['name']}",
                        "body": f"{rupees(d['amount'])} every {d['cadence'][:-2] if d['cadence'] != 'daily' else 'day'}, "
                                f"seen {d['occurrences']} times. Track it to see it coming.",
                        "link": "/bills", "weight": 50})
    for item in db.execute("SELECT * FROM recurring WHERE active = 1 AND last_paid IS NOT NULL AND amount < 0"):
        paid = db.execute("SELECT amount FROM transactions WHERE date = ? AND payee LIKE ? AND amount < 0 LIMIT 1",
                          (item["last_paid"], f"%{item['match_text'] or item['payee']}%")).fetchone()
        if paid and -paid[0] > -item["amount"] * 1.05:
            out.append({"kind": "price_rise", "severity": "warn", "title": f"{item['name']} costs more now",
                        "body": f"Last payment was {rupees(paid[0])}, up from {rupees(item['amount'])}.",
                        "link": "/bills", "weight": 65})

    # 4. Large one-offs and possible duplicates in the last 30 days.
    window = (today - timedelta(days=30)).isoformat()
    for t in db.execute(
        f"""SELECT t.id, t.payee, t.amount, t.date, t.category_id FROM report_tx t
            LEFT JOIN categories c ON c.id = t.category_id LEFT JOIN category_groups g ON g.id = c.group_id
            WHERE t.date >= ? AND t.amount <= -500000 AND {SPEND} ORDER BY t.amount LIMIT 3""", (window,)):
        typical = db.execute("SELECT AVG(-amount) FROM report_tx WHERE category_id IS ? AND amount < 0 AND date < ?",
                             (t["category_id"], window)).fetchone()[0] or 0
        if -t["amount"] > max(typical * 4, 500000) and t["payee"] not in {r[0] for r in db.execute("SELECT payee FROM recurring")}:
            out.append({"kind": "large", "severity": "info", "title": f"Big one: {rupees(t['amount'])} at {t['payee'] or 'unknown'}",
                        "body": f"On {date.fromisoformat(t['date']):%d %b}. Mark it 'leave out of reports' if it was a one-off you'll be paid back for.",
                        "link": f"/transactions?q={t['payee']}", "weight": 40})
    for d in db.execute(
        """SELECT a.id, a.payee, a.amount, a.date FROM transactions a JOIN transactions b
           ON b.account_id = a.account_id AND b.amount = a.amount AND b.payee = a.payee AND b.id > a.id
           AND ABS(julianday(a.date) - julianday(b.date)) <= 1
           WHERE a.date >= ? AND a.transfer_id IS NULL AND a.amount <= -50000 AND a.split_parent_id IS NULL
           AND (a.reference = '' OR a.reference != b.reference) LIMIT 2""", (window,)):
        out.append({"kind": "duplicate", "severity": "warn", "title": f"Charged twice? {d['payee']}",
                    "body": f"Two payments of {rupees(d['amount'])} a day apart around {date.fromisoformat(d['date']):%d %b}.",
                    "link": f"/transactions?q={d['payee']}", "weight": 80})

    # 5. Where the month is heading.
    if elapsed >= 5 and info["days_left"] > 2:
        f = forecast(db, today)
        if f["projected_income"] > 0:
            rate = f["projected_savings_rate"] or 0
            if rate >= 0.2:
                out.append({"kind": "forecast", "severity": "good", "title": f"On track to save {round(rate * 100)}%",
                            "body": f"About {rupees(f['projected_net'])} left at month end if spending keeps this pace.",
                            "link": "/budget", "weight": 30})
            elif f["projected_net"] < 0:
                out.append({"kind": "forecast", "severity": "warn", "title": "Heading for a shortfall",
                            "body": f"At this pace you'll spend about {rupees(-f['projected_net'])} more than comes in this month.",
                            "link": "/budget", "weight": 85})
            else:
                out.append({"kind": "forecast", "severity": "info", "title": f"Saving {round(rate * 100)}% this month",
                            "body": f"About {rupees(f['projected_net'])} left at month end at this pace. "
                                    "20% is a good target.",
                            "link": "/budget", "weight": 30})

    out.sort(key=lambda i: -i["weight"])
    for i, item in enumerate(out):
        item["id"] = f"{item['kind']}-{i}"
    return out
