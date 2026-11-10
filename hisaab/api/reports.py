"""Reports: trends, cash flow, daily calendar, merchants, comparisons, net worth, tags."""

from __future__ import annotations

import sqlite3
from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, Query

from hisaab import periods
from hisaab.api.deps import DB
from hisaab.totals import SPEND, period_totals

router = APIRouter(prefix="/reports", tags=["reports"])

Period = Annotated[str, Query(pattern=r"^\d{4}-\d{2}$")]
JOIN = """FROM report_tx t LEFT JOIN categories c ON c.id = t.category_id
          LEFT JOIN category_groups g ON g.id = c.group_id"""


def _range(db: sqlite3.Connection, period: str | None, months: int) -> tuple[list[str], int]:
    start_day = periods.month_start_day(db)
    last = period or periods.current(db)
    return [periods.shift(last, -i) for i in range(months - 1, -1, -1)], start_day


@router.get("/trends")
def trends(db: DB, months: Annotated[int, Query(ge=2, le=36)] = 12, period: Period | None = None) -> dict:
    """Income and spending per month, with spending split by category."""
    labels, start_day = _range(db, period, months)
    out = []
    totals_by_cat: dict[int | None, int] = {}
    for label in labels:
        s, e = periods.bounds(label, start_day)
        t = period_totals(db, s.isoformat(), e.isoformat())
        by_cat = {c["id"]: c["spent"] for c in t["by_category"]}
        for k, v in by_cat.items():
            totals_by_cat[k] = totals_by_cat.get(k, 0) + v
        out.append({"period": label, "label": s.strftime("%b %y"), "income": t["income"],
                    "spending": t["spending"], "by_category": by_cat})
    meta = {r["id"]: dict(r) for r in db.execute("SELECT id, name, icon, color FROM categories")}
    ranked = sorted(totals_by_cat.items(), key=lambda kv: -kv[1])
    categories = [{"id": k, "total": v, **(meta.get(k) or {"name": "Uncategorized", "icon": "circle-help",
                                                            "color": "#8b8693"})} for k, v in ranked if v > 0]
    nonzero = [m for m in out if m["spending"]]
    return {"months": out, "categories": categories,
            "average_spending": round(sum(m["spending"] for m in nonzero) / len(nonzero)) if nonzero else 0,
            "average_income": round(sum(m["income"] for m in nonzero) / len(nonzero)) if nonzero else 0}


@router.get("/cashflow")
def cashflow(db: DB, period: Period | None = None, months: Annotated[int, Query(ge=1, le=12)] = 1) -> dict:
    """Sankey data: income sources → this period's money → spending groups → categories (+ saved)."""
    labels, start_day = _range(db, period, months)
    start = periods.bounds(labels[0], start_day)[0]
    end = periods.bounds(labels[-1], start_day)[1]
    rows = db.execute(
        f"""SELECT g.kind, COALESCE(g.name, 'Uncategorized') AS grp, COALESCE(c.name, 'Uncategorized') AS cat,
                   SUM(t.amount) AS total
            {JOIN} WHERE t.date >= ? AND t.date < ? AND (g.kind = 'income' OR {SPEND})
            GROUP BY g.kind, grp, cat""",
        (start.isoformat(), end.isoformat()),
    ).fetchall()
    income = [(r["cat"], r["total"]) for r in rows if r["kind"] == "income" and r["total"] > 0]
    spend = [(r["grp"], r["cat"], -r["total"]) for r in rows if r["kind"] != "income" and r["total"] < 0]
    total_in = sum(v for _, v in income)
    total_out = sum(v for *_, v in spend)

    nodes: list[dict] = []
    index: dict[tuple[str, str], int] = {}

    def node(name: str, kind: str) -> int:
        key = (kind, name)
        if key not in index:
            index[key] = len(nodes)
            nodes.append({"name": name, "kind": kind})
        return index[key]

    links = []
    hub = node("Money in", "hub")
    for name, v in sorted(income, key=lambda x: -x[1]):
        links.append({"source": node(name, "income"), "target": hub, "value": v})
    if total_out > total_in:
        links.append({"source": node("From savings", "income"), "target": hub, "value": total_out - total_in})
    groups: dict[str, int] = {}
    for grp, _, v in spend:
        groups[grp] = groups.get(grp, 0) + v
    for grp, v in sorted(groups.items(), key=lambda x: -x[1]):
        links.append({"source": hub, "target": node(grp, "group"), "value": v})
    for grp, cat, v in sorted(spend, key=lambda x: -x[2]):
        if cat != grp:
            links.append({"source": node(grp, "group"), "target": node(cat, "category"), "value": v})
    if total_in > total_out:
        links.append({"source": hub, "target": node("Saved", "saved"), "value": total_in - total_out})
    return {"start": start.isoformat(), "end": (end - timedelta(days=1)).isoformat(), "income": total_in,
            "spending": total_out, "nodes": nodes, "links": links}


@router.get("/calendar")
def calendar(db: DB, months: Annotated[int, Query(ge=1, le=12)] = 3, period: Period | None = None) -> dict:
    """Spending per day."""
    labels, start_day = _range(db, period, months)
    start = periods.bounds(labels[0], start_day)[0]
    end = periods.bounds(labels[-1], start_day)[1]
    rows = db.execute(
        f"""SELECT t.date, -SUM(t.amount) AS spent, COUNT(*) AS n {JOIN}
            WHERE t.date >= ? AND t.date < ? AND {SPEND} GROUP BY t.date""",
        (start.isoformat(), end.isoformat()),
    )
    days = {r["date"]: {"spent": r["spent"], "count": r["n"]} for r in rows}
    weekday = [0] * 7
    for d, v in days.items():
        weekday[date.fromisoformat(d).weekday()] += v["spent"]
    n_days = (end - start).days
    return {"start": start.isoformat(), "end": (end - timedelta(days=1)).isoformat(), "days": days,
            "by_weekday": [round(w / max(n_days / 7, 1)) for w in weekday],
            "max": max((v["spent"] for v in days.values()), default=0)}


