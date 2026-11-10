"""Bills & subscriptions, and savings goals."""

from __future__ import annotations

import sqlite3
from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from hisaab import recurring
from hisaab.api.deps import DB

router = APIRouter(tags=["plan"])

# ---- Recurring -------------------------------------------------------------------------------


class RecurringIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    payee: str = ""  # text to spot payments by; defaults to the name
    kind: Literal["bill", "subscription", "income"] = "bill"
    amount: int  # paise, negative for money out
    cadence: Literal["daily", "weekly", "monthly", "yearly"] = "monthly"
    interval: int = Field(default=1, ge=1, le=24)
    next_due: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    category_id: int | None = None
    account_id: int | None = None
    auto_post: bool = False
    notes: str = ""
    active: bool = True


def _item(db: sqlite3.Connection, rid: int) -> dict:
    row = db.execute(
        "SELECT r.*, c.name AS category, c.icon AS category_icon, c.color AS category_color, a.name AS account"
        " FROM recurring r LEFT JOIN categories c ON c.id = r.category_id LEFT JOIN accounts a ON a.id = r.account_id"
        " WHERE r.id = ?", (rid,)).fetchone()
    if not row:
        raise HTTPException(404, "Not found")
    d = dict(row)
    d["monthly_cost"] = recurring.monthly_cost(d["amount"], d["cadence"], d["interval"])
    return d


@router.get("/recurring")
def list_recurring(db: DB) -> dict:
    recurring.sync(db)
    items = [_item(db, r[0]) for r in db.execute("SELECT id FROM recurring ORDER BY active DESC, next_due")]
    active = [i for i in items if i["active"]]
    out_monthly = sum(i["monthly_cost"] for i in active if i["amount"] < 0)
    subs = sum(i["monthly_cost"] for i in active if i["kind"] == "subscription")
    return {"items": items, "totals": {"monthly_out": out_monthly, "yearly_out": out_monthly * 12,
                                       "subscriptions_monthly": subs,
                                       "monthly_in": sum(i["monthly_cost"] for i in active if i["amount"] > 0)}}


@router.get("/recurring/upcoming")
def upcoming(db: DB, days: Annotated[int, Query(ge=1, le=120)] = 30) -> list[dict]:
    recurring.sync(db)
    return recurring.upcoming(db, days)


@router.get("/recurring/detect")
def detect(db: DB) -> list[dict]:
    return recurring.detect(db)


@router.post("/recurring", status_code=201)
def create_recurring(body: RecurringIn, db: DB) -> dict:
    with db:
        rid = db.execute(
            "INSERT INTO recurring (name, payee, match_text, kind, amount, cadence, interval, next_due, category_id,"
            " account_id, auto_post, notes, active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (body.name, body.payee or body.name, body.payee or body.name, body.kind, body.amount, body.cadence,
             body.interval, body.next_due, body.category_id, body.account_id, int(body.auto_post), body.notes,
             int(body.active)),
        ).lastrowid
    return _item(db, rid)


@router.put("/recurring/{rid}")
def update_recurring(rid: int, body: RecurringIn, db: DB) -> dict:
    _item(db, rid)
    with db:
        db.execute(
            "UPDATE recurring SET name = ?, payee = ?, match_text = ?, kind = ?, amount = ?, cadence = ?, interval = ?,"
            " next_due = ?, category_id = ?, account_id = ?, auto_post = ?, notes = ?, active = ? WHERE id = ?",
            (body.name, body.payee or body.name, body.payee or body.name, body.kind, body.amount, body.cadence,
             body.interval, body.next_due, body.category_id, body.account_id, int(body.auto_post), body.notes,
             int(body.active), rid),
        )
    return _item(db, rid)


@router.delete("/recurring/{rid}", status_code=204)
def delete_recurring(rid: int, db: DB) -> None:
    with db:
        db.execute("DELETE FROM recurring WHERE id = ?", (rid,))


class DismissIn(BaseModel):
    payee: str


@router.post("/recurring/dismiss")
def dismiss(body: DismissIn, db: DB) -> dict:
    with db:
        db.execute("INSERT OR IGNORE INTO recurring_dismissed (match_text) VALUES (?)", (body.payee,))
    return {"ok": True}


# ---- Goals -----------------------------------------------------------------------------------


class GoalIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    target_amount: int = Field(gt=0)
    target_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    starting_amount: int = 0
    account_id: int | None = None  # track an account's balance instead of manual contributions
    icon: str = "target"
    color: str = Field(default="#5b45e0", pattern=r"^#[0-9a-fA-F]{6}$")
    notes: str = ""
    archived: bool = False


def _months_between(a: date, b: date) -> float:
    return max((b - a).days / 30.44, 0)


