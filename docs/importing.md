# Importing statements

Import from **Import** in the sidebar (or ⌘K → "Import a statement"). Choose the account the
statement belongs to, drop the file, check the preview, and press **Import**. Nothing is saved
until then, and every import can be undone from the list under the importer.

## Supported files

| File | How it's read |
|---|---|
| **ICICI savings account PDF** ("Statement of Transactions in Saving Account", from net banking) | Read directly. Every row is checked against the running balance; if any don't add up, they're highlighted before you import. |
| **CSV** from any bank | Columns are detected automatically (date, description/narration, withdrawal + deposit or a signed amount, balance). If they aren't, you pick them once. |
| **Excel (.xlsx)** | Same as CSV. Old `.xls` files: open and re-save as `.xlsx`, or export CSV. |

PDFs from other banks aren't supported yet. Export CSV or Excel from your bank's net banking instead.

## What happens on import

- **Payee names** come from the bank's description: UPI (`UPI/<name>/<upi-id>/…`), NACH auto-debits (SIPs), IMPS/NEFT transfers, bill payments, card spends and ATM withdrawals are all recognised.
- **Categories** come from your rules, then from what you chose for that payee before, then from a built-in list of common Indian merchants. The rest wait in the review inbox.
- **Duplicates** are skipped: rows are matched by the bank's UPI/IMPS reference (or date, amount and description), so importing overlapping statements never counts anything twice. A row that matches something you added by hand is linked to it instead of added again.
- **Transfers**: ATM withdrawals are suggested as a transfer to your Cash account, and credit card bill payments as a transfer to your card account, so they never count as spending.

## Adding another bank's PDF format

1. Add `hisaab/importer/<bank>_pdf.py` with a `parse_<bank>_pdf(source) -> ParsedStatement` and a cheap `is_<bank>_statement(first_page_text)` check. `icici_pdf.py` is a worked example: it reads word positions with `pdfplumber`, because most bank PDFs have no real table structure.
2. Fill in `ParsedRow.balance` when the statement has a running balance; `ParsedStatement.check_balances()` then verifies every row for free.
3. Register it in `parse_file()` in `hisaab/importer/service.py`.
4. Add tests with **invented** data (see `tests/test_importer.py`, which builds fake word lists). Never commit a real statement.
