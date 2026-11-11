def _cat(client, name):
    for g in client.get("/api/categories").json():
        for c in g["categories"]:
            if c["name"] == name:
                return c["id"]
    raise KeyError(name)


def _acct(client, kind):
    return next(a["id"] for a in client.get("/api/accounts").json() if a["kind"] == kind)


def test_quick_add_parse(client):
    r = client.post("/api/quick-add/parse", json={"text": "450 zomato yesterday #friends"}).json()
    assert r["amount"] == -45000 and r["payee"] == "Zomato" and r["tags"] == "friends"
    assert r["category_id"] == _cat(client, "Food delivery")
    assert client.post("/api/quick-add/parse", json={"text": "+2k freelance"}).json()["amount"] == 200000
    assert client.post("/api/quick-add/parse", json={"text": "1.5k rent 01/11/2026"}).json()["date"] == "2026-11-01"


def test_create_edit_learn_and_delete(client):
    bank = _acct(client, "bank")
    shopping = _cat(client, "Shopping")
    t = client.post("/api/transactions", json={"account_id": bank, "date": "2026-11-05", "amount": -129900,
                                               "payee": "Croma", "category_id": shopping, "tags": "#Gadgets"}).json()
    assert t["category"] == "Shopping" and t["tags"] == "gadgets"
    # Payee memory now knows Croma
    assert client.post("/api/quick-add/parse", json={"text": "99 croma"}).json()["category_id"] == shopping
    t2 = client.patch(f"/api/transactions/{t['id']}", json={"amount": -100000, "notes": "headphones"}).json()
    assert t2["amount"] == -100000 and t2["notes"] == "headphones"
    assert client.delete(f"/api/transactions/{t['id']}").status_code == 204
    assert client.get(f"/api/transactions/{t['id']}").status_code == 404


def test_transfers_stay_in_step(client):
    bank, card = _acct(client, "bank"), _acct(client, "credit_card")
    t = client.post("/api/transactions", json={"account_id": bank, "date": "2026-11-06", "amount": -500000,
                                               "payee": "Zz card payoff", "transfer_account_id": card}).json()
    assert t["is_transfer"] and t["transfer_account"] == "Credit card"
    client.patch(f"/api/transactions/{t['id']}", json={"amount": -600000})
    other = client.get("/api/transactions", params={"account_id": card, "q": "Zz card payoff"}).json()["items"][0]
    assert other["amount"] == 600000
    client.delete(f"/api/transactions/{t['id']}")
    assert client.get("/api/transactions", params={"account_id": card, "q": "Zz card payoff"}).json()["total"] == 0


def test_convert_to_transfer_and_back(client):
    bank, cash = _acct(client, "bank"), _acct(client, "cash")
    t = client.post("/api/transactions", json={"account_id": bank, "date": "2026-11-06", "amount": -100000,
                                               "payee": "Withdrawal"}).json()
    t = client.patch(f"/api/transactions/{t['id']}", json={"transfer_account_id": cash}).json()
    assert t["transfer_account_id"] == cash and t["category_id"] is None
    t = client.patch(f"/api/transactions/{t['id']}", json={"transfer_account_id": 0}).json()
    assert not t["is_transfer"]


def test_splits_must_add_up(client):
    bank = _acct(client, "bank")
    t = client.post("/api/transactions", json={"account_id": bank, "date": "2026-11-07", "amount": -300000,
                                               "payee": "Amazon"}).json()
    bad = client.put(f"/api/transactions/{t['id']}/splits", json={"parts": [{"amount": -100000}]})
    assert bad.status_code == 422
    ok = client.put(f"/api/transactions/{t['id']}/splits", json={"parts": [
        {"amount": -200000, "category_id": _cat(client, "Groceries")},
        {"amount": -100000, "category_id": _cat(client, "Shopping")}]}).json()
    assert len(ok["splits"]) == 2
    s = client.get("/api/summary", params={"month": "2026-11"}).json()
    groceries = next(c for c in s["by_category"] if c["name"] == "Groceries")
    assert groceries["spent"] >= 200000


