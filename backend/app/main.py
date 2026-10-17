"""FriendFinder backend.

Start it from the backend folder with:
    uvicorn app.main:app --reload
Then open http://127.0.0.1:8000/api/health or http://127.0.0.1:8000/docs
"""

import logging
from contextlib import asynccontextmanager

import psycopg2
from fastapi import FastAPI
from fastapi.responses import JSONResponse

from app import config
from app.auth import router as auth_router
from app.db import DatabaseNotConfigured, init_db
from app.health import check_database, check_gemini
from app.security import TokenSecretMissing

log = logging.getLogger("friendfinder")


@asynccontextmanager
async def lifespan(app):
    """Runs once when the server starts: creates the tables if a database is set up."""
    if config.DATABASE_URL:
        try:
            init_db()
        except psycopg2.Error as error:
            log.warning("Could not create the tables (%s). Check /api/health.", type(error).__name__)
    yield


app = FastAPI(title="FriendFinder API", lifespan=lifespan)
app.include_router(auth_router)


# If the database is missing or down, answer 503 with a short message instead of crashing.
@app.exception_handler(DatabaseNotConfigured)
@app.exception_handler(psycopg2.OperationalError)
async def database_unavailable(request, error):
    return JSONResponse({"detail": "The database is not available right now"}, status_code=503)


@app.exception_handler(TokenSecretMissing)
async def token_secret_missing(request, error):
    return JSONResponse({"detail": "The server is missing JWT_SECRET"}, status_code=503)


# This is a plain "def" (not "async def"), so FastAPI runs it in a background thread.
# That lets the checks wait on the network without freezing the rest of the server.
@app.get("/api/health")
def health():
    """Reports whether the API is running and whether the database and Gemini are reachable."""
    database = check_database()
    gemini = check_gemini()
    all_ok = database["ok"] and gemini["ok"]

    body = {
        "status": "ok" if all_ok else "degraded",
        "database": database,
        "gemini": gemini,
    }
    # 200 means everything works. 503 ("service unavailable") means the API itself is up,
    # but something it needs is not.
    return JSONResponse(body, status_code=200 if all_ok else 503)
