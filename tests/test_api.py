def test_health_and_meta(client):
    assert client.get("/api/health").json() == {"status": "ok"}
    meta = client.get("/api/meta").json()
    assert meta["demo"] is True
    assert meta["settings"]["currency"] == "INR"


def test_accounts_have_balances(client):
    accounts = client.get("/api/accounts").json()
    assert [a["name"] for a in accounts] == ["ICICI Savings", "Credit card", "Cash"]
    assert all(isinstance(a["balance"], int) for a in accounts)


def test_categories_grouped(client):
    groups = client.get("/api/categories").json()
    assert groups[0]["name"] == "Home & bills"
    assert any(g["kind"] == "income" for g in groups)


def test_transactions_paging_and_inbox(client):
    page = client.get("/api/transactions", params={"limit": 5}).json()
    assert len(page["items"]) == 5 and page["total"] > 300
    dates = [t["date"] for t in page["items"]]
    assert dates == sorted(dates, reverse=True)
    inbox = client.get("/api/transactions", params={"inbox": True}).json()
    assert inbox["total"] == 8


def test_summary_excludes_transfers(client, demo_db):
    s = client.get("/api/summary", params={"month": "2026-10"}).json()
    assert s["income"] >= 85_000_00
    # Rent + SIP alone are 32,000; card bill and ATM transfers must not be double counted.
    assert 32_000_00 < s["spending"] < 85_000_00
    assert s["net"] == s["income"] - s["spending"]
    assert sum(c["spent"] for c in s["by_category"]) == s["spending"]


def test_summary_rejects_bad_month(client):
    assert client.get("/api/summary", params={"month": "October"}).status_code == 422


def test_ui_fallback_without_build(client):
    r = client.get("/transactions")
    assert r.status_code == 200 and "isn't built" in r.text
    assert client.get("/api/nope").status_code == 404
