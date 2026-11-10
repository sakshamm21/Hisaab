"""Importer tests use synthetic data only; real statements are never committed."""

import pytest

from hisaab.importer.csv_import import MappingNeeded, parse_csv
from hisaab.importer.icici_pdf import join_wrapped, parse_icici_words
from hisaab.importer.narration import ATM, IMPS, NACH, UPI, UPI_MANDATE, display_payee, parse_narration
from hisaab.importer.service import commit, fingerprints, preview, undo


def test_upi_narration():
    n = parse_narration("UPI/Swiggy Ltd/swiggyupi@axb/UPI/AXIS BANK/410000000001/AXB703cc49ffa")
    assert (n.kind, n.payee, n.vpa, n.reference, n.is_person) == (UPI, "Swiggy Ltd", "swiggyupi@axb", "410000000001", False)
    person = parse_narration("UPI/PRIYA S/9000000001@okaxis/UPI/AXIS BANK/410000000006/ICI7d2a")
    assert person.is_person
    mandate = parse_narration("UPI/Spotify In/spotify@icici/MandateReq/ICICI Bank/410000000009/ICIbb0")
    assert mandate.kind == UPI_MANDATE


def test_other_narrations():
    nach = parse_narration("ACH/PPFAS 01122025 CAMS/ICIC0000000000000001/1000000000001")
    assert (nach.kind, nach.payee) == (NACH, "PPFAS")
    imps = parse_narration("MMT/IMPS/410000000008/Arjun R/HDFC0999999")
    assert (imps.kind, imps.payee, imps.reference) == (IMPS, "Arjun R", "410000000008")
    assert parse_narration("NFS/CASH WDL/410000000008/GURGAON").kind == ATM
    assert display_payee("NACH trxn", nach) == "PPFAS"
    assert display_payee("ZEPTO MARK", parse_narration("UPI/ZEPTO MARK/zepto.pay/UPI")) == "Zepto Mark"


def test_join_wrapped_lines():
    assert join_wrapped(["UPI/RAVI KUMAR/x@o/UPI/UNION", "BANK/410000000007/ICI0a1b2c3d4e5f6a7b8c9d0e", "1f2e3d4c5b6/"]) == \
        "UPI/RAVI KUMAR/x@o/UPI/UNION BANK/410000000007/ICI0a1b2c3d4e5f6a7b8c9d0e1f2e3d4c5b6/"


def _w(text, x0, top, heavy=False, x1=None):
    return {"text": text, "x0": x0, "x1": x1 or x0 + 6 * len(text), "top": top, "bottom": top + 8,
            "fontname": "Mulish-Black" if heavy else "Mulish-Regular"}


HEADER = [_w("S", 24, 222, True), _w("No.", 31, 222, True), _w("Transaction", 60, 217, True),
          _w("Cheque", 122, 222, True), _w("Transaction", 247, 222, True), _w("Remarks", 297, 222, True),
          _w("Withdrawal", 399, 217, True, 447), _w("Deposit", 474, 217, True, 504), _w("Balance", 532, 217, True, 564)]


def _row(serial, top, title, body, withdrawal=None, deposit=None, balance=None):
    words = [_w(str(serial), 30, top + 5), _w("01.12.2025", 61, top + 5)]
    words += [_w(part, 192 + 40 * i, top, True) for i, part in enumerate(title.split())]
    for j, line in enumerate(body):
        words.append(_w(line, 192, top + 10 * (j + 1), x1=380))
    if withdrawal:
        words.append(_w(withdrawal, 418, top + 5, x1=453))
    if deposit:
        words.append(_w(deposit, 480, top + 5, x1=512))
    words.append(_w(balance, 531, top + 5, x1=571))
    return words


def test_icici_layout_parsing_and_balance_check():
    page1 = HEADER + _row(1, 280, "Swiggy Ltd", ["UPI/Swiggy Ltd/swiggyupi@axb/UPI/AXIS", "BANK/410000000001/"],
                          withdrawal="334.00", balance="1000.00") \
        + _row(2, 330, "NEHA GUPTA", ["UPI/NEHA GUPTA/neha@okhdfc/UPI/HDFC"], deposit="1,000.00", balance="2000.00")
    page2 = HEADER + _row(3, 280, "Spotify In", ["UPI/Spotify In/spotify@icici/MandateReq/ICICI"],
                          withdrawal="59.00", balance="1900.00")  # wrong on purpose: should be 1941.00
    st = parse_icici_words([page1, page2])
    assert [r.amount for r in st.rows] == [-33400, 100000, -5900]
    assert st.rows[0].payee_hint == "Swiggy Ltd"
    assert st.rows[0].description.startswith("UPI/Swiggy Ltd/swiggyupi@axb/UPI/AXIS BANK/")
    assert st.rows[1].date == "2025-12-01"
    assert st.balance_mismatches == [2]
    assert st.warnings


