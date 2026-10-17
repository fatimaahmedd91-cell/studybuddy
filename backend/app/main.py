"""FriendFinder backend.

Start it from the backend folder with:
    uvicorn app.main:app --reload
Then open http://127.0.0.1:8000/api/health or http://127.0.0.1:8000/docs

Each feature lives in its own file in app/ and adds its endpoints with include_router below.
"""

import logging
from contextlib import asynccontextmanager

import psycopg2
from fastapi import FastAPI
from fastapi.responses import JSONResponse

from app import ai, auth, demo, events, friends, groups, messages, notifications, people, profiles, screen_time
from app import config
from app.db import DatabaseNotConfigured, get_connection, run_migrations, timescale_in_use
from app.health import check_database, check_gemini
from app.security import TokenSecretMissing

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("friendfinder")
logging.getLogger("httpx").setLevel(logging.WARNING)  # hide one log line per Gemini request


@asynccontextmanager
async def lifespan(app):
    """Runs once when the server starts: creates or updates the tables if a database is set up."""
    if config.DATABASE_URL:
        try:
            run_migrations()
        except psycopg2.Error as error:
            log.warning("Could not set up the tables (%s). Check /api/health.", type(error).__name__)
    yield


app = FastAPI(title="FriendFinder API", lifespan=lifespan)

for feature in (auth, demo, profiles, people, friends, messages, groups, events, notifications, screen_time, ai):
    app.include_router(feature.router)


# If the database is missing or down, answer 503 with a short message instead of crashing.
@app.exception_handler(DatabaseNotConfigured)
@app.exception_handler(psycopg2.OperationalError)
async def database_unavailable(request, error):
    return JSONResponse({"detail": "The database is not available right now."}, status_code=503)


@app.exception_handler(TokenSecretMissing)
async def token_secret_missing(request, error):
    return JSONResponse({"detail": "The server is missing JWT_SECRET."}, status_code=503)


# This is a plain "def" (not "async def"), so FastAPI runs it in a background thread.
# That lets the checks wait on the network without freezing the rest of the server.
@app.get("/api/health")
def health():
    """Reports whether the API is running and whether the database and Gemini are reachable."""
    database = check_database()
    gemini = check_gemini()
    if database["ok"]:
        try:
            with get_connection() as conn, conn.cursor() as cur:
                database["timescaledb"] = timescale_in_use(cur)
        except psycopg2.Error:
            database["timescaledb"] = False

    body = {
        "status": "ok" if database["ok"] else "degraded",
        "database": database,
        # Gemini is optional: without it, match notes use templates, so it doesn't make the app "degraded".
        "gemini": gemini,
        "demo_mode": config.DEMO_MODE_ENABLED,
    }
    # 200 means the app works. 503 ("service unavailable") means the database is not reachable.
    return JSONResponse(body, status_code=200 if database["ok"] else 503)
