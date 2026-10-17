"""Shared test setup (pytest loads this file automatically).

Tests that need a database ask for the "database" fixture. It creates a private, temporary
schema (a separate set of tables) inside TEST_DATABASE_URL, or DATABASE_URL if that is not set.
So the tests never touch your real users, and the schema is deleted when the tests finish.
If neither variable is set, the database tests are skipped.
"""

import os
import uuid

import psycopg2
import pytest

from app import config, db

TEST_DB_URL = os.getenv("TEST_DATABASE_URL") or config.DATABASE_URL


@pytest.fixture(autouse=True)
def jwt_secret(monkeypatch):
    """Every test gets a known JWT_SECRET, so tests do not depend on your .env."""
    monkeypatch.setattr(config, "JWT_SECRET", "test-secret-that-is-long-enough-1234567890")


@pytest.fixture(scope="session")
def test_database_url():
    if not TEST_DB_URL:
        pytest.skip("Set TEST_DATABASE_URL or DATABASE_URL in backend/.env to run the database tests")

    schema = f"pytest_{uuid.uuid4().hex[:8]}"
    run_sql(TEST_DB_URL, f'CREATE SCHEMA "{schema}"')
    # "options=-csearch_path=..." makes every connection use the private schema.
    joiner = "&" if "?" in TEST_DB_URL else "?"
    url = f"{TEST_DB_URL}{joiner}options=-csearch_path%3D{schema}"

    # Safety check before any test deletes rows: make sure we really are in the private schema.
    conn = psycopg2.connect(url)
    with conn.cursor() as cur:
        cur.execute("SELECT current_schema()")
        current = cur.fetchone()[0]
    conn.close()
    if current != schema:
        run_sql(TEST_DB_URL, f'DROP SCHEMA "{schema}" CASCADE')
        pytest.fail("Could not switch to a private test schema, so the database tests did not run")

    yield url
    run_sql(TEST_DB_URL, f'DROP SCHEMA "{schema}" CASCADE')


@pytest.fixture
def database(test_database_url, monkeypatch):
    """Points the app at the private schema, with an empty users table."""
    monkeypatch.setattr(config, "DATABASE_URL", test_database_url)
    db.init_db()
    with db.get_connection() as conn, conn.cursor() as cur:
        cur.execute("TRUNCATE users RESTART IDENTITY")


def run_sql(url, sql):
    conn = psycopg2.connect(url)
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()
    finally:
        conn.close()
