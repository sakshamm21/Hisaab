"""ICICI Bank savings-account statement PDF ("Statement of Transactions in Saving Account").

The PDF has no ruled table, so it is read by word position:
- Column headers give the x-positions of S No, Date, Remarks, Withdrawal, Deposit and Balance.
- Every transaction's remarks start with a line in the heavy (Black) font: the short payee name.
- The S No / date / amount line sits in the middle of the remarks block.
- The running Balance lets every row be checked.
"""

from __future__ import annotations

import io
import re
from collections.abc import Iterable
from datetime import datetime
from pathlib import Path

from hisaab.importer.models import ParsedRow, ParsedStatement
from hisaab.money import to_minor

_AMOUNT = re.compile(r"^-?[\d,]+\.\d{2}$")
_DATE = re.compile(r"^\d{2}\.\d{2}\.\d{4}$")
_PERIOD = re.compile(r"for the period\s+(.+?)\s+-\s+(.+?)$", re.I | re.M)
_ACCOUNT = re.compile(r"Account\s+no\.?\s*(\d+)", re.I)


def is_icici_statement(first_page_text: str) -> bool:
    t = first_page_text.lower()
    return "icici" in t and "statement of transactions" in t and "transaction remarks" in t


def parse_icici_pdf(source: bytes | str | Path) -> ParsedStatement:
    import pdfplumber

    stream = io.BytesIO(source) if isinstance(source, bytes) else source
    with pdfplumber.open(stream) as pdf:
        first_text = pdf.pages[0].extract_text() or ""
        pages = [page.extract_words(extra_attrs=["fontname"]) for page in pdf.pages]
    statement = parse_icici_words(pages)
    statement.period = _period(first_text)
    match = _ACCOUNT.search(first_text)
    if match:
        statement.account_hint = f"ICICI ••{match.group(1)[-4:]}"
    return statement


def _period(text: str) -> tuple[str, str] | None:
    match = _PERIOD.search(text)
    if not match:
        return None
    try:
        start, end = (datetime.strptime(m.strip(), "%B %d, %Y").date().isoformat() for m in match.groups())
    except ValueError:
        return None
    return start, end


def _columns(words: list[dict]) -> dict[str, float] | None:
    """Right edges of the amount columns and the left edge of the remarks column, from the header."""
    by_text: dict[str, list[dict]] = {}
    for w in words:
        by_text.setdefault(w["text"], []).append(w)
    needed = ("Withdrawal", "Deposit", "Balance", "Remarks")
    if not all(k in by_text for k in needed):
        return None
    header_bottom = max(by_text[k][0]["bottom"] for k in needed) + 8
    return {
        "withdrawal": by_text["Withdrawal"][0]["x1"],
        "deposit": by_text["Deposit"][0]["x1"],
        "balance": by_text["Balance"][0]["x1"],
        "remarks_x0": min(w["x0"] for w in by_text.get("Transaction", [])
                          if abs(w["top"] - by_text["Remarks"][0]["top"]) < 2) - 60,
        "remarks_x1": by_text["Withdrawal"][0]["x0"] - 2,
        "header_bottom": header_bottom,
    }


def _is_heavy(word: dict) -> bool:
    return "black" in word.get("fontname", "").lower() or "bold" in word.get("fontname", "").lower()


def _lines(words: Iterable[dict]) -> list[tuple[float, list[dict]]]:
    """Group words into visual lines by their top coordinate."""
    lines: list[tuple[float, list[dict]]] = []
    for w in sorted(words, key=lambda w: (round(w["top"]), w["x0"])):
        if lines and abs(lines[-1][0] - w["top"]) < 2.5:
            lines[-1][1].append(w)
        else:
            lines.append((w["top"], [w]))
    return lines


def parse_icici_words(pages: list[list[dict]]) -> ParsedStatement:
    """Turn pdfplumber words (with fontname) from every page into rows."""
    rows: list[ParsedRow] = []
    blocks_by_row: list[tuple[ParsedRow, dict]] = []
    warnings: list[str] = []
    cols: dict[str, float] | None = None
    open_block: dict | None = None  # remarks continuing from the previous page

    for page_words in pages:
        page_cols = _columns(page_words)
        cols = page_cols or cols
        if cols is None:
            continue
        top_limit = page_cols["header_bottom"] if page_cols else 0
        body = [w for w in page_words if w["top"] > top_limit]

        remarks = [w for w in body if cols["remarks_x0"] <= w["x0"] and w["x1"] <= cols["remarks_x1"]]
        anchors = []  # (top, serial, date, {col: amount})
        for top, line in _lines(w for w in body if w not in remarks):
            texts = [w["text"] for w in line]
            date = next((t for t in texts if _DATE.match(t)), None)
            if not date or not texts[0].isdigit():
                continue
            amounts: dict[str, int] = {}
            for w in line:
                if _AMOUNT.match(w["text"]):
                    col = min(("withdrawal", "deposit", "balance"), key=lambda c: abs(cols[c] - w["x1"]))
                    amounts[col] = to_minor(w["text"])
            anchors.append((top, int(texts[0]), date, amounts))

        # Remarks blocks start at each heavy-font line.
        blocks: list[dict] = []
        for top, line in _lines(remarks):
            text = " ".join(w["text"] for w in line)
            if all(_is_heavy(w) for w in line):
                blocks.append({"top": top, "title": text, "body": []})
            elif blocks:
                blocks[-1]["body"].append(text)
            elif open_block is not None:  # continuation of the last row on the previous page
                open_block["body"].append(text)
            else:
                blocks.append({"top": top, "title": "", "body": [text]})

        for top, serial, date, amounts in anchors:
            block = max((b for b in blocks if b["top"] <= top + 1), key=lambda b: b["top"], default=None)
            if block is None:
                warnings.append(f"Row {serial}: couldn't find its description.")
                block = {"title": "", "body": []}
            withdrawal, deposit = amounts.get("withdrawal", 0), amounts.get("deposit", 0)
            if not (withdrawal or deposit):
                warnings.append(f"Row {serial}: no amount found; skipped.")
                continue
            row = ParsedRow(
                date=datetime.strptime(date, "%d.%m.%Y").date().isoformat(),
                amount=deposit - withdrawal,
                description="",
                payee_hint=block["title"],
                balance=amounts.get("balance"),
                cheque=str(serial),
            )
            blocks_by_row.append((row, block))
            rows.append(row)
        open_block = blocks[-1] if blocks else open_block

    # Body lines are filled in last, because a row's remarks can continue on the next page.
    for row, block in blocks_by_row:
        row.description = join_wrapped(block["body"]) or block["title"]

    statement = ParsedStatement(format="icici_pdf", rows=rows, warnings=warnings)
    statement.check_balances()
    return statement


def join_wrapped(lines: list[str]) -> str:
    """Join narration lines that the PDF wrapped at a fixed width.

    A line that ends inside a long token (a hash or reference number) continues without a space:
    "BANK/410000000007/ICI0a1b2c3d4e5f6a7b8c9d0e" + "1f2e3d4c5b6/". Otherwise lines join with a space:
    "UPI/RAVI KUMAR/ravi.k@ok/UPI/UNION" + "BANK/...".
    """
    out = ""
    for line in lines:
        if not out:
            out = line
            continue
        tail = re.split(r"[/ ]", out)[-1]
        glue = "" if (len(tail) >= 10 and tail[-1:].isalnum() and line[:1].isalnum()) or out.endswith("/") else " "
        out += glue + line
    return out
