from typing import Annotated

from fastapi import APIRouter, Query

from hisaab.api.deps import DB

router = APIRouter(tags=["transactions"])


@router.get("/transactions")
def list_transactions(
    db: DB,
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    inbox: bool = False,
) -> dict:
    where = "t.split_parent_id IS NULL" + (" AND t.reviewed = 0" if inbox else "")
    total = db.execute(f"SELECT COUNT(*) FROM transactions t WHERE {where}").fetchone()[0]
    rows = db.execute(
        f"""
        SELECT t.id, t.date, t.amount, t.payee, t.raw_description, t.notes, t.tags,
               t.transfer_id IS NOT NULL AS is_transfer, t.reviewed,
               a.id AS account_id, a.name AS account,
               c.id AS category_id, c.name AS category, c.icon AS category_icon,
               c.color AS category_color
        FROM transactions t
        JOIN accounts a ON a.id = t.account_id
        LEFT JOIN categories c ON c.id = t.category_id
        WHERE {where}
        ORDER BY t.date DESC, t.id DESC
        LIMIT ? OFFSET ?
        """,
        (limit, offset),
    )
    return {"total": total, "items": [dict(r) for r in rows]}