def goal_view(db: sqlite3.Connection, g: sqlite3.Row, today: date | None = None) -> dict:
    today = today or date.today()
    d = dict(g)
    if g["account_id"]:
        row = db.execute("SELECT a.opening_balance + COALESCE(SUM(t.amount), 0) FROM accounts a"
                         " LEFT JOIN transactions t ON t.account_id = a.id AND t.split_parent_id IS NULL"
                         " WHERE a.id = ? GROUP BY a.id", (g["account_id"],)).fetchone()
        saved = row[0] if row else 0
    else:
        saved = g["starting_amount"] + db.execute(
            "SELECT COALESCE(SUM(amount), 0) FROM goal_entries WHERE goal_id = ?", (g["id"],)).fetchone()[0]
    remaining = max(g["target_amount"] - saved, 0)
    d.update(saved=saved, remaining=remaining, progress=min(saved / g["target_amount"], 1) if g["target_amount"] else 0)
    # Average saved per month over the last 3 months, to project a finish date.
    recent = db.execute("SELECT COALESCE(SUM(amount), 0) FROM goal_entries WHERE goal_id = ? AND date >= date(?, '-90 days')",
                        (g["id"], today.isoformat())).fetchone()[0]
    pace = recent / 3 if recent > 0 else 0
    d["pace_per_month"] = round(pace / 100) * 100  # whole rupees
    if g["target_date"]:
        months = _months_between(today, date.fromisoformat(g["target_date"]))
        d["needed_per_month"] = -(-round(remaining / months) // 100) * 100 if months >= 0.5 else remaining
        d["months_left"] = round(months, 1)
        d["on_track"] = remaining == 0 or (pace >= d["needed_per_month"] * 0.95 if pace else None)
    else:
        d["needed_per_month"] = None
        d["months_left"] = None
        d["on_track"] = None
    d["projected_date"] = (
        date.fromordinal(today.toordinal() + round(remaining / pace * 30.44)).isoformat() if pace and remaining else None
    )
    d["entries"] = [dict(e) for e in db.execute(
        "SELECT id, date, amount FROM goal_entries WHERE goal_id = ? ORDER BY date DESC, id DESC LIMIT 20", (g["id"],))]
    return d


@router.get("/goals")
def list_goals(db: DB, include_archived: bool = False) -> list[dict]:
    where = "" if include_archived else "WHERE archived = 0"
    return [goal_view(db, g) for g in db.execute(f"SELECT * FROM goals {where} ORDER BY archived, created_at")]


@router.post("/goals", status_code=201)
def create_goal(body: GoalIn, db: DB) -> dict:
    with db:
        gid = db.execute(
            "INSERT INTO goals (name, target_amount, target_date, starting_amount, account_id, icon, color, notes)"
            " VALUES (?,?,?,?,?,?,?,?)",
            (body.name, body.target_amount, body.target_date, body.starting_amount, body.account_id, body.icon,
             body.color, body.notes),
        ).lastrowid
    return goal_view(db, db.execute("SELECT * FROM goals WHERE id = ?", (gid,)).fetchone())


@router.put("/goals/{gid}")
def update_goal(gid: int, body: GoalIn, db: DB) -> dict:
    with db:
        n = db.execute(
            "UPDATE goals SET name = ?, target_amount = ?, target_date = ?, starting_amount = ?, account_id = ?,"
            " icon = ?, color = ?, notes = ?, archived = ? WHERE id = ?",
            (body.name, body.target_amount, body.target_date, body.starting_amount, body.account_id, body.icon,
             body.color, body.notes, int(body.archived), gid),
        ).rowcount
    if not n:
        raise HTTPException(404, "Goal not found")
    return goal_view(db, db.execute("SELECT * FROM goals WHERE id = ?", (gid,)).fetchone())


@router.delete("/goals/{gid}", status_code=204)
def delete_goal(gid: int, db: DB) -> None:
    with db:
        db.execute("DELETE FROM goals WHERE id = ?", (gid,))


class EntryIn(BaseModel):
    amount: int  # paise; negative to take money out
    date: str = Field(default_factory=lambda: date.today().isoformat(), pattern=r"^\d{4}-\d{2}-\d{2}$")


@router.post("/goals/{gid}/entries", status_code=201)
def add_entry(gid: int, body: EntryIn, db: DB) -> dict:
    g = db.execute("SELECT * FROM goals WHERE id = ?", (gid,)).fetchone()
    if not g:
        raise HTTPException(404, "Goal not found")
    if body.amount == 0:
        raise HTTPException(422, "Amount can't be zero")
    with db:
        db.execute("INSERT INTO goal_entries (goal_id, date, amount) VALUES (?,?,?)", (gid, body.date, body.amount))
    return goal_view(db, g)


@router.delete("/goals/{gid}/entries/{eid}", status_code=204)
def delete_entry(gid: int, eid: int, db: DB) -> None:
    with db:
        db.execute("DELETE FROM goal_entries WHERE id = ? AND goal_id = ?", (eid, gid))
