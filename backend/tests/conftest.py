"""Shared test setup (pytest loads this file automatically).

Tests that need a database ask for the "database" fixture. It creates a private, temporary
schema (a separate set of tables) inside TEST_DATABASE_URL, or DATABASE_URL if that is not set.
So the tests never touch your real data, and the schema is deleted when the tests finish.
If neither variable is set, the database tests are skipped.
"""

import os
import uuid

import psycopg2
import pytest
from fastapi.testclient import TestClient

from app import config, db, main, ratelimit

TEST_DB_URL = os.getenv("TEST_DATABASE_URL") or config.DATABASE_URL
REAL_GEMINI_KEY = config.GEMINI_API_KEY  # kept for the one test that calls the real Gemini

ALL_TABLES = (
    "users, photos, friendships, messages, groups, group_members, group_posts, events, event_rsvps, "
    "notifications, app_time, match_insights"
)


@pytest.fixture(autouse=True)
def safe_settings(monkeypatch):
    """Every test gets a known JWT_SECRET, no Gemini key, and fresh rate limits."""
    monkeypatch.setattr(config, "JWT_SECRET", "test-secret-that-is-long-enough-1234567890")
    monkeypatch.setattr(config, "GEMINI_API_KEY", "")
    monkeypatch.setattr(config, "DEMO_MODE_ENABLED", True)
    ratelimit.reset_all()


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
    """Points the app at the private schema, with every table empty."""
    monkeypatch.setattr(config, "DATABASE_URL", test_database_url)
    db.run_migrations()
    with db.get_connection() as conn, conn.cursor() as cur:
        cur.execute(f"TRUNCATE {ALL_TABLES} RESTART IDENTITY CASCADE")


@pytest.fixture
def client():
    return TestClient(main.app)


def run_sql(url, sql):
    conn = psycopg2.connect(url)
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()
    finally:
        conn.close()
