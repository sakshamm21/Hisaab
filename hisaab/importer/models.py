from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class ParsedRow:
    date: str  # ISO YYYY-MM-DD
    amount: int  # paise; negative = money out
    description: str  # the bank's raw narration
    payee_hint: str = ""  # a short name the bank printed, if any (ICICI's bold first line)
    balance: int | None = None  # running balance after this row, if the statement has one
    cheque: str = ""


@dataclass
class ParsedStatement:
    format: str  # "icici_pdf", "csv", ...
    rows: list[ParsedRow]
    period: tuple[str, str] | None = None
    account_hint: str = ""
    warnings: list[str] = field(default_factory=list)
    # Rows (by index) whose running balance doesn't match the previous balance +/- amount.
    balance_mismatches: list[int] = field(default_factory=list)

    def check_balances(self) -> None:
        self.balance_mismatches = [
            i
            for i in range(1, len(self.rows))
            if self.rows[i].balance is not None
            and self.rows[i - 1].balance is not None
            and self.rows[i - 1].balance + self.rows[i].amount != self.rows[i].balance
        ]
        if self.balance_mismatches:
            self.warnings.append(
                f"{len(self.balance_mismatches)} row(s) don't add up against the running balance. "
                "Check them before importing."
            )
