from datetime import date

from hisaab import insights, review
from hisaab.insights import rupees
from tests.conftest import TODAY


def test_rupees_uses_indian_grouping():
    assert rupees(12345678) == "₹1,23,457"
    assert rupees(-50000) == "₹500"
    assert rupees(1234567890) == "₹1,23,45,679"


def test_trends_and_compare(client):
    t = client.get("/api/reports/trends", params={"months": 6, "period": "2026-11"}).json()
    assert [m["period"] for m in t["months"]] == ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]
    oct_ = t["months"][4]
    assert oct_["income"] >= 85_000_00 and sum(oct_["by_category"].values()) == oct_["spending"]
    assert t["categories"][0]["name"] == "Rent"
    c = client.get("/api/reports/compare", params={"a": "2026-09", "b": "2026-10"}).json()
    assert c["a"]["period"] == "2026-09" and all("change" in r for r in c["categories"])


def test_cashflow_balances(client):
    cf = client.get("/api/reports/cashflow", params={"period": "2026-10"}).json()
    nodes = cf["nodes"]
    hub = next(i for i, n in enumerate(nodes) if n["kind"] == "hub")
    into = sum(link["value"] for link in cf["links"] if link["target"] == hub)
    out = sum(link["value"] for link in cf["links"] if link["source"] == hub)
    assert into == out == max(cf["income"], cf["spending"])
    assert any(n["name"] == "Saved" for n in nodes)


def test_calendar_merchants_networth_category_tags(client):
    cal = client.get("/api/reports/calendar", params={"months": 1, "period": "2026-10"}).json()
    assert cal["start"] == "2026-10-01" and len(cal["by_weekday"]) == 7 and cal["max"] > 0
    m = client.get("/api/reports/merchants", params={"months": 3, "period": "2026-10"}).json()["items"]
    assert m[0]["payee"] == "Landlord" and m == sorted(m, key=lambda x: -x["spent"])
    nw = client.get("/api/reports/networth", params={"months": 6}).json()["points"]
    assert len(nw) == 6 and all(p["net"] == p["assets"] + p["debts"] for p in nw)
    cats = {c["name"]: c["id"] for g in client.get("/api/categories").json() for c in g["categories"]}
    cr = client.get(f"/api/reports/category/{cats['Food delivery']}").json()
    assert len(cr["months"]) == 12 and cr["merchants"]
    assert client.get("/api/reports/tags").json() == []


def test_insights_and_forecast(demo_db):
    items = insights.generate(demo_db, TODAY)
    assert all({"kind", "severity", "title", "body", "link"} <= set(i) for i in items)
    f = insights.forecast(demo_db, TODAY)
    assert f["projected_spending"] >= f["spent_so_far"] and f["projected_income"] >= 85_000_00


def test_budget_insight_when_over(demo_db):
    cid = demo_db.execute("SELECT id FROM categories WHERE name = 'Food delivery'").fetchone()[0]
    demo_db.execute("UPDATE budgets SET amount = 10000 WHERE category_id = ? AND month = '2026-11'", (cid,))
    demo_db.commit()
    kinds = {i["kind"] for i in insights.generate(demo_db, TODAY)}
    assert "over_budget" in kinds


def test_month_review(demo_db, client):
    r = review.build(demo_db, "2026-10")
    assert r["complete"] and r["income"] >= 85_000_00 and r["summary_lines"] and r["suggestions"]
    assert r["start"] == "2026-10-01"
    latest = client.get("/api/review/latest").json()
    assert latest["period"] == "2026-10" or latest["period"] < date.today().strftime("%Y-%m")
