"""Realistic sample data for demo mode, tests and README screenshots.

Generates about six months of a young professional's money in India: salary,
rent, a SIP, subscriptions, UPI spends, a credit card paid off every month and
cash from the ATM. Descriptions follow ICICI's statement style so the importer
and categorizer can be exercised on them. All names and numbers are made up.
"""

from __future__ import annotations

import random
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import date, timedelta

from hisaab.db.seed import category_ids


@dataclass(frozen=True)
class Merchant:
    payee: str
    vpa: str
    bank: str
    category: str
    low: int  # rupees
    high: int


DELIVERY = [
    Merchant("Swiggy", "swiggyupi@axb", "AXIS BANK", "Food delivery", 180, 650),
    Merchant("Zomato", "zomato-order@ptybl", "YES BANK", "Food delivery", 200, 700),
]
GROCERY = [
    Merchant("Zepto", "zepto.pay@axl", "AXIS BANK", "Groceries", 150, 900),
    Merchant("Blinkit", "blinkit.payu@hdfcbank", "HDFC BANK", "Groceries", 120, 800),
]
SMALL = [
    Merchant("Chai Point", "chaipoint@icici", "ICICI Bank", "Eating out", 20, 60),
    Merchant("M S Tea Stall", "ibkpos.ep00001@icici", "ICICI Bank", "Eating out", 15, 40),
    Merchant("7 Eleven", "7eleven@jio", "JIO PAYMEN", "Groceries", 60, 250),
]
CABS = [
    Merchant("Uber", "uber.rides@hdfcbank", "HDFC BANK", "Cabs", 90, 380),
    Merchant("Rapido", "rapido.bike@ybl", "YES BANK", "Cabs", 40, 160),
]
EATING_OUT = [
    Merchant("Third Wave Coffee", "thirdwave@icici", "ICICI Bank", "Eating out", 250, 600),
    Merchant("Social", "social.gurgaon@hdfcbank", "HDFC BANK", "Eating out", 900, 2600),
]
CARD_SHOPS = [
    ("Amazon", "Shopping", 350, 3500),
    ("Myntra", "Shopping", 600, 2800),
    ("PVR Cinemas", "Entertainment", 350, 900),
    ("Apollo Pharmacy", "Health", 150, 1200),
    ("Indian Oil", "Transport & fuel", 500, 1500),
]
CASH_SPENDS = [
    ("Vegetable vendor", "Groceries", 40, 200),
    ("Auto rickshaw", "Cabs", 30, 120),
    ("Barber", "Misc", 150, 300),
]


def _ref(rng: random.Random) -> str:
    return str(rng.randint(10**11, 10**12 - 1))


def _upi(m: Merchant, rng: random.Random) -> str:
    return f"UPI/{m.payee}/{m.vpa}/Payment/{m.bank}/{_ref(rng)}/ICI{uuid.UUID(int=rng.getrandbits(128)).hex}"