@router.get("/merchants")
def merchants(db: DB, months: Annotated[int, Query(ge=1, le=36)] = 3, period: Period | None = None,
              limit: Annotated[int, Query(le=100)] = 25, category_id: int | None = None) -> dict:
    labels, start_day = _range(db, period, months)
    start = periods.bounds(labels[0], start_day)[0]
    end = periods.bounds(labels[-1], start_day)[1]
    extra, params = "", [start.isoformat(), end.isoformat()]
    if category_id:
        extra = " AND t.category_id = ?"
        params.append(category_id)
    rows = db.execute(
        f"""SELECT t.payee, -SUM(t.amount) AS spent, COUNT(*) AS count, MAX(t.date) AS last,
                   MAX(c.name) AS category, MAX(c.icon) AS icon, MAX(c.color) AS color,
                   SUM(t.is_person) > 0 AS is_person
            {JOIN} WHERE t.date >= ? AND t.date < ? AND {SPEND}{extra}
            GROUP BY t.payee COLLATE NOCASE HAVING spent > 0 ORDER BY spent DESC LIMIT ?""",
        (*params, limit),
    )
    items = [dict(r) | {"average": r["spent"] // r["count"]} for r in rows]
    return {"start": start.isoformat(), "end": (end - timedelta(days=1)).isoformat(), "items": items}


@router.get("/compare")
def compare(db: DB, a: Period, b: Period) -> dict:
    start_day = periods.month_start_day(db)
    out = {}
    for key, label in (("a", a), ("b", b)):
        s, e = periods.bounds(label, start_day)
        out[key] = period_totals(db, s.isoformat(), e.isoformat()) | periods.describe(label, start_day)
    cats: dict = {}
    for key in ("a", "b"):
        for c in out[key]["by_category"]:
            row = cats.setdefault(c["id"], {"id": c["id"], "name": c["name"], "icon": c["icon"], "color": c["color"],
                                            "a": 0, "b": 0})
            row[key] = c["spent"]
    rows = sorted(cats.values(), key=lambda r: -abs(r["b"] - r["a"]))
    for r in rows:
        r["change"] = r["b"] - r["a"]
    return {"a": {k: out["a"][k] for k in ("period", "label", "income", "spending")},
            "b": {k: out["b"][k] for k in ("period", "label", "income", "spending")}, "categories": rows}


@router.get("/networth")
def networth(db: DB, months: Annotated[int, Query(ge=2, le=36)] = 12) -> dict:
    """Total of account balances at the end of each month."""
    labels, start_day = _range(db, None, months)
    accounts = db.execute("SELECT id, opening_balance, opening_date FROM accounts WHERE include_in_net_worth = 1").fetchall()
    points = []
    for label in labels:
        end = periods.bounds(label, start_day)[1]
        assets = debts = 0
        for a in accounts:
            if a["opening_date"] >= end.isoformat():
                continue
            bal = a["opening_balance"] + db.execute(
                "SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE account_id = ? AND date < ?"
                " AND split_parent_id IS NULL", (a["id"], end.isoformat())).fetchone()[0]
            if bal >= 0:
                assets += bal
            else:
                debts += bal
        points.append({"period": label, "label": periods.bounds(label, start_day)[0].strftime("%b %y"),
                       "assets": assets, "debts": debts, "net": assets + debts})
    return {"points": points}


@router.get("/category/{category_id}")
def category_report(category_id: Annotated[int, Path()], db: DB, months: Annotated[int, Query(ge=2, le=36)] = 12) -> dict:
    c = db.execute("SELECT c.*, g.kind FROM categories c JOIN category_groups g ON g.id = c.group_id WHERE c.id = ?",
                   (category_id,)).fetchone()
    if not c:
        raise HTTPException(404, "Category not found")
    labels, start_day = _range(db, None, months)
    sign = 1 if c["kind"] == "income" else -1
    series = []
    for label in labels:
        s, e = periods.bounds(label, start_day)
        v = db.execute("SELECT COALESCE(SUM(amount), 0) FROM report_tx WHERE category_id = ? AND date >= ? AND date < ?",
                       (category_id, s.isoformat(), e.isoformat())).fetchone()[0]
        series.append({"period": label, "label": s.strftime("%b %y"), "total": v * sign})
    budget = db.execute("SELECT amount FROM budgets WHERE category_id = ? AND month = ?",
                        (category_id, labels[-1])).fetchone()
    return {"category": dict(c), "months": series, "budget": budget[0] if budget else None,
            "merchants": merchants(db, months=months, limit=10, category_id=category_id)["items"]}


@router.get("/tags")
def tag_report(db: DB) -> list[dict]:
    out: dict[str, dict] = {}
    for r in db.execute("SELECT tags, amount, date FROM report_tx WHERE tags != ''"):
        for tag in r["tags"].split():
            e = out.setdefault(tag, {"tag": tag, "spent": 0, "income": 0, "count": 0, "first": r["date"], "last": r["date"]})
            if r["amount"] < 0:
                e["spent"] -= r["amount"]
            else:
                e["income"] += r["amount"]
            e["count"] += 1
            e["first"], e["last"] = min(e["first"], r["date"]), max(e["last"], r["date"])
    return sorted(out.values(), key=lambda e: -e["spent"])
