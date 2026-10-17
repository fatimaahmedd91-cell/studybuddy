"""Checks used by GET /api/health.

Each check returns a small dictionary: {"ok": True or False, "detail": "a short reason"}.
The details never include error messages from the database, because those can contain
parts of the connection string. They only name the type of error.
"""

import psycopg2
from google import genai
from google.genai import errors, types

from app import config

# Give up on a slow service after this many seconds, so the health check stays quick.
TIMEOUT_SECONDS = 5


def check_database():
    """Opens a connection to the database and runs SELECT 1."""
    if not config.DATABASE_URL:
        return {"ok": False, "detail": "DATABASE_URL is not set"}
    try:
        connection = psycopg2.connect(config.DATABASE_URL, connect_timeout=TIMEOUT_SECONDS)
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
        finally:
            connection.close()
        return {"ok": True, "detail": "connected"}
    except Exception as error:
        return {"ok": False, "detail": f"could not connect ({type(error).__name__})"}


def check_gemini():
    """Asks Gemini for the details of our model. This checks the key and the connection
    without generating any text, so it uses no tokens."""
    if not config.GEMINI_API_KEY:
        return {"ok": False, "detail": "GEMINI_API_KEY is not set"}
    try:
        client = genai.Client(
            api_key=config.GEMINI_API_KEY,
            http_options=types.HttpOptions(timeout=TIMEOUT_SECONDS * 1000),  # in milliseconds
        )
        client.models.get(model=config.GEMINI_MODEL)
        return {"ok": True, "detail": f"reachable ({config.GEMINI_MODEL})"}
    except errors.APIError as error:
        # Google answered with an error, for example 400 for a wrong key.
        return {"ok": False, "detail": f"Gemini refused the request ({error.code} {error.status})"}
    except Exception as error:
        return {"ok": False, "detail": f"could not reach Gemini ({type(error).__name__})"}
