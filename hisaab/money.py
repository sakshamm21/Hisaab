"""Money helpers. All amounts are integers in the smallest unit (paise)."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal


def to_minor(value: str | int | float | Decimal) -> int:
    """'1,234.50' or 1234.5 -> 123450 paise. Rounds half up; never uses float maths for the result."""
    if isinstance(value, str):
        value = value.replace(",", "").replace("₹", "").strip() or "0"
    amount = Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return int(amount * 100)


def from_minor(value: int) -> Decimal:
    return (Decimal(value) / 100).quantize(Decimal("0.01"))