def generate_demo(conn: sqlite3.Connection, today: date | None = None, months: int = 6,
                  seed: int = 7) -> None:
    """Fill an empty, migrated database with demo data."""
    rng = random.Random(seed)
    today = today or date.today()
    start = (today.replace(day=1) - timedelta(days=1)).replace(day=1)
    for _ in range(months - 2):
        start = (start - timedelta(days=1)).replace(day=1)

    cats = category_ids(conn)
    rows: list[tuple] = []

    def add(account: int, day: date, rupees: float, payee: str, category: str | None,
            raw: str = "", transfer: str | None = None, reviewed: int = 1) -> None:
        if day > today:
            return
        rows.append((account, day.isoformat(), round(rupees * 100), payee, raw,
                     cats[category] if category else None, transfer, reviewed))

    def transfer(src: int, dst: int, day: date, rupees: float, label: str, raw: str) -> None:
        if day > today:
            return
        tid = uuid.UUID(int=rng.getrandbits(128)).hex
        add(src, day, -rupees, label, None, raw, tid)
        add(dst, day, rupees, label, None, raw, tid)

    with conn:
        cur = conn.cursor()
        opening = start.isoformat()
        cur.executemany(
            "INSERT INTO accounts (name, kind, opening_balance, opening_date, sort) VALUES (?,?,?,?,?)",
            [("ICICI Savings", "bank", 145_000_00, opening, 0),
             ("Credit card", "credit_card", 0, opening, 1),
             ("Cash", "cash", 2_500_00, opening, 2)],
        )
        bank, card, cash = (r[0] for r in cur.execute("SELECT id FROM accounts ORDER BY sort"))

        month = start
        card_spend_last_month = 0.0
        while month <= today:
            nxt = (month + timedelta(days=32)).replace(day=1)
            days = [month + timedelta(days=i) for i in range((nxt - month).days)]

            add(bank, month, 85_000, "Acme Technologies", "Salary",
                f"NEFT/ACME TECHNOLOGIES PVT LTD/SALARY {month:%b %Y}".upper())
            add(bank, month.replace(day=3), -22_000, "Landlord", "Rent",
                f"MMT/IMPS/{_ref(rng)}/Rent/Person A/HDFC0001234")
            add(bank, month.replace(day=5), -10_000, "Parag Parikh Flexi Cap SIP", "Investments",
                f"ACH/PPFAS {month:%d%m%Y}/CAMS/{_ref(rng)}")
            add(bank, month.replace(day=8), -59, "Spotify", "Subscriptions",
                f"UPI/Spotify In/spotify@icici/MandateReq/ICICI Bank/{_ref(rng)}")
            add(bank, month.replace(day=12), -rng.randint(1_100, 2_400), "BSES Electricity",
                "Bills & recharges", f"BIL/BBPS/{_ref(rng)}/BSES RAJDHANI")
            add(bank, month.replace(day=20), -349, "Jio Prepaid", "Bills & recharges",
                f"BIL/RCHG/{_ref(rng)}/JIO")
            add(card, month.replace(day=14), -199, "Netflix", "Subscriptions", "NETFLIX.COM MUMBAI")
            transfer(bank, cash, month.replace(day=rng.randint(6, 10)), 2_000, "ATM withdrawal",
                     f"NFS/CASH WDL/{_ref(rng)}/GURGAON")
            if card_spend_last_month:
                transfer(bank, card, month.replace(day=15), round(card_spend_last_month, 2),
                         "Credit card bill", f"BIL/INFT/{_ref(rng)}/CREDIT CARD PAYMENT")
            if month.month in (3, 6, 9, 12):
                add(bank, days[-1], rng.randint(900, 1_600), "Savings interest", "Interest",
                    "INTEREST CREDIT")

            card_spend = 199.0
            for day in days:
                weekend = day.weekday() >= 5
                if rng.random() < (0.55 if weekend else 0.35):
                    m = rng.choice(DELIVERY)
                    add(bank, day, -rng.randint(m.low, m.high), m.payee, m.category, _upi(m, rng))
                if rng.random() < 0.3:
                    m = rng.choice(GROCERY)
                    add(bank, day, -rng.randint(m.low, m.high), m.payee, m.category, _upi(m, rng))
                if rng.random() < 0.6:
                    m = rng.choice(SMALL)
                    add(bank, day, -rng.randint(m.low, m.high), m.payee, m.category, _upi(m, rng))
                if rng.random() < 0.35:
                    m = rng.choice(CABS)
                    add(bank, day, -rng.randint(m.low, m.high), m.payee, m.category, _upi(m, rng))
                if weekend and rng.random() < 0.3:
                    m = rng.choice(EATING_OUT)
                    add(bank, day, -rng.randint(m.low, m.high), m.payee, m.category, _upi(m, rng))
                if rng.random() < 0.12:
                    shop, category, low, high = rng.choice(CARD_SHOPS)
                    spend = rng.randint(low, high)
                    if day <= today:
                        card_spend += spend
                    add(card, day, -spend, shop, category, f"{shop.upper()} GURGAON IN")
                if rng.random() < 0.25:
                    what, category, low, high = rng.choice(CASH_SPENDS)
                    add(cash, day, -rng.randint(low, high), what, category)
            if rng.random() < 0.5:
                add(card, days[rng.randint(10, 25)], rng.randint(300, 1_200), "Amazon", "Shopping",
                    "AMAZON REFUND")
            card_spend_last_month = card_spend
            month = nxt

        # The most recent few transactions wait in the review inbox, uncategorized, like a fresh import.
        rows.sort(key=lambda r: r[1])
        recent = [i for i, r in enumerate(rows) if r[0] == bank and r[6] is None][-8:]
        for i in recent:
            r = rows[i]
            rows[i] = (r[0], r[1], r[2], r[3], r[4], None, r[6], 0)

        cur.executemany(
            "INSERT INTO transactions (account_id, date, amount, payee, raw_description, category_id,"
            " transfer_id, reviewed) VALUES (?,?,?,?,?,?,?,?)",
            rows,
        )
        cur.execute(
            "INSERT OR REPLACE INTO payee_memory (payee, category_id, times_used)"
            " SELECT payee, category_id, COUNT(*) FROM transactions"
            " WHERE category_id IS NOT NULL AND transfer_id IS NULL GROUP BY payee, category_id"
        )
