from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from hisaab.api.deps import DB
from hisaab.categorize import suggest

router = APIRouter(tags=["rules"])


class RuleIn(BaseModel):
    field: Literal["payee", "description"] = "payee"
    match: Literal["contains", "equals", "regex"] = "contains"
    pattern: str = Field(min_length=1, max_length=200)
    set_category_id: int | None = None
    set_payee: str | None = None
    priority: int = 100


@router.get("/rules")
def list_rules(db: DB) -> list[dict]:
    return [dict(r) for r in db.execute(
        "SELECT r.*, c.name AS category FROM rules r LEFT JOIN categories c ON c.id = r.set_category_id"
        " ORDER BY r.priority, r.id")]


@router.post("/rules", status_code=201)
def create_rule(body: RuleIn, db: DB) -> dict:
    if not body.set_category_id and not body.set_payee:
        raise HTTPException(422, "A rule needs a category or a new name to set")
    with db:
        rid = db.execute(
            "INSERT INTO rules (field, match, pattern, set_category_id, set_payee, priority) VALUES (?,?,?,?,?,?)",
            (body.field, body.match, body.pattern, body.set_category_id, body.set_payee or None, body.priority),
        ).lastrowid
    return dict(db.execute("SELECT * FROM rules WHERE id = ?", (rid,)).fetchone())


@router.put("/rules/{rid}")
def update_rule(rid: int, body: RuleIn, db: DB) -> dict:
    with db:
        n = db.execute(
            "UPDATE rules SET field = ?, match = ?, pattern = ?, set_category_id = ?, set_payee = ?, priority = ?"
            " WHERE id = ?",
            (body.field, body.match, body.pattern, body.set_category_id, body.set_payee or None, body.priority, rid),
        ).rowcount
    if not n:
        raise HTTPException(404, "Rule not found")
    return dict(db.execute("SELECT * FROM rules WHERE id = ?", (rid,)).fetchone())


@router.delete("/rules/{rid}", status_code=204)
def delete_rule(rid: int, db: DB) -> None:
    with db:
        db.execute("DELETE FROM rules WHERE id = ?", (rid,))


@router.post("/rules/apply")
def apply_rules(db: DB) -> dict:
    """Run rules and payee memory over every uncategorized transaction."""
    updated = 0
    with db:
        for t in db.execute(
            "SELECT id, payee, raw_description, amount FROM transactions"
            " WHERE category_id IS NULL AND transfer_id IS NULL AND split_parent_id IS NULL"
        ).fetchall():
            guess = suggest(db, t["payee"], t["raw_description"], t["amount"])
            if guess.category_id and guess.source in ("rule", "memory"):
                db.execute("UPDATE transactions SET category_id = ?, payee = ?, reviewed = 1 WHERE id = ?",
                           (guess.category_id, guess.payee, t["id"]))
                updated += 1
    return {"updated": updated}
