# FriendFinder API (Python + FastAPI)

How to set it up and run it: see "Run it on your own computer" in the [main README](../README.md).
In short, from this folder, with the virtual environment active:

```
pip install -r requirements.txt
python -m app.seed               # tables + fictional demo data (safe to run again)
uvicorn app.main:app --reload    # http://127.0.0.1:8000
pytest                           # the tests
```

**Try every endpoint in the browser:** open http://127.0.0.1:8000/docs.
Call `POST /api/auth/demo` (or sign up), copy the `access_token`, click **Authorize**, and paste it in.

## Settings (`backend/.env`)

| Setting | Needed? | What it does |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL or TigerData connection string |
| `JWT_SECRET` | yes | signs login tokens (32+ random characters) |
| `APP_ENV` | no | `development` (default) or `production`, which protects demo data from an accidental reset |
| `GEMINI_API_KEY` | no | turns on Gemini match notes. Without it, the labelled fallback is used. |
| `GEMINI_MODEL` | no | default `gemini-flash-lite-latest` |
| `GEMINI_TIMEOUT_SECONDS` | no | default 12 |
| `DEMO_MODE_ENABLED` | no | default `true`, which shows the "Try the demo" button |
| `TEST_DATABASE_URL` | no | a separate database for `pytest` (otherwise it uses `DATABASE_URL`, inside a temporary private schema) |

Real environment variables win over `.env`, which is handy on a server.

## Endpoints

All start with `/api`. 🔒 means you must send `Authorization: Bearer <access_token>`.
Errors always look like `{"detail": "A message you can show the user"}`.

### Health and accounts

| Endpoint | | What it does |
|---|---|---|
| `GET /health` | | `{"status": "ok"}` (200) if the database works, `"degraded"` (503) if not. Also says whether Gemini and TimescaleDB are available. Uses no Gemini tokens. |
| `POST /auth/signup` | | `{email, password, name, confirm_age: true}` → 201 `{access_token, user}`. 409 if the email is taken, 422 if `confirm_age` isn't true. |
| `POST /auth/login` | | `{email, password}` → `{access_token, user}`. 401 if wrong. |
| `POST /auth/demo` | | Makes a new, filled-in demo account → 201 `{access_token, user}`. 403 if demo mode is off. |
| `GET /me` | 🔒 | Your full profile, including email and free times (only you see these) |
| `PATCH /me` | 🔒 | Change any profile fields: `name, pronouns, age, university, hook, bio, interests, looking_for, availability, avatar_emoji, avatar_color, stickers, daily_goal_minutes` |
| `DELETE /me` | 🔒 | `{confirm: "DELETE"}`. Deletes your account and everything that's yours. |
| `PUT /me/photo` | 🔒 | `{image: "data:image/jpeg;base64,..."}`. JPEG up to 2 MB. Location and camera data are removed. |
| `DELETE /me/photo` | 🔒 | Back to the emoji avatar |
| `GET /photos/{id}` | | A profile photo |
| `GET /options` | | Suggested interests and universities, friendship goals, days, time slots, minimum age |

### People and friends

| Endpoint | | What it does |
|---|---|---|
| `GET /people` | 🔒 | Discover: everyone with a finished profile, best match first. Filters: `?university= &interest= &goal= &free_together=true &q=name` |
| `GET /people/{id}` | 🔒 | One profile, the match (score, reasons, shared free times) and your friendship status |
| `GET /people/{id}/insight` | 🔒 | The match note: Gemini, or the labelled fallback. Includes `source`, `fallback_reason` and `facts_sent`. |
| `GET /friends` | 🔒 | `{friends, incoming, outgoing}` |
| `POST /friends/requests` | 🔒 | `{user_id}`. 400 for yourself, 409 if already friends or already asked. If they had already asked you, you become friends. |
| `POST /friends/requests/{id}/accept` | 🔒 | Only the person who was asked (404 otherwise) |
| `POST /friends/requests/{id}/decline` | 🔒 | Only the person who was asked |
| `DELETE /friends/requests/{id}` | 🔒 | Cancel a request you sent |
| `DELETE /friends/{user_id}` | 🔒 | Remove a friend |

### Messages

| Endpoint | | What it does |
|---|---|---|
| `GET /conversations` | 🔒 | Your friends, each with the last message and an unread count |
| `GET /messages/{friend_id}` | 🔒 | The chat with one friend (marks it read). `?after_id=` returns only newer messages. |
| `POST /messages/{friend_id}` | 🔒 | `{body}`, up to 1000 characters. Friends only (403 otherwise). |

### Groups and events

| Endpoint | | What it does |
|---|---|---|
| `GET /groups` | 🔒 | `?q= &tag= &mine=true` |
| `POST /groups` | 🔒 | `{name, description, tags}`. You join it automatically. |
| `GET /groups/{id}` | 🔒 | Details, members and upcoming events |
| `POST /groups/{id}/join` | 🔒 | 409 if you're already in it |
| `POST /groups/{id}/leave` | 🔒 | 404 if you're not in it |
| `GET /groups/{id}/posts` | 🔒 | The discussion. Members only (403). |
| `POST /groups/{id}/posts` | 🔒 | `{body}`. Members only. |
| `GET /events` | 🔒 | `?when=upcoming` (default) or `past`, `&group_id=` |
| `POST /events` | 🔒 | `{title, description, starts_at, ends_at, location, online_url, group_id}`. Times must include a time zone. The start must be in the future and within a year. An event lasts at most 24 hours and needs a location or an `http(s)` link. For a group event you must be a member. |
| `GET /events/{id}` | 🔒 | Details and who's going |
| `POST /events/{id}/rsvp` | 🔒 | "I'm going" (409 if you already are, 400 if it's over) |
| `DELETE /events/{id}/rsvp` | 🔒 | Not going any more |

### Notifications and screen time

| Endpoint | | What it does |
|---|---|---|
| `GET /notifications` | 🔒 | `{items, unread_count}`, newest first |
| `POST /notifications/{id}/read` | 🔒 | Mark one as read |
| `POST /notifications/read-all` | 🔒 | Mark all as read |
| `POST /screen-time/heartbeat` | 🔒 | The website sends this every 30 s while you're using it. Each one adds 30 s, but beats less than 25 s apart don't count. |
| `GET /screen-time?tz=America/Toronto` | 🔒 | Today, the last 7 days, your goal, and `storage` (`timescaledb` or `postgresql`) |

### Common errors

| Code | Means |
|---|---|
| 401 | Not logged in, or the token expired. The website logs you out. |
| 403 | Logged in, but not allowed (for example: not friends, not a member) |
| 404 | Doesn't exist, or isn't yours to change |
| 409 | Already done (already friends, already joined…) |
| 422 | Something in the request is missing or wrong. The message says what. |
| 429 | Too many requests. Wait and try again. |
| 503 | The database isn't reachable, or `JWT_SECRET` is missing |

## Tests

`pytest` runs 117 tests. They cover every endpoint, the permission checks (the wrong person trying each action), input checks, demo mode, the seed command, and Gemini.

- Most tests need a database. They work in a temporary private schema that's deleted afterwards, so your real data is never touched.
  With no database set, those tests are skipped.
- Gemini is replaced by a fake in most tests. One test calls the real Gemini API, and it's skipped if `GEMINI_API_KEY` isn't set.
