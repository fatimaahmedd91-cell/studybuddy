# How FriendFinder fits together

```
 Browser (phone or laptop)
   │  https://your-domain.com
   ▼
 Caddy (on the Vultr server): HTTPS certificate, security headers
   ├── /api/*  ───────────────►  FastAPI backend (Python, port 8000, only reachable from the server itself)
   │                                ├── PostgreSQL / TigerData: every account, friendship, message, group, event…
   │                                └── Google Gemini: writes match notes (optional)
   └── everything else ───────►  frontend/out/ : the website, built once into plain HTML, CSS and JavaScript
```

While developing, `npm run dev` (port 3000) does Caddy's job: it serves the pages and forwards `/api/*` to the API on port 8000 (`frontend/next.config.ts`).
So the website and the API always share one address, and the browser never needs special cross-site (CORS) rules.

## The website (`frontend/`)

- **Next.js App Router, exported as static files** (`output: "export"`). There's no Node.js server in production. Every page is plain HTML that loads data from the API in the browser.
- One folder per page in `src/app/`. Pages that show one item use a query string (`/profile?id=3`, `/groups?id=2`, `/events?id=5`, `/messages?with=7`), because a static export can't have a file for every id.
- `src/components/AppShell.tsx` draws the header, sidebar and phone tab bar. It also sends you to the right place:
  logged-out visitors go to `/login`, new accounts go to `/onboarding` until their profile is finished, and logged-in people skip the landing page.
- `src/lib/api.ts` is the **only** place that calls the API. It adds the login token, turns errors into readable messages, and logs you out if the token has expired.
- `src/lib/auth.tsx` keeps track of who is logged in. The token is kept in the browser's `localStorage` (`ff_token`).
- `src/lib/useApi.ts` loads data for a page, and can re-check it every few seconds while the tab is visible (that's how new messages and notifications appear).
- Colours and fonts live in one place: `src/app/globals.css` (`@theme`).

## The API (`backend/`)

- **FastAPI.** Each file in `backend/app/` handles one area and lists its endpoints at the top:

  | File | Handles |
  |---|---|
  | `auth.py`, `security.py` | sign up, log in, login tokens, password hashing |
  | `demo.py`, `seed.py`, `seed_data.py` | "Try the demo" and the fictional demo data |
  | `profiles.py`, `users.py` | your profile, photos, deleting your account, what other people may see |
  | `people.py`, `matching.py` | Discover, and the match score with its reasons |
  | `friends.py`, `messages.py` | friend requests, friends, direct messages |
  | `groups.py`, `events.py` | groups, group discussion, events, RSVPs |
  | `notifications.py` | the bell |
  | `screen_time.py` | time spent in the app |
  | `ai.py`, `prompts.py` | Gemini match notes and the fallback |
  | `ratelimit.py` | limits on how often someone can sign up, log in, message, etc. |
  | `db.py`, `migrations/` | database connection and tables |
  | `config.py` | reads settings from `backend/.env` |

- **Login:** passwords are hashed with Argon2. Logging in returns a signed token (JWT, valid 7 days) that the website sends with every request.
  `CurrentUser` in `auth.py` checks the token on every protected endpoint.
- **Permission checks happen on the server**, every time. You can only accept requests sent to you, message friends, read a group's discussion as a member, and so on.
  The tests in `backend/tests/` try the wrong person for each of these.
- **Input checks:** every request body is a Pydantic model with lengths and allowed values. Unknown fields are refused.
- **Rate limits** (in memory, per address or per account): sign-ups, log-ins, demo accounts, friend requests, messages and AI notes.
  They reset when the API restarts. For one server that's fine. With several servers they'd need to move into the database or Redis.

## The database

- **Tables** are created by numbered SQL files in `backend/app/migrations/`. The API runs any new ones when it starts, and records which have run in `schema_migrations`.
  An advisory lock stops two copies of the API from running them at once.
- Main tables: `users`, `photos`, `friendships` (one row per pair, `pending` or `accepted`), `messages`, `groups`, `group_members`, `group_posts`, `events`, `event_rsvps`, `notifications`, `app_time`, `match_insights`.
- Deleting an account deletes everything that belongs to it (`ON DELETE CASCADE`). It also deletes groups and events that nobody else is in.
- **TigerData / TimescaleDB:** if the database has the TimescaleDB extension (TigerData does), `app_time` becomes a hypertable. Then the screen-time chart is added up with `time_bucket()`.
  On plain PostgreSQL the same chart groups by the date in your time zone. `/api/health` and the Screen Time page say which one is in use.

## Matching (`backend/app/matching.py`)

A simple, explainable score out of 100:

| Shared | Points |
|---|---|
| each interest | 10 (up to 40) |
| each friendship goal ("Study buddy", "Gaming"…) | 10 (up to 20) |
| same university | 15 |
| each time slot you're both free | 5 (up to 25) |

Every point comes with a reason ("You both like Coding and Hiking"), and those reasons are what Discover shows. No AI is used to rank people.

## Gemini match notes (`backend/app/ai.py`, `backend/app/prompts.py`)

1. The website asks `GET /api/people/{id}/insight`.
2. The API builds a small list of **shared facts only**: shared interests, shared friendship goals, the university name if it's the same, and up to 6 shared free times.
   No names, emails, ages, bios, photos or anything else. The website shows exactly what was sent ("What was sent to Gemini?").
3. If a note for exactly these facts is already saved, it's returned straight away. The cache is keyed by the pair of people, the facts, the model and `PROMPT_VERSION`.
4. Otherwise Gemini (`GEMINI_MODEL`, default `gemini-flash-lite-latest`) is asked for JSON in a fixed shape: explanation, conversation starter, activity.
   The answer is checked against that shape and for length, and refused if it mentions dating or romance.
5. If there's no key, a timeout (`GEMINI_TIMEOUT_SECONDS`), a quota error, a bad answer or too many requests, the API writes a note from a template instead.
   It's labelled **"Suggested by FriendFinder (not AI)"** with the reason. Fallback notes are saved for 10 minutes, then Gemini is tried again.

## Screen time

While a FriendFinder tab is open, visible, and has been used in the last minute, the website sends a "heartbeat" every 30 seconds. Each heartbeat adds 30 seconds.
The server ignores heartbeats that come too close together, so two open tabs don't count double. Only time in FriendFinder is counted. A website can't see other apps.

## Demo mode

`POST /api/auth/demo` makes a new account filled with a fictional profile. It comes with two friend requests waiting and one friend who has sent two messages.
All demo people, groups and events have `is_demo = true` and use `@demo.friendfinder.invalid` emails, which can't receive mail. The website shows a **Demo** badge on them.
Demo visitor accounts can't log in with a password, are hidden from Discover, and are deleted after 24 hours.

## What's deliberately simple

- **Messages and notifications use polling** (asking every few seconds), not WebSockets. It's simple and reliable, and the delay is a few seconds.
- **Photos are stored in the database** (up to 2 MB, JPEG only, metadata such as GPS location removed). Fine for a hackathon. A bigger app would use object storage.
- **One API process.** Rate limits and caches are kept in memory or in Postgres, so nothing else is needed to run it.
