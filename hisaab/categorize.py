"""Choose a clean name and a category for a transaction.

Order of confidence:
1. Your rules (Settings → Rules).
2. Payee memory: what you categorized this payee as before.
3. Built-in knowledge of common Indian merchants and payment types.
Anything else waits in the review inbox, and your choice there is remembered.
"""

from __future__ import annotations

import re
import sqlite3
from dataclasses import dataclass

from hisaab.importer.narration import (
    ATM,
    CHARGES,
    INTEREST,
    NACH,
    UPI_MANDATE,
    Narration,
)

# (pattern matched against payee + UPI ID + description, clean name, category)
KNOWN_MERCHANTS: list[tuple[str, str, str]] = [
    (r"swiggy|instamart", "Swiggy", "Food delivery"),
    (r"zomato|blinkit", "", ""),  # resolved below: Blinkit is groceries, Zomato is delivery
    (r"zepto", "Zepto", "Groceries"),
    (r"bigbasket|bbnow", "BigBasket", "Groceries"),
    (r"dmart|avenue supermarts", "DMart", "Groceries"),
    (r"jiomart", "JioMart", "Groceries"),
    (r"uber", "Uber", "Cabs"),
    (r"\bola\b|olacabs|ani technologies", "Ola", "Cabs"),
    (r"rapido|roppen", "Rapido", "Cabs"),
    (r"namma yatri", "Namma Yatri", "Cabs"),
    (r"irctc", "IRCTC", "Travel"),
    (r"makemytrip|goibibo|cleartrip|ixigo|indigo|air india|akasa", "", "Travel"),
    (r"spotify", "Spotify", "Subscriptions"),
    (r"netflix", "Netflix", "Subscriptions"),
    (r"youtube|google play|googleplay", "Google", "Subscriptions"),
    (r"hotstar|jiocinema|jiohotstar", "JioHotstar", "Subscriptions"),
    (r"prime video|primevideo", "Prime Video", "Subscriptions"),
    (r"apple\.com|itunes", "Apple", "Subscriptions"),
    (r"amazon|amzn", "Amazon", "Shopping"),
    (r"flipkart", "Flipkart", "Shopping"),
    (r"myntra", "Myntra", "Shopping"),
    (r"ajio", "AJIO", "Shopping"),
    (r"nykaa", "Nykaa", "Shopping"),
    (r"meesho", "Meesho", "Shopping"),
    (r"bookmyshow|pvr|inox|district", "", "Entertainment"),
    (r"apollo|pharmeasy|netmeds|1mg|medplus", "", "Health"),
    (r"airtel", "Airtel", "Bills & recharges"),
    (r"\bjio\b|jio prepaid|reliance jio|jiomobility", "Jio", "Bills & recharges"),
    (r"\bvi\b|vodafone", "Vi", "Bills & recharges"),
    (r"bses|tata power|adani electricity|bescom|msedcl|electricity", "", "Bills & recharges"),
    (r"indian oil|iocl|hpcl|bharat petroleum|bpcl|petrol|fuel", "", "Transport & fuel"),
    (r"fastag", "FASTag", "Transport & fuel"),
    (r"starbucks|third wave|blue tokai|chaayos|chai point|tea|cafe|coffee", "", "Eating out"),
    (r"lic\b|policybazaar|insurance|hdfc life|icici pru", "", "Insurance"),
    (r"zerodha|groww|upstox|kuvera|coin\b|cams|kfin|mutual fund|\bmf\b|ppfas|\bppf\b|nps", "", "Investments"),
    (r"salary|payroll", "Salary", "Salary"),
]

_COMPILED = [(re.compile(p, re.I), name, cat) for p, name, cat in KNOWN_MERCHANTS]

