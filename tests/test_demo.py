from tests.conftest import TODAY


def test_demo_is_deterministic_and_dated_up_to_today(demo_db):
    first, last = demo_db.execute("SELECT MIN(date), MAX(date) FROM transactions").fetchone()
    assert first == "2026-06-01"
    assert last <= TODAY.isoformat()
    assert demo_db.execute("SELECT COUNT(*) FROM transactions").fetchone()[0] > 300


def test_transfers_balance_to_zero(demo_db):
    unbalanced = demo_db.execute(
        "SELECT transfer_id FROM transactions WHERE transfer_id IS NOT NULL"
        " GROUP BY transfer_id HAVING SUM(amount) != 0 OR COUNT(*) != 2"
    ).fetchall()
    assert unbalanced == []
    uncategorized_transfers = demo_db.execute(
        "SELECT COUNT(*) FROM transactions WHERE transfer_id IS NOT NULL AND category_id IS NOT NULL"
    ).fetchone()[0]
    assert uncategorized_transfers == 0


def test_credit_card_is_paid_off_each_month(demo_db):
    # The card bill pays last month's spend, so the balance stays within one month of spending.
    balance = demo_db.execute(
        "SELECT SUM(t.amount) FROM transactions t JOIN accounts a ON a.id = t.account_id"
        " WHERE a.kind = 'credit_card'"
    ).fetchone()[0]
    assert -60_000_00 < balance <= 0


def test_inbox_has_recent_uncategorized_items(demo_db):
    rows = demo_db.execute("SELECT category_id FROM transactions WHERE reviewed = 0").fetchall()
    assert len(rows) == 8
    assert all(r[0] is None for r in rows)
