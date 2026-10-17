# FriendFinder backend (Python + FastAPI)

## First-time setup

Run these from the `backend` folder.

1. Make a virtual environment (a private folder of Python packages for this project):
   ```
   python -m venv .venv
   ```
2. Turn it on. You need to do this every time you open a new terminal:
   - Windows: `.venv\Scripts\activate`
   - Mac: `source .venv/bin/activate`

   Your prompt now starts with `(.venv)`.
3. Install the packages:
   ```
   pip install -r requirements.txt
   ```
4. Make your secrets file. Copy `.env.example` to a new file called `.env` in this same folder, then fill in:
   - `GEMINI_API_KEY`: your own key from aistudio.google.com → Get API key.
   - `DATABASE_URL`: the Tiger Data connection string. Leave it empty until you have one.

   `.env` is ignored by git. Run `git status` and make sure `.env` is **not** listed before you commit.

## Run the API

```
uvicorn app.main:app --reload
```

`--reload` restarts the server every time you save a file. Press Ctrl+C to stop it.

## Endpoints

### GET /api/health

Open http://127.0.0.1:8000/api/health in your browser. You get something like:

```json
{
  "status": "ok",
  "database": {"ok": true, "detail": "connected"},
  "gemini": {"ok": true, "detail": "reachable (gemini-flash-lite-latest)"}
}
```

- `status` is `"ok"` (HTTP 200) when both work, and `"degraded"` (HTTP 503) when something is missing.
- `detail` says what is wrong, for example `DATABASE_URL is not set` or `Gemini refused the request (400 INVALID_ARGUMENT)` for a wrong key.
- The Gemini check only asks for the model's details, so it uses no tokens.

You can also try every endpoint at http://127.0.0.1:8000/docs.

## Run the tests

```
pytest
```

Every test should say `PASSED`. The test that calls the real Gemini API is skipped if `GEMINI_API_KEY` is not set.
