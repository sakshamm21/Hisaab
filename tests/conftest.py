from datetime import date

import pytest
from fastapi.testclient import TestClient

from hisaab.app import create_app
from hisaab.db import open_database
from hisaab.demo import generate_demo

TODAY = date(2026, 11, 10)


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "test.db"


@pytest.fixture
def demo_db(db_path):
    conn = open_database(db_path)
    generate_demo(conn, today=TODAY)
    yield conn
    conn.close()


@pytest.fixture
def client(demo_db, db_path, tmp_path):
    app = create_app(db_path, demo=True, static_dir=tmp_path / "no-ui")
    with TestClient(app) as c:
        yield c
