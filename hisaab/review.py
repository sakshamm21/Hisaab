"""Month in review: the facts of a finished month, computed in Python.

The AI (Phase 4) can turn these facts into prose; without AI, `summary_lines` does it with templates.
"""

from __future__ import annotations

import sqlite3
import statistics
from datetime import date, timedelta

from hisaab import periods, recurring
from hisaab.insights import rupees
from hisaab.totals import period_totals


def build(db: sqlite3.Connection, label: str) -> dict:
    start_day = periods.month_start_day(db)
    start, end = periods.bounds(label, start_day)
    info = periods.describe(label, start_day)
    totals = period_totals(db, start.isoformat(), end.isoformat())
    net = totals["income"] - totals["spending"]

    history = []
    for n in (1, 2, 3):
        s, e = periods.bounds(periods.shift(label, -n), start_day)
        history.append(period_totals(db, s.isoformat(), e.isoformat()))
    usual_spend = statistics.median([h["spending"] for h in history]) if history else 0

    by_cat = {c["id"]: c for c in totals["by_category"]}
    hist_cat: dict = {}
    for h in history:
        for c in h["by_category"]:
            hist_cat.setdefault(c["id"], []).append(c["spent"])
    changes = []
    for cid in set(by_cat) | set(hist_cat):
        now = by_cat.get(cid, {}).get("spent", 0)
        past = hist_cat.get(cid, []) + [0] * (3 - len(hist_cat.get(cid, [])))
        usual = statistics.median(past)
        meta = by_cat.get(cid) or next((c for h in history for c in h["by_category"] if c["id"] == cid), {})
        changes.append({"id": cid, "name": meta.get("name", "Uncategorized"), "icon": meta.get("icon"),
                        "color": meta.get("color"), "spent": now, "usual": round(usual), "change": now - round(usual)})
    changes = [c for c in changes if abs(c["change"]) >= 50000]
    up = sorted([c for c in changes if c["change"] > 0], key=lambda c: -c["change"])[:4]
    down = sorted([c for c in changes if c["change"] < 0], key=lambda c: c["change"])[:4]

    budgets = dict(db.execute("SELECT category_id, amount FROM budgets WHERE month = ?", (label,)).fetchall())
    budget_rows = sorted(
        ({"id": cid, "name": by_cat.get(cid, {}).get("name") or db.execute("SELECT name FROM categories WHERE id = ?", (cid,)).fetchone()[0],
          "budget": amt, "spent": by_cat.get(cid, {}).get("spent", 0)} for cid, amt in budgets.items()),
        key=lambda r: r["budget"] - r["spent"],
    )
    over = [r for r in budget_rows if r["spent"] > r["budget"]]

    merchants = [dict(r) for r in db.execute(
        """SELECT payee, -SUM(amount) AS spent, COUNT(*) AS count FROM report_tx
           WHERE date >= ? AND date < ? AND amount < 0 AND payee != '' GROUP BY payee COLLATE NOCASE
           ORDER BY spent DESC LIMIT 5""", (start.isoformat(), end.isoformat()))]
    biggest = [dict(r) for r in db.execute(
        """SELECT t.id, t.payee, t.amount, t.date, c.name AS category FROM report_tx t
           LEFT JOIN categories c ON c.id = t.category_id WHERE t.date >= ? AND t.date < ? AND t.amount < 0
           ORDER BY t.amount LIMIT 5""", (start.isoformat(), end.isoformat()))]
    days_with_spend = db.execute(
        "SELECT COUNT(DISTINCT date) FROM report_tx WHERE date >= ? AND date < ? AND amount < 0",
        (start.isoformat(), end.isoformat())).fetchone()[0]
    goals = [dict(r) for r in db.execute(
        "SELECT g.name, COALESCE(SUM(e.amount), 0) AS added FROM goals g JOIN goal_entries e ON e.goal_id = g.id"
        " WHERE e.date >= ? AND e.date < ? GROUP BY g.id", (start.isoformat(), end.isoformat()))]
    subs = [d for d in recurring.detect(db, end - timedelta(days=1)) if d["kind"] == "subscription"]

    facts = {
        **info, "income": totals["income"], "spending": totals["spending"], "net": net,
        "savings_rate": round(net / totals["income"], 4) if totals["income"] > 0 else None,
        "usual_spending": round(usual_spend), "transaction_count": totals["transaction_count"],
        "top_categories": totals["by_category"][:6], "up": up, "down": down,
        "budgets": {"count": len(budget_rows), "over": over, "rows": budget_rows},
        "top_merchants": merchants, "biggest": biggest, "no_spend_days": info["days"] - days_with_spend,
        "goals": goals, "new_subscriptions": subs[:3],
        "complete": end <= date.today(),
    }
    facts["summary_lines"] = summary_lines(facts)
    facts["suggestions"] = suggestions(facts)
    return facts


def summary_lines(f: dict) -> list[str]:
    lines = []
    if f["income"]:
        rate = f["savings_rate"]
        lines.append(f"{rupees(f['income'])} came in and {rupees(f['spending'])} went out, so you "
                     + (f"kept {rupees(f['net'])} ({round(rate * 100)}%)." if f["net"] >= 0 else f"spent {rupees(-f['net'])} more than came in."))
    else:
        lines.append(f"You spent {rupees(f['spending'])}.")
    if f["usual_spending"]:
        diff = f["spending"] - f["usual_spending"]
        if abs(diff) >= f["usual_spending"] * 0.05:
            lines.append(f"That's {rupees(abs(diff))} {'more' if diff > 0 else 'less'} than a usual month ({rupees(f['usual_spending'])}).")
        else:
            lines.append("That's about what a usual month looks like for you.")
    if f["top_categories"]:
        top = f["top_categories"][0]
        share = round(top["spent"] / f["spending"] * 100) if f["spending"] else 0
        lines.append(f"The biggest share went to {top['name']}: {rupees(top['spent'])}, {share}% of spending.")
    if f["up"]:
        u = f["up"][0]
        lines.append(f"{u['name']} rose the most, {rupees(u['change'])} above your usual {rupees(u['usual'])}.")
    if f["budgets"]["count"]:
        n = len(f["budgets"]["over"])
        lines.append("Every budget held." if n == 0 else f"{n} of {f['budgets']['count']} budgets went over, led by {f['budgets']['over'][0]['name']}.")
    if f["no_spend_days"] >= 3:
        lines.append(f"{f['no_spend_days']} days with no spending at all.")
    return lines


def suggestions(f: dict) -> list[str]:
    out = []
    for o in f["budgets"]["over"][:2]:
        out.append(f"Raise the {o['name']} budget toward {rupees(o['spent'])}, or plan to spend less there.")
    if f["up"] and len(out) < 3:
        u = f["up"][0]
        out.append(f"Look at {u['name']}: cutting back to your usual would free up {rupees(u['change'])} a month.")
    if f["savings_rate"] is not None and f["savings_rate"] < 0.2 and len(out) < 3:
        gap = round(f["income"] * 0.2 - f["net"])
        if gap > 0:
            out.append(f"To save 20% of income you'd need {rupees(gap)} less spending a month.")
    if f["new_subscriptions"] and len(out) < 3:
        out.append(f"Check whether you still use {f['new_subscriptions'][0]['name']}.")
    if not out:
        out.append("Keep the same budgets for next month: they worked.")
    return out[:3]
