from fastapi import APIRouter

from hisaab.api.deps import DB

router = APIRouter(tags=["accounts"])


@router.get("/accounts")
def list_accounts(db: DB) -> list[dict]:
    rows = db.execute(
        """
        SELECT a.id, a.name, a.kind, a.currency, a.opening_balance, a.include_in_net_worth,
               a.opening_balance + COALESCE(SUM(t.amount), 0) AS balance,
               COUNT(t.id) AS transaction_count
        FROM accounts a
        LEFT JOIN transactions t ON t.account_id = a.id AND t.split_parent_id IS NULL
        WHERE a.archived = 0
        GROUP BY a.id
        ORDER BY a.sort, a.id
        """
    )
    return [dict(r) for r in rows]