# NACH mandate codes are short; give the common ones readable names.
NACH_NAMES = {"PPFAS": "Parag Parikh MF", "JIOBL": "JioBlackRock MF", "ICICIPRU": "ICICI Prudential MF",
              "HDFCMF": "HDFC MF", "SBIMF": "SBI MF", "AXISMF": "Axis MF", "NIPPON": "Nippon India MF"}


@dataclass
class Suggestion:
    payee: str
    category_id: int | None
    source: str | None  # "rule" | "memory" | "known" | None


def _category_id(conn: sqlite3.Connection, name: str) -> int | None:
    if not name:
        return None
    row = conn.execute("SELECT id FROM categories WHERE name = ? AND archived = 0", (name,)).fetchone()
    return row[0] if row else None


def known_merchant(text: str) -> tuple[str, str] | None:
    lowered = text.lower()
    if "blinkit" in lowered:
        return "Blinkit", "Groceries"
    if "zomato" in lowered:
        return "Zomato", "Food delivery"
    for pattern, name, category in _COMPILED:
        if category and pattern.search(text):
            return name, category
    return None


def _apply_rules(conn: sqlite3.Connection, payee: str, description: str) -> tuple[str | None, int | None]:
    for rule in conn.execute("SELECT * FROM rules ORDER BY priority, id"):
        value = payee if rule["field"] == "payee" else description
        pattern = rule["pattern"]
        if rule["match"] == "equals":
            hit = value.strip().lower() == pattern.strip().lower()
        elif rule["match"] == "regex":
            try:
                hit = re.search(pattern, value, re.I) is not None
            except re.error:
                hit = False
        else:
            hit = pattern.lower() in value.lower()
        if hit:
            return rule["set_payee"], rule["set_category_id"]
    return None, None


def suggest(conn: sqlite3.Connection, payee: str, description: str, amount: int,
            narration: Narration | None = None) -> Suggestion:
    """Clean name and category for one transaction."""
    rule_payee, rule_category = _apply_rules(conn, payee, description)
    if rule_payee:
        payee = rule_payee
    if rule_category:
        return Suggestion(payee, rule_category, "rule")

    known = known_merchant(f"{payee} {narration.vpa if narration else ''} {description}")
    if known and known[0] and not rule_payee:
        payee = known[0]

    if narration and narration.kind == NACH:
        code = payee.split()[0].upper() if payee else ""
        payee = NACH_NAMES.get(code, payee)

    memory = conn.execute(
        "SELECT category_id FROM payee_memory WHERE payee = ? ORDER BY times_used DESC LIMIT 1", (payee,)
    ).fetchone()
    if memory:
        return Suggestion(payee, memory[0], "memory")

    if known:
        category = known[1]
        if category == "Salary" and amount < 0:
            category = ""
        if amount > 0 and category not in ("Salary", ""):
            category = "Refunds"  # money back from a shop
        if cid := _category_id(conn, category):
            return Suggestion(payee, cid, "known")

    if narration:
        by_kind = {
            INTEREST: "Interest" if amount > 0 else "",
            CHARGES: "Fees & charges" if amount < 0 else "",
            UPI_MANDATE: "Subscriptions" if amount < 0 else "",
            NACH: "Investments" if amount < 0 else "",
        }.get(narration.kind, "")
        if cid := _category_id(conn, by_kind):
            return Suggestion(payee, cid, "known")
        if narration.kind == ATM:
            return Suggestion("ATM withdrawal", None, None)

    return Suggestion(payee, None, None)


def learn(conn: sqlite3.Connection, payee: str, category_id: int | None) -> None:
    """Remember that this payee belongs in this category (called when you categorize something)."""
    if not payee or not category_id:
        return
    conn.execute(
        "INSERT INTO payee_memory (payee, category_id, times_used) VALUES (?, ?, 1)"
        " ON CONFLICT (payee) DO UPDATE SET"
        " times_used = CASE WHEN category_id = excluded.category_id THEN times_used + 1 ELSE 1 END,"
        " category_id = excluded.category_id",
        (payee, category_id),
    )
