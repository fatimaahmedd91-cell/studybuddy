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
   - `JWT_SECRET`: a long random string (at least 32 characters). Make one with
     `python -c "import secrets; print(secrets.token_urlsafe(48))"` and paste the result.

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

### Accounts

The `users` table is created automatically when the server starts (if `DATABASE_URL` is set).

| Endpoint | Send | You get back |
|---|---|---|
| `POST /api/auth/signup` | `{"email", "password", "name"}` | 201 with `access_token` and `user` |
| `POST /api/auth/login` | `{"email", "password"}` | 200 with `access_token` and `user` |
| `GET /api/me` | header `Authorization: Bearer <access_token>` | 200 with your `id`, `email`, `name`, `created_at` |

Rules:
- Passwords must be 8 to 128 characters. Names must be 1 to 60 characters. Emails must be real-looking addresses.
- Emails are saved in lowercase, so `Amira@Example.com` and `amira@example.com` are the same account.
- Passwords are stored as Argon2 hashes, never as plain text, and no response ever includes a password or hash.
- Tokens last 7 days.

Errors you might see:
- `422`: something in the request is missing or invalid. The message says which field.
- `409`: an account with this email already exists.
- `401`: wrong email or password, or a missing, wrong, or expired token.
- `503`: the database is not set up or not reachable, or `JWT_SECRET` is missing.

**Try it in the browser:** open http://127.0.0.1:8000/docs.
1. Open `POST /api/auth/signup`, click **Try it out**, fill in the example, and click **Execute**.
2. Copy the `access_token` from the response.
3. Click **Authorize** at the top of the page, paste the token, and click **Authorize**.
4. Open `GET /api/me`, click **Try it out**, then **Execute**. You should see your account.

### POST /api/insight

Writes the "Why you might get along" note with Gemini. Send only what two people share:

```json
{"sharedInterests": ["Coding"], "sharedCourses": ["CSCA48"], "sharedSlots": [{"day": "Tue", "slot": "afternoon"}]}
```

- Any other field (like a name) is refused with 422, so personal details cannot be sent to the AI.
- Each visitor can ask for 30 notes per 10 minutes (429 after that), so strangers cannot use up the key.
- 503 if `GEMINI_API_KEY` is missing, 502 if Gemini fails. The website then shows the template note instead.

## Run the tests

```
pytest
```

Every test should say `PASSED`.
- The test that calls the real Gemini API is skipped if `GEMINI_API_KEY` is not set.
- The account tests need a database. They use `TEST_DATABASE_URL`, or `DATABASE_URL` if that is empty. They work inside a temporary private schema that is deleted afterwards, so your real users are never touched. With no database set, those tests are skipped.
