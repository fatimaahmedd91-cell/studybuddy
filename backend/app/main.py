"""FriendFinder backend.

Start it from the backend folder with:
    uvicorn app.main:app --reload
Then open http://127.0.0.1:8000/api/health or http://127.0.0.1:8000/docs
"""

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from app.health import check_database, check_gemini

app = FastAPI(title="FriendFinder API")


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
