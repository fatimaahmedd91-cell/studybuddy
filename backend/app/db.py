"""Database helpers: open a connection, and create the tables.

We talk to Postgres (Tiger Data) with psycopg2. Each request opens its own short connection.
"""

from contextlib import contextmanager

import psycopg2
from psycopg2.extras import RealDictCursor

from app import config


class DatabaseNotConfigured(Exception):
    """Raised when DATABASE_URL is empty."""


# The users table. "IF NOT EXISTS" makes it safe to run every time the server starts.
# We store a password HASH (a scrambled version that cannot be turned back), never the password.
SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name          TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
"""


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


def init_db():
    """Creates the tables if they do not exist yet."""
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(SCHEMA)