def test_csv_with_debit_credit_columns():
    data = (b"Account statement\n\nTxn Date,Narration,Ref No,Withdrawal Amt,Deposit Amt,Closing Balance\n"
            b"02/12/2025,UPI/Zepto/zepto@axl/UPI,123,195.00,,1805.00\n"
            b"01/12/2025,NEFT/SALARY,,,\"2,000.00\",2000.00\n")
    st = parse_csv(data, "s.csv")
    assert [r.date for r in st.rows] == ["2025-12-01", "2025-12-02"]  # reversed to oldest first
    assert [r.amount for r in st.rows] == [200000, -19500]
    assert st.balance_mismatches == []


def test_csv_signed_amount_and_unknown_columns():
    st = parse_csv(b"Date,Description,Amount\n2025-12-01,Coffee,-120.50\n", "s.csv")
    assert st.rows[0].amount == -12050
    with pytest.raises(MappingNeeded) as err:
        parse_csv(b"When,What,How much\n2025-12-01,Coffee,-120\n", "s.csv")
    assert err.value.columns == ["When", "What", "How much"]
    st = parse_csv(b"When,What,How much\n2025-12-01,Coffee,-120\n", "s.csv", {"date": 0, "description": 1, "amount": 2})
    assert st.rows[0].amount == -12000


def test_fingerprints_keep_identical_rows():
    a = fingerprints([("2025-12-01", -2000, "TEA", ""), ("2025-12-01", -2000, "TEA", "")])
    assert a[0] != a[1]
    assert fingerprints([("2025-12-01", -2000, "x", "123456789012")]) == fingerprints([("2025-12-09", -2000, "y", "123456789012")])


def test_preview_commit_reimport_and_undo(demo_db):
    conn = demo_db
    bank = conn.execute("SELECT id FROM accounts WHERE kind = 'bank'").fetchone()[0]
    data = (b"Date,Description,Amount\n"
            b"2026-11-01,UPI/Swiggy Ltd/swiggyupi@axb/UPI/AXIS BANK/410000000001/x,-450\n"
            b"2026-11-02,NFS/CASH WDL/410000000008/GURGAON,-2000\n"
            b"2026-11-03,UPI/Some Shop/shop@ybl/UPI/HDFC/410000000004/x,-99\n")
    pv = preview(conn, bank, parse_csv(data, "s.csv"))
    rows = pv["rows"]
    assert rows[0]["payee"] == "Swiggy" and rows[0]["category_source"] in ("memory", "known")
    cash = conn.execute("SELECT id FROM accounts WHERE kind = 'cash'").fetchone()[0]
    assert rows[1]["transfer_account_id"] == cash
    before = conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]
    res = commit(conn, bank, "s.csv", "csv", pv["period"], rows)
    assert res["imported"] == 3
    assert conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0] == before + 4  # + cash side
    again = preview(conn, bank, parse_csv(data, "s.csv"))
    assert all(r["match_id"] is None for r in again["rows"])
    assert again["counts"]["duplicates"] == 3
    assert undo(conn, res["import_id"]) == 4
    assert conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0] == before


def test_import_links_to_hand_entered_transaction(demo_db):
    conn = demo_db
    bank = conn.execute("SELECT id FROM accounts WHERE kind = 'bank'").fetchone()[0]
    manual = conn.execute(
        "INSERT INTO transactions (account_id, date, amount, payee) VALUES (?, '2026-11-02', -77700, 'Croma')", (bank,)
    ).lastrowid
    data = b"Date,Description,Amount\n2026-11-03,UPI/CROMA/croma@hdfc/UPI/HDFC/410000000003/x,-777\n"
    pv = preview(conn, bank, parse_csv(data, "s.csv"))
    assert pv["rows"][0]["match_id"] == manual and pv["rows"][0]["duplicate"]
    commit(conn, bank, "s.csv", "csv", pv["period"], pv["rows"])
    row = conn.execute("SELECT payee, fingerprint, reference FROM transactions WHERE id = ?", (manual,)).fetchone()
    assert row["payee"] == "Croma" and row["fingerprint"] and row["reference"] == "410000000003"
    assert preview(conn, bank, parse_csv(data, "s.csv"))["rows"][0]["match_id"] is None  # now a plain duplicate