def test_filters_and_bulk(client):
    page = client.get("/api/transactions", params={"q": "swiggy", "limit": 5}).json()
    assert page["total"] > 0 and all("Swiggy" in t["payee"] for t in page["items"])
    inbox = client.get("/api/transactions", params={"inbox": True}).json()["items"]
    ids = [t["id"] for t in inbox]
    r = client.post("/api/transactions/bulk", json={"ids": ids, "category_id": _cat(client, "Misc")}).json()
    assert r["updated"] == len(ids)
    assert client.get("/api/transactions", params={"inbox": True}).json()["total"] == 0
    big = client.get("/api/transactions", params={"min_amount": 2000000, "direction": "out"}).json()
    assert all(abs(t["amount"]) >= 2000000 for t in big["items"])


def test_accounts_crud(client):
    a = client.post("/api/accounts", json={"name": "Paytm Wallet", "kind": "wallet", "opening_balance": 50000}).json()
    assert a["balance"] == 50000
    a = client.patch(f"/api/accounts/{a['id']}", json={"name": "Paytm"}).json()
    assert a["name"] == "Paytm"
    assert client.delete(f"/api/accounts/{a['id']}").status_code == 204
    bank = _acct(client, "bank")
    assert client.delete(f"/api/accounts/{bank}").status_code == 409


def test_rules_apply(client):
    bank = _acct(client, "bank")
    client.post("/api/transactions", json={"account_id": bank, "date": "2026-11-08", "amount": -5000,
                                           "payee": "SHARMA GENERAL STORE"})
    groceries = _cat(client, "Groceries")
    client.post("/api/rules", json={"field": "payee", "match": "contains", "pattern": "general store",
                                    "set_category_id": groceries, "set_payee": "Sharma Store"})
    assert client.post("/api/rules/apply").json()["updated"] >= 1
    t = client.get("/api/transactions", params={"q": "Sharma Store"}).json()["items"][0]
    assert t["category_id"] == groceries


def test_import_over_http(client):
    bank = _acct(client, "bank")
    csv = b"Date,Description,Amount\n2026-11-09,UPI/Zepto/zepto@axl/UPI/AXIS/410000000002/x,-250\n"
    pv = client.post("/api/imports/preview", params={"account_id": bank, "filename": "s.csv"}, content=csv).json()
    assert pv["rows"][0]["payee"] == "Zepto"
    res = client.post("/api/imports/commit", json={"account_id": bank, "filename": "s.csv", "format": pv["format"],
                                                   "period": pv["period"], "rows": pv["rows"]}).json()
    assert res["imported"] == 1
    assert client.get("/api/imports").json()[0]["imported"] == 1
    assert client.delete(f"/api/imports/{res['import_id']}").json()["removed"] == 1
    unknown = client.post("/api/imports/preview", params={"account_id": bank, "filename": "s.csv"},
                          content=b"When,What,How much\n2026-11-01,x,1\n")
    assert unknown.status_code == 422 and unknown.json()["detail"]["columns"] == ["When", "What", "How much"]
    assert client.post("/api/imports/preview", params={"account_id": bank, "filename": "a.docx"},
                       content=b"x").status_code == 415


def test_settings_backup_export(client):
    s = client.put("/api/settings", json={"values": {"month_start_day": 25}}).json()
    assert s["month_start_day"] == "25"
    assert client.put("/api/settings", json={"values": {"month_start_day": 31}}).status_code == 422
    assert client.put("/api/settings", json={"values": {"evil": 1}}).status_code == 422
    name = client.post("/api/backups").json()["name"]
    assert any(b["name"] == name for b in client.get("/api/backups").json())
    data = client.get(f"/api/backups/{name}").content
    assert data[:15] == b"SQLite format 3"
    assert client.get("/api/backups/..%2Fhisaab.db").status_code == 404
    restored = client.post("/api/backups/restore", content=data).json()
    assert restored["restored"]
    assert client.post("/api/backups/restore", content=b"not a db").status_code == 422
    csv = client.get("/api/export/transactions.csv").text
    assert csv.startswith("date,account,payee,category")
    assert "transactions" in client.get("/api/export/all.json").json()


def test_categorize_payee(client):
    cats = {c["name"]: c["id"] for g in client.get("/api/categories").json() for c in g["categories"]}
    r = client.post("/api/transactions/categorize-payee", json={"payee": "chai point", "category_id": cats["Eating out"]}).json()
    assert r["updated"] > 3
    items = client.get("/api/transactions", params={"q": "Chai Point", "limit": 200}).json()["items"]
    assert all(t["category"] == "Eating out" for t in items)
