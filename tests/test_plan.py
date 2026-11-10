from datetime import date

from hisaab import periods, recurring
from tests.conftest import TODAY


def test_periods_calendar_and_salary_day():
    assert periods.period_of(date(2026, 11, 10), 1) == "2026-11"
    assert periods.bounds("2026-11", 1) == (date(2026, 11, 1), date(2026, 12, 1))
    # Month starting on the 25th: 10 Nov belongs to the period that began 25 Oct.
    assert periods.period_of(date(2026, 11, 10), 25) == "2026-10"
    assert periods.period_of(date(2026, 11, 25), 25) == "2026-11"
    assert periods.bounds("2026-12", 25) == (date(2026, 12, 25), date(2027, 1, 25))
    assert periods.shift("2026-01", -1) == "2025-12"
    d = periods.describe("2026-10", 25, today=date(2026, 11, 10))
    assert d["is_current"] and d["days"] == 31 and d["days_left"] == 15 and d["label"] == "25 Oct – 24 Nov 2026"


def test_cadence_maths():
    assert recurring.add_cadence(date(2026, 1, 31), "monthly") == date(2026, 2, 28)
    assert recurring.add_cadence(date(2026, 3, 1), "yearly") == date(2027, 3, 1)
    assert recurring.monthly_cost(-120000, "yearly") == 10000


def test_summary_respects_month_start_day(client):
    client.put("/api/settings", json={"values": {"month_start_day": 25}})
    s = client.get("/api/summary", params={"month": "2026-10"}).json()
    assert s["start"] == "2026-10-25" and s["end"] == "2026-11-24"
    assert s["income"] == 85_000_00  # the 1 Nov salary falls inside 25 Oct – 24 Nov


def test_budget_view_and_fill(client):
    b = client.get("/api/budget/2026-11").json()
    rent = next(c for g in b["groups"] for c in g["categories"] if c["name"] == "Rent")
    assert rent["budgeted"] == 22_000_00 and rent["spent"] == 22_000_00 and rent["available"] == 0
    assert b["totals"]["budgeted"] > 0 and b["split"]["targets"]["need"] == 50
    client.delete("/api/budget/2026-12")
    filled = client.post("/api/budget/2026-12/fill", json={"mode": "average"}).json()
    assert filled["changed"] > 5
    dec = client.get("/api/budget/2026-12").json()
    groceries = next(c for g in dec["groups"] for c in g["categories"] if c["name"] == "Groceries")
    assert groceries["budgeted"] % 10000 == 0 and groceries["budgeted"] >= groceries["average"]
    client.put("/api/budget/2026-12/" + str(groceries["id"]), json={"amount": 0})
    dec = client.get("/api/budget/2026-12").json()
    assert not next(c for g in dec["groups"] for c in g["categories"] if c["id"] == groceries["id"])["has_budget"]


def test_rollover_carries_unspent_money(client):
    cats = {c["name"]: c for g in client.get("/api/categories").json() for c in g["categories"]}
    gid = cats["Travel"]["id"]
    client.patch(f"/api/categories/{gid}", json={"rollover": True})
    for p in ("2026-09", "2026-10", "2026-11"):
        client.put(f"/api/budget/{p}/{gid}", json={"amount": 2_000_00})
    nov = client.get("/api/budget/2026-11").json()
    travel = next(c for g in nov["groups"] for c in g["categories"] if c["id"] == gid)
    assert travel["carry"] == 4_000_00 and travel["available"] == 6_000_00


def test_recurring_detection_and_tracking(client, demo_db):
    demo_db.execute("DELETE FROM recurring")
    demo_db.commit()
    found = client.get("/api/recurring/detect").json()
    names = {f["payee"]: f for f in found}
    assert "Spotify" in names and names["Spotify"]["cadence"] == "monthly" and names["Spotify"]["kind"] == "subscription"
    assert "Landlord" in names and "Swiggy" not in names  # irregular amounts are not recurring
    sp = names["Spotify"]
    item = client.post("/api/recurring", json={"name": "Spotify", "payee": "Spotify", "kind": "subscription",
                                                "amount": sp["amount"], "next_due": "2026-10-08"}).json()
    listing = client.get("/api/recurring").json()
    synced = next(i for i in listing["items"] if i["id"] == item["id"])
    assert synced["next_due"] > TODAY.isoformat() and synced["last_paid"] is not None  # past payments matched
    assert listing["totals"]["subscriptions_monthly"] == 59_00
    client.post("/api/recurring/dismiss", json={"payee": "Landlord"})
    assert "Landlord" not in {f["payee"] for f in client.get("/api/recurring/detect").json()}


def test_upcoming_lists_due_items(client):
    up = client.get("/api/recurring/upcoming", params={"days": 31}).json()
    assert {u["name"] for u in up} >= {"Netflix", "Electricity", "Jio recharge"}
    assert up == sorted(up, key=lambda u: u["date"])


def test_goals(client):
    goals = client.get("/api/goals").json()
    goa = next(g for g in goals if g["name"] == "Goa trip")
    assert goa["saved"] == 17_000_00 and goa["needed_per_month"] > 0 and goa["pace_per_month"] > 0
    g = client.post("/api/goals", json={"name": "Laptop", "target_amount": 80_000_00, "target_date": "2027-05-10"}).json()
    g = client.post(f"/api/goals/{g['id']}/entries", json={"amount": 20_000_00}).json()
    assert g["saved"] == 20_000_00 and abs(g["progress"] - 0.25) < 1e-9
    acct = client.post("/api/accounts", json={"name": "FD", "kind": "investment", "opening_balance": 50_000_00}).json()
    linked = client.post("/api/goals", json={"name": "Emergency", "target_amount": 100_000_00, "account_id": acct["id"]}).json()
    assert linked["saved"] == 50_000_00
