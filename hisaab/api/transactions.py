"""Transactions: list with filters, add (incl. quick add and transfers), edit, bulk edit, delete."""

from __future__ import annotations

import re
import sqlite3
import uuid
from datetime import date, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from hisaab.api.deps import DB
from hisaab.categorize import learn, suggest
from hisaab.money import to_minor

router = APIRouter(tags=["transactions"])

SELECT = """
    SELECT t.id, t.date, t.amount, t.payee, t.raw_description, t.notes, t.tags, t.status,
           t.transfer_id, t.transfer_id IS NOT NULL AS is_transfer, t.reviewed, t.is_person,
           t.exclude_from_reports, t.import_id, t.split_parent_id,
           (SELECT COUNT(*) FROM transactions s WHERE s.split_parent_id = t.id) AS split_count,
           a.id AS account_id, a.name AS account,
           c.id AS category_id, c.name AS category, c.icon AS category_icon, c.color AS category_color,
           (SELECT o.account_id FROM transactions o WHERE o.transfer_id = t.transfer_id AND o.id != t.id)
             AS transfer_account_id,
           (SELECT oa.name FROM transactions o JOIN accounts oa ON oa.id = o.account_id
             WHERE o.transfer_id = t.transfer_id AND o.id != t.id) AS transfer_account
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    LEFT JOIN categories c ON c.id = t.category_id
"""


def get_transaction(db: sqlite3.Connection, tid: int) -> dict:
    row = db.execute(f"{SELECT} WHERE t.id = ?", (tid,)).fetchone()
    if not row:
        raise HTTPException(404, "Transaction not found")
    return dict(row)


