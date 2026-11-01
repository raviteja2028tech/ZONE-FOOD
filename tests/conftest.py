"""Shared fixtures: each test session builds a throw-away PostgreSQL database and MongoDB database
(migrated from empty, then seeded), so the tests never touch the developer's working data."""
from __future__ import annotations

import os
import subprocess
import sys
import uuid
from pathlib import Path

import psycopg
import pytest
from pymongo import MongoClient

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import migrate  # noqa: E402
from db_config import mongo_uri, pg_dsn  # noqa: E402

PY = sys.executable


def run_script(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run([PY, *args], cwd=ROOT, capture_output=True, text=True, timeout=300, env={**os.environ})


@pytest.fixture(scope="session")
def test_db_name():
    name = f"zf_test_{uuid.uuid4().hex[:8]}"
    yield name
    migrate.drop_database(name)
    client = MongoClient(mongo_uri(), serverSelectionTimeoutMS=8000)
    client.drop_database(name)
    client.close()


@pytest.fixture(scope="session")
def seeded_db(test_db_name):
    """Migrated from empty, then seeded. Returns the database name."""
    assert migrate.run_up(test_db_name) == len(migrate.migration_files())
    result = run_script("scripts/seed.py", "--db", test_db_name, "--mongo-db", test_db_name)
    assert result.returncode == 0, result.stdout + result.stderr
    return test_db_name


@pytest.fixture
def conn(seeded_db):
    """A connection whose work is always rolled back, so constraint tests leave no trace."""
    c = psycopg.connect(pg_dsn(seeded_db))
    yield c
    c.rollback()
    c.close()


@pytest.fixture(scope="session")
def mongo(seeded_db):
    client = MongoClient(mongo_uri(), serverSelectionTimeoutMS=8000)
    yield client[seeded_db]
    client.close()
