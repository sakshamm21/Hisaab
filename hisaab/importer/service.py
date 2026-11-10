"""Preview, commit and undo an import."""

from __future__ import annotations

import hashlib
import re
import sqlite3
import uuid
from collections import Counter
from dataclasses import asdict, dataclass

from hisaab.categorize import learn, suggest
from hisaab.importer.csv_import import parse_csv
from hisaab.importer.icici_pdf import is_icici_statement, parse_icici_pdf
from hisaab.importer.models import ParsedStatement
from hisaab.importer.narration import ATM, parse_narration


class UnsupportedFile(ValueError):
    pass


def parse_file(data: bytes, filename: str, mapping: dict[str, int] | None = None) -> ParsedStatement:
    name = filename.lower()
    if name.endswith(".pdf") or data[:5] == b"%PDF-":
        import pdfplumber

        with pdfplumber.open(__import__("io").BytesIO(data)) as pdf:
            first = pdf.pages[0].extract_text() or "" if pdf.pages else ""
        if is_icici_statement(first):
            return parse_icici_pdf(data)
        raise UnsupportedFile(
            "This PDF isn't an ICICI savings statement, the only PDF format supported so far. "
            "Export the statement as CSV or Excel from your bank instead."
        )
    if name.endswith((".csv", ".txt", ".xlsx")):
        return parse_csv(data, filename, mapping)
    if name.endswith(".xls"):
        raise UnsupportedFile("Old .xls files aren't supported. Save it as .xlsx or CSV, or use the PDF.")
    raise UnsupportedFile("Supported files: ICICI statement PDF, CSV, or Excel (.xlsx).")


@dataclass
class PreviewRow:
    index: int
    date: str
    amount: int
    payee: str
    description: str
    category_id: int | None
    category_source: str | None
    kind: str
    is_person: bool
    reference: str
    fingerprint: str
    duplicate: bool
    match_id: int | None  # an existing hand-entered transaction this row is the same as
    transfer_account_id: int | None
    balance: int | None
    balance_ok: bool