@router.get("/transactions")
def list_transactions(
    db: DB,
    limit: Annotated[int, Query(ge=1, le=1000)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    inbox: bool = False,
    q: str = "",
    account_id: int | None = None,
    category_id: Annotated[list[int] | None, Query()] = None,
    uncategorized: bool = False,
    date_from: str | None = None,
    date_to: str | None = None,
    min_amount: int | None = None,  # paise, compared with the absolute amount
    max_amount: int | None = None,
    direction: Literal["in", "out"] | None = None,
    tag: str | None = None,
    import_id: int | None = None,
) -> dict:
    where = ["t.split_parent_id IS NULL"]
    params: list = []
    if inbox:
        where.append("t.reviewed = 0")
    if q:
        where.append("(t.payee LIKE ? OR t.raw_description LIKE ? OR t.notes LIKE ? OR c.name LIKE ?)")
        params += [f"%{q}%"] * 4
    if account_id:
        where.append("t.account_id = ?")
        params.append(account_id)
    if category_id:
        where.append(f"(t.category_id IN ({','.join('?' * len(category_id))})"
                     f" OR t.id IN (SELECT split_parent_id FROM transactions"
                     f" WHERE category_id IN ({','.join('?' * len(category_id))})))")
        params += category_id * 2
    if uncategorized:
        where.append("t.category_id IS NULL AND t.transfer_id IS NULL AND t.id NOT IN"
                     " (SELECT split_parent_id FROM transactions WHERE split_parent_id IS NOT NULL)")
    if date_from:
        where.append("t.date >= ?")
        params.append(date_from)
    if date_to:
        where.append("t.date <= ?")
        params.append(date_to)
    if min_amount is not None:
        where.append("ABS(t.amount) >= ?")
        params.append(min_amount)
    if max_amount is not None:
        where.append("ABS(t.amount) <= ?")
        params.append(max_amount)
    if direction:
        where.append("t.amount > 0" if direction == "in" else "t.amount < 0")
    if tag:
        where.append("(' ' || t.tags || ' ') LIKE ?")
        params.append(f"% {tag.lstrip('#')} %")
    if import_id:
        where.append("t.import_id = ?")
        params.append(import_id)
    clause = " AND ".join(where)
    base_from = "FROM transactions t LEFT JOIN categories c ON c.id = t.category_id"
    total, net = db.execute(f"SELECT COUNT(*), COALESCE(SUM(t.amount), 0) {base_from} WHERE {clause}", params).fetchone()
    rows = db.execute(f"{SELECT} WHERE {clause} ORDER BY t.date DESC, t.id DESC LIMIT ? OFFSET ?",
                      (*params, limit, offset))
    return {"total": total, "net": net, "items": [dict(r) for r in rows]}


@router.get("/transactions/{tid}")
def read_transaction(tid: int, db: DB) -> dict:
    item = get_transaction(db, tid)
    item["splits"] = [dict(r) for r in db.execute(
        "SELECT t.id, t.amount, t.category_id, t.notes, c.name AS category, c.icon AS category_icon,"
        " c.color AS category_color FROM transactions t LEFT JOIN categories c ON c.id = t.category_id"
        " WHERE t.split_parent_id = ? ORDER BY t.id", (tid,))]
    return item


class TransactionIn(BaseModel):
    account_id: int
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    amount: int  # paise; negative = money out
    payee: str = ""
    category_id: int | None = None
    notes: str = ""
    tags: str = ""
    transfer_account_id: int | None = None  # set to record a transfer to/from another account


def _check_account(db: sqlite3.Connection, account_id: int) -> None:
    if not db.execute("SELECT 1 FROM accounts WHERE id = ?", (account_id,)).fetchone():
        raise HTTPException(422, f"Account {account_id} doesn't exist")


def _tags(text: str) -> str:
    return " ".join(dict.fromkeys(t.lstrip("#").lower() for t in text.split() if t.strip("#")))


@router.post("/transactions", status_code=201)
def create_transaction(body: TransactionIn, db: DB) -> dict:
    _check_account(db, body.account_id)
    if body.amount == 0:
        raise HTTPException(422, "Amount can't be zero")
    with db:
        if body.transfer_account_id:
            _check_account(db, body.transfer_account_id)
            if body.transfer_account_id == body.account_id:
                raise HTTPException(422, "A transfer needs two different accounts")
            tid = uuid.uuid4().hex
            first = db.execute(
                "INSERT INTO transactions (account_id, date, amount, payee, notes, tags, transfer_id)"
                " VALUES (?,?,?,?,?,?,?)",
                (body.account_id, body.date, body.amount, body.payee or "Transfer", body.notes, _tags(body.tags), tid),
            ).lastrowid
            db.execute(
                "INSERT INTO transactions (account_id, date, amount, payee, notes, tags, transfer_id)"
                " VALUES (?,?,?,?,?,?,?)",
                (body.transfer_account_id, body.date, -body.amount, body.payee or "Transfer", body.notes,
                 _tags(body.tags), tid),
            )
            return get_transaction(db, first)
        new_id = db.execute(
            "INSERT INTO transactions (account_id, date, amount, payee, category_id, notes, tags)"
            " VALUES (?,?,?,?,?,?,?)",
            (body.account_id, body.date, body.amount, body.payee.strip(), body.category_id, body.notes,
             _tags(body.tags)),
        ).lastrowid
        learn(db, body.payee.strip(), body.category_id)
    return get_transaction(db, new_id)


class TransactionPatch(BaseModel):
    date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    amount: int | None = None
    payee: str | None = None
    category_id: int | None = None
    clear_category: bool = False
    notes: str | None = None
    tags: str | None = None
    account_id: int | None = None
    reviewed: bool | None = None
    exclude_from_reports: bool | None = None
    # Turn a normal transaction into a transfer with this account (or undo with transfer_account_id=0).
    transfer_account_id: int | None = None


@router.patch("/transactions/{tid}")
def update_transaction(tid: int, body: TransactionPatch, db: DB) -> dict:
    current = get_transaction(db, tid)
    fields: dict = {}
    for key in ("date", "payee", "notes", "account_id"):
        value = getattr(body, key)
        if value is not None:
            fields[key] = value.strip() if isinstance(value, str) else value
    if body.amount is not None:
        if body.amount == 0:
            raise HTTPException(422, "Amount can't be zero")
        fields["amount"] = body.amount
    if body.tags is not None:
        fields["tags"] = _tags(body.tags)
    if body.category_id is not None or body.clear_category:
        fields["category_id"] = None if body.clear_category else body.category_id
        fields.setdefault("reviewed", 1)
    if body.reviewed is not None:
        fields["reviewed"] = int(body.reviewed)
    if body.exclude_from_reports is not None:
        fields["exclude_from_reports"] = int(body.exclude_from_reports)
    if "account_id" in fields:
        _check_account(db, fields["account_id"])

    with db:
        if fields:
            sets = ", ".join(f"{k} = ?" for k in fields)
            db.execute(f"UPDATE transactions SET {sets}, updated_at = datetime('now') WHERE id = ?",
                       (*fields.values(), tid))
        # Keep both sides of a transfer in step.
        if current["transfer_id"] and any(k in fields for k in ("date", "amount", "payee", "notes")):
            mirror = {k: (-v if k == "amount" else v) for k, v in fields.items() if k in ("date", "amount", "payee", "notes")}
            sets = ", ".join(f"{k} = ?" for k in mirror)
            db.execute(f"UPDATE transactions SET {sets} WHERE transfer_id = ? AND id != ?",
                       (*mirror.values(), current["transfer_id"], tid))
        if body.transfer_account_id is not None:
            _set_transfer(db, current, body.transfer_account_id)
        if fields.get("category_id"):
            learn(db, fields.get("payee", current["payee"]), fields["category_id"])
    return get_transaction(db, tid)


def _set_transfer(db: sqlite3.Connection, current: dict, other_account: int) -> None:
    if current["transfer_id"]:  # remove the other side first
        db.execute("DELETE FROM transactions WHERE transfer_id = ? AND id != ?", (current["transfer_id"], current["id"]))
        db.execute("UPDATE transactions SET transfer_id = NULL WHERE id = ?", (current["id"],))
    if other_account:
        _check_account(db, other_account)
        if other_account == current["account_id"]:
            raise HTTPException(422, "A transfer needs two different accounts")
        tid = uuid.uuid4().hex
        row = db.execute("SELECT * FROM transactions WHERE id = ?", (current["id"],)).fetchone()
        db.execute("UPDATE transactions SET transfer_id = ?, category_id = NULL, reviewed = 1 WHERE id = ?",
                   (tid, current["id"]))
        db.execute(
            "INSERT INTO transactions (account_id, date, amount, payee, raw_description, transfer_id, reviewed)"
            " VALUES (?,?,?,?,?,?,1)",
            (other_account, row["date"], -row["amount"], row["payee"], row["raw_description"], tid),
        )


@router.delete("/transactions/{tid}", status_code=204)
def delete_transaction(tid: int, db: DB) -> None:
    current = get_transaction(db, tid)
    with db:
        if current["transfer_id"]:
            db.execute("DELETE FROM transactions WHERE transfer_id = ?", (current["transfer_id"],))
        else:
            db.execute("DELETE FROM transactions WHERE id = ?", (tid,))


class BulkPatch(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=5000)
    category_id: int | None = None
    reviewed: bool | None = None
    exclude_from_reports: bool | None = None
    add_tag: str | None = None
    delete: bool = False


@router.post("/transactions/bulk")
def bulk_update(body: BulkPatch, db: DB) -> dict:
    marks = ",".join("?" * len(body.ids))
    with db:
        if body.delete:
            n = db.execute(
                f"DELETE FROM transactions WHERE id IN ({marks}) OR transfer_id IN"
                f" (SELECT transfer_id FROM transactions WHERE id IN ({marks}) AND transfer_id IS NOT NULL)",
                (*body.ids, *body.ids),
            ).rowcount
            return {"updated": n}
        sets, params = [], []
        if body.category_id is not None:
            sets += ["category_id = ?", "reviewed = 1"]
            params.append(body.category_id)
        if body.reviewed is not None:
            sets.append("reviewed = ?")
            params.append(int(body.reviewed))
        if body.exclude_from_reports is not None:
            sets.append("exclude_from_reports = ?")
            params.append(int(body.exclude_from_reports))
        if body.add_tag:
            tag = body.add_tag.lstrip("#").lower().strip()
            sets.append("tags = TRIM(CASE WHEN (' ' || tags || ' ') LIKE ? THEN tags ELSE tags || ' ' || ? END)")
            params += [f"% {tag} %", tag]
        if not sets:
            return {"updated": 0}
        only_spending = " AND transfer_id IS NULL" if body.category_id is not None else ""
        n = db.execute(f"UPDATE transactions SET {', '.join(sets)}, updated_at = datetime('now')"
                       f" WHERE id IN ({marks}){only_spending}", (*params, *body.ids)).rowcount
        if body.category_id:
            for (payee,) in db.execute(f"SELECT DISTINCT payee FROM transactions WHERE id IN ({marks})", body.ids):
                learn(db, payee, body.category_id)
    return {"updated": n}


class SplitIn(BaseModel):
    parts: list[dict]  # [{amount, category_id, notes}] — amounts must add up to the parent's


@router.put("/transactions/{tid}/splits")
def set_splits(tid: int, body: SplitIn, db: DB) -> dict:
    parent = get_transaction(db, tid)
    if parent["transfer_id"]:
        raise HTTPException(422, "Transfers can't be split")
    with db:
        db.execute("DELETE FROM transactions WHERE split_parent_id = ?", (tid,))
        if body.parts:
            total = sum(int(p["amount"]) for p in body.parts)
            if total != parent["amount"]:
                raise HTTPException(422, "The parts must add up to the transaction amount")
            for p in body.parts:
                db.execute(
                    "INSERT INTO transactions (account_id, date, amount, payee, category_id, notes, split_parent_id)"
                    " VALUES (?,?,?,?,?,?,?)",
                    (parent["account_id"], parent["date"], int(p["amount"]), parent["payee"],
                     p.get("category_id"), p.get("notes", ""), tid),
                )
            db.execute("UPDATE transactions SET category_id = NULL, reviewed = 1 WHERE id = ?", (tid,))
    return read_transaction(tid, db)


# ---- Quick add -------------------------------------------------------------------------------

_AMOUNT = re.compile(r"(?<![\w.])([+-]?)(?:₹|rs\.?|inr)?\s?(\d[\d,]*(?:\.\d{1,2})?)(k)?(?![\w])", re.I)
_INCOME_WORDS = re.compile(r"\b(salary|received|got|refund|cashback|income|credited)\b", re.I)


class QuickAddIn(BaseModel):
    text: str = Field(min_length=1, max_length=200)


@router.post("/quick-add/parse")
def quick_add_parse(body: QuickAddIn, db: DB) -> dict:
    """'450 zomato yesterday #friends' → amount, payee, date, category guess, tags."""
    text = body.text.strip()
    tags = [t[1:] for t in re.findall(r"#[\w-]+", text)]
    text = re.sub(r"#[\w-]+", "", text)

    day = date.today()
    if re.search(r"\byesterday\b", text, re.I):
        day -= timedelta(days=1)
        text = re.sub(r"\byesterday\b", "", text, flags=re.I)
    text = re.sub(r"\btoday\b", "", text, flags=re.I)
    if m := re.search(r"\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b", text):
        try:
            year = int(m.group(3)) if m.group(3) else day.year
            year += 2000 if year < 100 else 0
            day = date(year, int(m.group(2)), int(m.group(1)))
            text = text.replace(m.group(0), "")
        except ValueError:
            pass

    amount = None
    if m := _AMOUNT.search(text):
        value = to_minor(m.group(2)) * (1000 if m.group(3) else 1)
        income = m.group(1) == "+" or bool(_INCOME_WORDS.search(text))
        amount = value if income else -value
        text = text[: m.start()] + text[m.end():]
    payee = re.sub(r"\s+", " ", re.sub(r"\b(on|for|at|to|paid|spent)\b", "", text, flags=re.I)).strip(" ,-")
    payee = payee[:1].upper() + payee[1:] if payee else ""
    guess = suggest(db, payee, payee, amount or -1)
    return {"amount": amount, "payee": guess.payee or payee, "date": day.isoformat(),
            "category_id": guess.category_id, "tags": " ".join(tags)}


@router.get("/payees")
def payees(db: DB, q: str = "", limit: Annotated[int, Query(le=50)] = 10) -> list[dict]:
    rows = db.execute(
        "SELECT t.payee, COUNT(*) AS n, MAX(t.date) AS last,"
        " (SELECT category_id FROM payee_memory m WHERE m.payee = t.payee) AS category_id"
        " FROM transactions t WHERE t.payee LIKE ? AND t.payee != '' AND t.transfer_id IS NULL"
        " GROUP BY t.payee COLLATE NOCASE ORDER BY n DESC LIMIT ?",
        (f"%{q}%", limit),
    )
    return [dict(r) for r in rows]


@router.get("/tags")
def tags(db: DB) -> list[dict]:
    counts: dict[str, int] = {}
    for (text,) in db.execute("SELECT tags FROM transactions WHERE tags != ''"):
        for t in text.split():
            counts[t] = counts.get(t, 0) + 1
    return [{"tag": t, "count": n} for t, n in sorted(counts.items(), key=lambda kv: -kv[1])]
