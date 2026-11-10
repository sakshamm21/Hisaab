from hisaab.db import open_database
from hisaab.db.connection import migrate
from hisaab.money import from_minor, to_minor


def test_migrations_apply_once_and_seed_defaults(db_path):
    conn = open_database(db_path)
    version = conn.execute("PRAGMA user_version").fetchone()[0]
    assert version >= 1
    assert migrate(conn) == version  # running again changes nothing
    open_database(db_path).close()  # reopening must not duplicate categories
    names = [r[0] for r in conn.execute("SELECT name FROM categories")]
    assert len(names) == len(set(names))
    assert {"Rent", "Food delivery", "Salary", "Investments"} <= set(names)
    settings = dict(conn.execute("SELECT key, value FROM settings").fetchall())
    assert settings["currency"] == "INR" and settings["locale"] == "en-IN"


def test_money_is_exact():
    assert to_minor("1,23,456.78") == 12345678
    assert to_minor("0.1") + to_minor("0.2") == to_minor("0.3")
    assert to_minor("10.005") == 1001  # half up
    assert str(from_minor(-2200000)) == "-22000.00"