def _normal(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", text.lower())[:80]


def fingerprints(rows: list[tuple[str, int, str, str]]) -> list[str]:
    """Stable id per row: the bank reference when there is one, else date+amount+description.

    Identical rows in the same file (two ₹20 teas, no reference) get an occurrence number so both import.
    """
    seen: Counter[str] = Counter()
    out = []
    for date, amount, description, reference in rows:
        base = f"ref:{reference}:{amount}" if reference else f"h:{date}:{amount}:{_normal(description)}"
        seen[base] += 1
        key = base if seen[base] == 1 else f"{base}#{seen[base]}"
        out.append(hashlib.sha1(key.encode()).hexdigest()[:20])
    return out


def _transfer_target(conn: sqlite3.Connection, account_id: int, kind: str, description: str) -> int | None:
    upper = description.upper()
    if kind == ATM:
        want = "cash"
    elif re.search(r"CREDIT ?CARD|CC ?PAY|CCPAY|CARD ?PAYMENT|AUTOPAY.*CARD", upper):
        want = "credit_card"
    else:
        return None
    row = conn.execute(
        "SELECT id FROM accounts WHERE kind = ? AND archived = 0 AND id != ? ORDER BY sort, id LIMIT 1",
        (want, account_id),
    ).fetchone()
    return row[0] if row else None


def preview(conn: sqlite3.Connection, account_id: int, statement: ParsedStatement) -> dict:
    narrations = [parse_narration(r.description) for r in statement.rows]
    prints = fingerprints([(r.date, r.amount, r.description, n.reference)
                           for r, n in zip(statement.rows, narrations, strict=True)])
    existing = {
        row[0]
        for row in conn.execute(
            f"SELECT fingerprint FROM transactions WHERE account_id = ? AND fingerprint IN "
            f"({','.join('?' * len(prints))})",
            (account_id, *prints),
        )
    } if prints else set()
    mismatched = set(statement.balance_mismatches)

    from hisaab.importer.narration import display_payee

    rows = []
    used: set[int] = set()
    for i, (row, narration, fp) in enumerate(zip(statement.rows, narrations, prints, strict=True)):
        payee = display_payee(row.payee_hint, narration) or _fallback_name(row.description)
        guess = suggest(conn, payee, row.description, row.amount, narration)
        match_id = None if fp in existing else _find_manual_match(conn, account_id, row.date, row.amount, used)
        if match_id:
            used.add(match_id)
        duplicate = fp in existing or match_id is not None
        rows.append(PreviewRow(
            index=i, date=row.date, amount=row.amount, payee=guess.payee, description=row.description,
            category_id=guess.category_id, category_source=guess.source, kind=narration.kind,
            is_person=narration.is_person, reference=narration.reference, fingerprint=fp,
            duplicate=duplicate, match_id=match_id,
            transfer_account_id=_transfer_target(conn, account_id, narration.kind, row.description),
            balance=row.balance, balance_ok=i not in mismatched,
        ))
    return {
        "format": statement.format,
        "period": statement.period,
        "account_hint": statement.account_hint,
        "warnings": statement.warnings,
        "rows": [asdict(r) for r in rows],
        "counts": {
            "total": len(rows),
            "duplicates": sum(r.duplicate for r in rows),
            "categorized": sum(r.category_id is not None for r in rows),
            "balance_mismatches": len(mismatched),
        },
    }


def _fallback_name(description: str) -> str:
    text = re.sub(r"\b[\w]*\d{6,}[\w]*\b", "", description)  # drop reference numbers
    text = re.sub(r"^(INF|DTK|TRF|BIL|MMT)/", "", text.strip(), flags=re.I)
    text = re.sub(r"[/_]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()[:40] or "Unknown"


def _find_manual_match(conn: sqlite3.Connection, account_id: int, date: str, amount: int, used: set[int]) -> int | None:
    """A transaction you added by hand (quick add, or the other side of a transfer) that this
    statement row is the same as: same account and amount, within 3 days. Closest date wins."""
    for (tid,) in conn.execute(
        "SELECT id FROM transactions WHERE account_id = ? AND amount = ? AND fingerprint IS NULL"
        " AND import_id IS NULL AND split_parent_id IS NULL AND ABS(julianday(date) - julianday(?)) <= 3"
        " ORDER BY ABS(julianday(date) - julianday(?)), id",
        (account_id, amount, date, date),
    ):
        if tid not in used:
            return tid
    return None


def commit(conn: sqlite3.Connection, account_id: int, file_name: str, fmt: str,
           period: list[str] | tuple[str, str] | None, rows: list[dict]) -> dict:
    """Import the rows the user kept. Each row: the preview fields, possibly edited, plus `skip`."""
    keep = [r for r in rows if not r.get("skip") and not r.get("duplicate")]
    with conn:
        # Rows matching a hand-entered transaction: keep yours, and remember the bank's details on it
        # so this statement (and overlapping ones) never import it again.
        for r in rows:
            if r.get("match_id") and not r.get("skip"):
                conn.execute(
                    "UPDATE transactions SET fingerprint = ?, raw_description = CASE WHEN raw_description = ''"
                    " THEN ? ELSE raw_description END, reference = ? WHERE id = ? AND fingerprint IS NULL",
                    (r["fingerprint"], r["description"], r.get("reference", ""), r["match_id"]),
                )
        import_id = conn.execute(
            "INSERT INTO imports (file_name, account_id, rows, imported, skipped, format, period_start, period_end)"
            " VALUES (?,?,?,?,?,?,?,?)",
            (file_name, account_id, len(rows), 0, len(rows) - len(keep), fmt,
             period[0] if period else None, period[1] if period else None),
        ).lastrowid
        imported = 0
        for r in keep:
            transfer_id = uuid.uuid4().hex if r.get("transfer_account_id") else None
            category_id = None if transfer_id else r.get("category_id")
            confident = r.get("category_source") in ("rule", "memory") or r.get("user_set")
            try:
                conn.execute(
                    "INSERT INTO transactions (account_id, date, amount, payee, raw_description, category_id,"
                    " transfer_id, import_id, fingerprint, reviewed, is_person, reference)"
                    " VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                    (account_id, r["date"], r["amount"], r["payee"], r["description"], category_id,
                     transfer_id, import_id, r["fingerprint"], 1 if (confident or transfer_id) else 0,
                     int(bool(r.get("is_person"))), r.get("reference", "")),
                )
            except sqlite3.IntegrityError:
                continue  # already imported (same fingerprint)
            if transfer_id:
                conn.execute(
                    "INSERT INTO transactions (account_id, date, amount, payee, raw_description, transfer_id,"
                    " import_id, reviewed) VALUES (?,?,?,?,?,?,?,1)",
                    (r["transfer_account_id"], r["date"], -r["amount"], r["payee"], r["description"],
                     transfer_id, import_id),
                )
            if r.get("user_set") and category_id:
                learn(conn, r["payee"], category_id)
            imported += 1
        conn.execute("UPDATE imports SET imported = ?, skipped = ? WHERE id = ?",
                     (imported, len(rows) - imported, import_id))
    return {"import_id": import_id, "imported": imported, "skipped": len(rows) - imported}


def undo(conn: sqlite3.Connection, import_id: int) -> int:
    """Remove everything an import added, including the other side of any transfers it created."""
    with conn:
        removed = conn.execute(
            "DELETE FROM transactions WHERE import_id = ? OR transfer_id IN"
            " (SELECT transfer_id FROM transactions WHERE import_id = ? AND transfer_id IS NOT NULL)",
            (import_id, import_id),
        ).rowcount
        conn.execute("DELETE FROM imports WHERE id = ?", (import_id,))
    return removed
