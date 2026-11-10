from datetime import date
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from hisaab.api.deps import DB

router = APIRouter(tags=["accounts"])

Kind = Literal["bank", "cash", "credit_card", "wallet", "investment", "loan"]

BALANCE_SQL = """
    SELECT a.id, a.name, a.kind, a.currency, a.opening_balance, a.opening_date, a.include_in_net_worth,
           a.archived, a.sort,
           a.opening_balance + COALESCE(SUM(t.amount), 0) AS balance,
           COUNT(t.id) AS transaction_count,
           MAX(t.date) AS last_transaction
    FROM accounts a
    LEFT JOIN transactions t ON t.account_id = a.id AND t.split_parent_id IS NULL
"""


@router.get("/accounts")
def list_accounts(db: DB, include_archived: bool = False) -> list[dict]:
    where = "" if include_archived else "WHERE a.archived = 0"
    rows = db.execute(f"{BALANCE_SQL} {where} GROUP BY a.id ORDER BY a.archived, a.sort, a.id")
    return [dict(r) for r in rows]


def _get(db, account_id: int) -> dict:
    row = db.execute(f"{BALANCE_SQL} WHERE a.id = ? GROUP BY a.id", (account_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Account not found")
    return dict(row)


class AccountIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    kind: Kind
    opening_balance: int = 0  # paise; negative for money owed on a card or loan
    opening_date: str = Field(default_factory=lambda: date.today().isoformat(), pattern=r"^\d{4}-\d{2}-\d{2}$")
    currency: str = "INR"
    include_in_net_worth: bool = True


@router.post("/accounts", status_code=201)
def create_account(body: AccountIn, db: DB) -> dict:
    with db:
        sort = db.execute("SELECT COALESCE(MAX(sort), -1) + 1 FROM accounts").fetchone()[0]
        new_id = db.execute(
            "INSERT INTO accounts (name, kind, opening_balance, opening_date, currency, include_in_net_worth, sort)"
            " VALUES (?,?,?,?,?,?,?)",
            (body.name.strip(), body.kind, body.opening_balance, body.opening_date, body.currency,
             int(body.include_in_net_worth), sort),
        ).lastrowid
    return _get(db, new_id)


class AccountPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=60)
    kind: Kind | None = None
    opening_balance: int | None = None
    opening_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    include_in_net_worth: bool | None = None
    archived: bool | None = None
    sort: int | None = None


@router.patch("/accounts/{account_id}")
def update_account(account_id: int, body: AccountPatch, db: DB) -> dict:
    _get(db, account_id)
    fields = {k: (int(v) if isinstance(v, bool) else v) for k, v in body.model_dump(exclude_none=True).items()}
    if fields:
        with db:
            db.execute(f"UPDATE accounts SET {', '.join(f'{k} = ?' for k in fields)} WHERE id = ?",
                       (*fields.values(), account_id))
    return _get(db, account_id)


@router.delete("/accounts/{account_id}", status_code=204)
def delete_account(account_id: int, db: DB) -> None:
    """Delete an account with no transactions; accounts with history should be archived instead."""
    acct = _get(db, account_id)
    if acct["transaction_count"]:
        raise HTTPException(409, "This account has transactions. Archive it instead, so your history stays.")
    with db:
        db.execute("DELETE FROM accounts WHERE id = ?", (account_id,))
