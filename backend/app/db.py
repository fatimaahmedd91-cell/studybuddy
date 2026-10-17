"""Database helpers: open a connection, and set up the tables.

We talk to PostgreSQL (TigerData in the cloud, or any Postgres) with psycopg2.
Each request opens its own short connection.

Tables are created by the numbered .sql files in app/migrations/. To change the database,
add a NEW file (for example 003_add_badges.sql); never edit one that already ran.
"""

import logging
from contextlib import contextmanager
from pathlib import Path

import psycopg2
from psycopg2.extras import RealDictCursor

from app import config

log = logging.getLogger("friendfinder")
MIGRATIONS_DIR = Path(__file__).resolve().parent / "migrations"


class DatabaseNotConfigured(Exception):
    """Raised when DATABASE_URL is empty."""


@contextmanager
def get_connection():
    """Opens a connection, saves (commits) the changes if everything worked, and always closes it.

    Use it like this:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute("SELECT ...")
    Rows come back as dictionaries, for example row["email"].
    """
    if not config.DATABASE_URL:
        raise DatabaseNotConfigured("DATABASE_URL is not set")
    conn = psycopg2.connect(config.DATABASE_URL, connect_timeout=5, cursor_factory=RealDictCursor)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()  # Undo half-finished changes if something went wrong.
        raise
    finally:
        conn.close()


def run_migrations():
    """Runs every migration file that has not run yet, in name order. Safe to call on every start."""
    with get_connection() as conn, conn.cursor() as cur:
        # Only one server at a time may run migrations.
        cur.execute("SELECT pg_advisory_xact_lock(4242)")
        cur.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations ("
            " name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"
        )
        cur.execute("SELECT name FROM schema_migrations")
        done = {row["name"] for row in cur.fetchall()}
        for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
            if path.name in done:
                continue
            log.info("Running migration %s", path.name)
            cur.execute(path.read_text(encoding="utf-8"))
            cur.execute("INSERT INTO schema_migrations (name) VALUES (%s)", (path.name,))
    enable_timescale()


def enable_timescale():
    """TigerData databases include TimescaleDB, an extension for time-series data.

    If it is available, the app_time table (time spent in the app) becomes a "hypertable",
    which keeps time-based queries fast as it grows. On plain PostgreSQL this does nothing,
    and everything still works. Returns True when TimescaleDB is in use.
    """
    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute("SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb'")
            if not cur.fetchone():
                return False
            cur.execute("CREATE EXTENSION IF NOT EXISTS timescaledb")
            cur.execute("SELECT create_hypertable('app_time', 'at', if_not_exists => TRUE, migrate_data => TRUE)")
        return True
    except psycopg2.Error as error:
        log.warning("TimescaleDB is available but could not be enabled (%s). Using plain tables.", type(error).__name__)
        return False


def timescale_in_use(cur):
    """True if app_time is a TimescaleDB hypertable in this database."""
    cur.execute("SELECT 1 FROM pg_extension WHERE extname = 'timescaledb'")
    if not cur.fetchone():
        return False
    cur.execute(
        "SELECT 1 FROM timescaledb_information.hypertables WHERE hypertable_name = 'app_time'"
        " AND hypertable_schema = current_schema()"
    )
    return cur.fetchone() is not None
