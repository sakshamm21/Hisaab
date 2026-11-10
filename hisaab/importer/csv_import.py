"""Generic CSV / Excel statement import with automatic column detection.

Most bank exports have a header row with Date, a description (Narration / Remarks /
Particulars), and either Withdrawal + Deposit columns or a single signed Amount.
When the columns can't be detected, the caller passes an explicit mapping.
"""

from __future__ import annotations

import csv
import io
import re
from datetime import datetime

from hisaab.importer.models import ParsedRow, ParsedStatement
from hisaab.money import to_minor

DATE_FORMATS = ("%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%Y-%m-%d", "%d/%m/%y", "%d-%m-%y", "%d-%b-%Y",
                "%d %b %Y", "%d-%b-%y", "%d %b %y", "%m/%d/%Y", "%b %d, %Y", "%d %B %Y")

_PATTERNS = {
    "date": r"^(txn |transaction |value )?date|^date",
    "description": r"narration|description|remarks|particulars|details|transaction details",
    "withdrawal": r"withdrawal|debit|^dr\b|paid out|money out",
    "deposit": r"deposit|credit|^cr\b|paid in|money in",
    "amount": r"^amount|^amt|transaction amount",
    "balance": r"balance",
    "reference": r"ref|cheque|chq",
}


class MappingNeeded(ValueError):
    """The columns couldn't be detected; the caller should ask the user to map them."""

    def __init__(self, columns: list[str], message: str):
        super().__init__(message)
        self.columns = columns


def _read_table(data: bytes, filename: str) -> list[list[str]]:
    if filename.lower().endswith(".xlsx"):
        try:
            from openpyxl import load_workbook
        except ImportError as exc:  # pragma: no cover
            raise ValueError("Excel import needs the excel extra: pip install 'hisaab[excel]'") from exc
        sheet = load_workbook(io.BytesIO(data), read_only=True, data_only=True).active
        return [["" if v is None else str(v) for v in row] for row in sheet.iter_rows(values_only=True)]
    text = data.decode("utf-8-sig", errors="replace")
    dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t|") if text.strip() else csv.excel
    return [row for row in csv.reader(io.StringIO(text), dialect)]


def detect_mapping(header: list[str]) -> dict[str, int]:
    mapping: dict[str, int] = {}
    for i, name in enumerate(header):
        clean = name.strip().lower()
        for key, pattern in _PATTERNS.items():
            if key not in mapping and re.search(pattern, clean):
                # "Withdrawal Amount (INR)" is a withdrawal column, not a signed amount column
                if key == "amount" and re.search(_PATTERNS["withdrawal"] + "|" + _PATTERNS["deposit"], clean):
                    continue
                mapping[key] = i
                break
    return mapping


def parse_date(value: str) -> str:
    value = value.strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(value, fmt).date().isoformat()
        except ValueError:
            continue
    if re.match(r"^\d{4}-\d{2}-\d{2}", value):  # Excel datetime as text
        return value[:10]
    raise ValueError(f"Unrecognised date: {value!r}")


def _money(value: str) -> int:
    value = (value or "").strip()
    if not value or value in ("-", "--"):
        return 0
    negative = value.startswith("(") and value.endswith(")") or value.upper().endswith("DR")
    value = re.sub(r"(?i)\s*(cr|dr)$", "", value).strip("()")
    amount = to_minor(value)
    return -abs(amount) if negative else amount


def parse_csv(data: bytes, filename: str = "statement.csv", mapping: dict[str, int] | None = None) -> ParsedStatement:
    table = [row for row in _read_table(data, filename) if any(c.strip() for c in row)]
    if not table:
        raise ValueError("The file is empty.")

    # The header is the first row (within the first 30) that mentions a date and a description.
    header_index = 0
    for i, row in enumerate(table[:30]):
        found = detect_mapping(row)
        if "date" in found and "description" in found:
            header_index = i
            break
    header = table[header_index]
    columns = [c.strip() for c in header]
    mapping = mapping or detect_mapping(header)
    has_amount = "amount" in mapping or "withdrawal" in mapping or "deposit" in mapping
    if not ("date" in mapping and "description" in mapping and has_amount):
        raise MappingNeeded(columns, "Couldn't tell which columns hold the date, description and amount.")

    rows: list[ParsedRow] = []
    warnings: list[str] = []
    get = lambda r, k: r[mapping[k]].strip() if k in mapping and mapping[k] < len(r) else ""  # noqa: E731
    for line_no, raw in enumerate(table[header_index + 1:], start=header_index + 2):
        date_text = get(raw, "date")
        if not date_text:
            continue
        try:
            date = parse_date(date_text)
        except ValueError:
            if rows:  # footer text after the table ends
                break
            continue
        try:
            if "amount" in mapping:
                amount = _money(get(raw, "amount"))
            else:
                amount = abs(_money(get(raw, "deposit"))) - abs(_money(get(raw, "withdrawal")))
            balance = _money(get(raw, "balance")) if "balance" in mapping and get(raw, "balance") else None
        except Exception:
            warnings.append(f"Line {line_no}: couldn't read the amount; skipped.")
            continue
        if amount == 0:
            continue
        rows.append(ParsedRow(date=date, amount=amount, description=get(raw, "description"),
                              balance=balance, cheque=get(raw, "reference")))

    # Some banks list newest first; the balance check needs oldest first.
    if len(rows) > 1 and rows[0].date > rows[-1].date:
        rows.reverse()
    statement = ParsedStatement(format="csv", rows=rows, warnings=warnings)
    if rows:
        statement.period = (min(r.date for r in rows), max(r.date for r in rows))
    statement.check_balances()
    return statement
