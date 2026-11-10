"""Default categories and settings, inserted once into a new database."""

from __future__ import annotations

import sqlite3

# (group, kind, [(category, lucide icon, colour, bucket)])
DEFAULT_CATEGORIES: list[tuple[str, str, list[tuple[str, str, str, str | None]]]] = [
    ("Home & bills", "expense", [
        ("Rent", "house", "#7c6cf2", "need"),
        ("Groceries", "shopping-basket", "#3fa06b", "need"),
        ("Bills & recharges", "receipt", "#4f8fd8", "need"),
    ]),
    ("Food", "expense", [
        ("Food delivery", "bike", "#ef7a3c", "want"),
        ("Eating out", "utensils", "#e0565b", "want"),
    ]),
    ("Getting around", "expense", [
        ("Transport & fuel", "fuel", "#5f7a8c", "need"),
        ("Cabs", "car", "#d1a23a", "want"),
    ]),
    ("Lifestyle", "expense", [
        ("Shopping", "shopping-bag", "#d45d9c", "want"),
        ("Subscriptions", "repeat", "#8a5cd6", "want"),
        ("Entertainment", "clapperboard", "#c2476f", "want"),
        ("Travel", "plane", "#2fa5a5", "want"),
    ]),
    ("Health & growth", "expense", [
        ("Health", "heart-pulse", "#e05a6d", "need"),
        ("Education", "graduation-cap", "#4c7bd9", "need"),
    ]),
    ("People", "expense", [
        ("Gifts & family", "gift", "#e48a5c", "want"),
    ]),
    ("Money", "expense", [
        ("EMI & loans", "landmark", "#6b6f80", "need"),
        ("Insurance", "shield", "#5a8f7b", "need"),
        ("Investments", "trending-up", "#2f9e72", "saving"),
        ("Fees & charges", "badge-percent", "#9a7b5f", "need"),
    ]),
    ("Other", "expense", [
        ("Misc", "shapes", "#8b8693", "want"),
    ]),
    ("Income", "income", [
        ("Salary", "briefcase", "#2f9e72", None),
        ("Freelance", "laptop", "#3fa06b", None),
        ("Interest", "piggy-bank", "#5a8f7b", None),
        ("Refunds", "undo-2", "#4f8fd8", None),
        ("Other income", "plus", "#8b8693", None),
    ]),
]

DEFAULT_SETTINGS = {
    "currency": "INR",
    "locale": "en-IN",
    "month_start_day": "1",
    "theme": "system",
}


def seed_defaults(conn: sqlite3.Connection) -> None:
    with conn:
        for key, value in DEFAULT_SETTINGS.items():
            conn.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (key, value))

        has_categories = conn.execute("SELECT 1 FROM categories LIMIT 1").fetchone()
        if has_categories:
            return
        for group_sort, (group, kind, categories) in enumerate(DEFAULT_CATEGORIES):
            group_id = conn.execute(
                "INSERT INTO category_groups (name, kind, sort) VALUES (?, ?, ?)",
                (group, kind, group_sort),
            ).lastrowid
            for sort, (name, icon, color, bucket) in enumerate(categories):
                conn.execute(
                    "INSERT INTO categories (group_id, name, icon, color, bucket, sort)"
                    " VALUES (?, ?, ?, ?, ?, ?)",
                    (group_id, name, icon, color, bucket, sort),
                )


def category_ids(conn: sqlite3.Connection) -> dict[str, int]:
    return {row["name"]: row["id"] for row in conn.execute("SELECT id, name FROM categories")}
