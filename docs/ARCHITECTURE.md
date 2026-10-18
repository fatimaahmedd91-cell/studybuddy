# How Meetkat fits together

```
 Browser (phone or laptop)
   │  https://your-domain.com
   ▼
 Caddy (on the Vultr server): HTTPS certificate, security headers
   ├── /api/*  ───────────────►  FastAPI backend (Python, port 8000, only reachable from the server itself)
   │                                ├── PostgreSQL / TigerData: accounts, friendships, messages, memories, schedules…
   │                                ├── Google Gemini (optional): match notes, hangout suggestions, reading timetables
   │                                ├── Google Places (optional): places near a halfway point
   │                                └── SMTP / Twilio Verify (optional): email and phone codes
   └── everything else ───────►  frontend/out/ : the website, built once into plain HTML, CSS and JavaScript
```

While developing, `npm run dev` (port 3000) does Caddy's job (in Codespaces, open port 8000 instead, where the API serves the built site): it serves the pages and forwards `/api/*` to the API on port 8000 (`frontend/next.config.ts`).
On Render (and in the `Dockerfile`), the API serves the built website itself (`SERVE_WEBSITE=true`, `backend/app/website.py`).
Either way, the website and the API share one address, so the browser never needs cross-site (CORS) rules.
Every key stays on the server. The website never sees one.

## The website (`frontend/`)

- **Next.js App Router, exported as static files** (`output: "export"`). There's no Node.js server in production. Every page is plain HTML that loads data from the API in the browser.
- One folder per page in `src/app/`. Pages that show one item use a query string (`/profile?id=3`, `/groups?id=2`, `/events?id=5`, `/messages?with=7`, `/plan?tab=schedule`), because a static export can't have a file for every id.
- `src/components/AppShell.tsx` draws the header, sidebar and phone tab bar, and sends you to the right place:
  logged-out visitors go to `/login`, new accounts to `/onboarding`, and anyone who hasn't accepted the current Terms sees the Terms screen (`TermsGate.tsx`).
  `/terms`, `/privacy` and `/guidelines` open without an account.
- `src/lib/api.ts` holds the request helpers (`get`, `send`, `query`). They add the login token, turn errors into readable messages, and log you out if the token has expired.
  Bigger features keep their calls in their own file next to it: `lib/memories.ts`, `lib/planning.ts`, `lib/screenTime.ts`.
- `src/lib/auth.tsx` keeps track of who is logged in. The token is kept in the browser's `localStorage` (`ff_token`).
- `src/lib/useApi.ts` loads data for a page, and can re-check it every few seconds while the tab is visible (that's how new messages and notifications appear).
- Colours and fonts live in one place: `src/app/globals.css` (`@theme`). The name and slogan live in `src/lib/brand.ts`. The legal texts live in `src/content/legal.ts`.
- Hiding a button is never the only protection. The server checks every permission again.

## The API (`backend/`)

- **FastAPI.** Each file in `backend/app/` handles one area and lists its endpoints at the top. `main.py` adds them, one per line.

  | File | Handles |
  |---|---|
  | `auth.py`, `security.py` | sign up (with Terms acceptance), log in, login tokens, password hashing, the Terms gate |
  | `demo.py`, `seed.py`, `seed_data.py` | "Try the demo" and the fictional demo data |
  | `profiles.py`, `users.py` | your profile, photos, deleting your account, what other people may see, badges |
  | `account.py` | email/phone changes, notification choices, optional consents, Terms acceptance, data export, privacy requests |
  | `verification.py` | email codes (SMTP), phone codes (Twilio Verify), the age-check boundary |
  | `people.py`, `matching.py` | Discover, and the match score with its reasons |
  | `friends.py`, `messages.py` | friend requests, friends, direct messages |
  | `groups.py`, `events.py` | groups, group discussion, events, RSVPs; owners and organisers can edit, delete or cancel |
  | `memories.py` | the memories feed, photos, hearts, comments |
  | `commitments.py`, `ics.py`, `scheduling.py` | your private schedule, imports, and the free-time maths |
  | `planning.py` | shared free times, suggestions, planning permissions, meeting areas, making an event |
  | `notifications.py` | the bell, and which kinds you want |
  | `screen_time.py`, `screen_time_groups.py` | time in the app, self-reported screen time, screen-time groups |
  | `safety.py`, `moderation.py`, `roles.py` | blocking, reporting, the moderators' area, setting roles |
  | `ai.py`, `prompts.py` | Gemini calls and their fallbacks; everything Gemini is told |
  | `website.py` | serving the built website (Render / Docker only) |
  | `ratelimit.py`, `db.py`, `migrations/`, `config.py` | rate limits, the database, tables, settings from `backend/.env` |

- **Login:** Argon2 password hashes. Logging in returns a signed token (JWT, valid 7 days). `CurrentUser` in `auth.py` checks it on every protected endpoint,
  refuses suspended accounts, and refuses anyone who hasn't accepted the current `TERMS_VERSION` (except to read, export or delete their own account).
  Tokens made before your last password change are refused too, so changing or resetting your password logs out every other device.
  Forgot password emails a 6-digit code (`account.py`); the answer is the same for every email, so it can't reveal who has an account.
- **Permission checks happen on the server**, every time: messaging only friends, members-only discussions, owner-only schedules, memory audiences, moderators-only actions…
  The tests in `backend/tests/` try the wrong person for each of these.
- **Blocking** works both ways and is checked in every place two people could meet: Discover, profiles, friend requests, messages, memories, notifications, group posts, planning.
- **Input checks:** every request body is a Pydantic model with lengths and allowed values. Unknown fields are refused.
- **Rate limits** (in memory, per address or per account) on sign-ups, log-ins, demo accounts, messages, reports, codes and AI calls.
  They reset when the API restarts. Fine for one server. With several servers they'd need to move into the database or Redis.

## The database

- **Tables** are created by numbered SQL files in `backend/app/migrations/` (`001`–`007`). The API runs any new ones when it starts, and records which have run in `schema_migrations`.
  An advisory lock stops two copies of the API from running them at once. Never edit a migration that's been merged: add the next number.
- Main tables: `users`, `photos`, `friendships`, `messages`, `groups`, `group_members`, `group_posts`, `events`, `event_rsvps`, `notifications`, `app_time`, `match_insights`,
  plus `blocks`, `reports`, `moderation_actions`, `privacy_requests`, `contact_verifications`, `memories` (+ photos, reactions, comments), `commitments`, `planning_consents`,
  `meeting_origins`, `plan_suggestions`, `screen_time_entries`, `st_groups`, `st_members`.
- Settings and choices on `users`: `terms_version`, `terms_accepted_at`, `role`, `suspended_at`, `email_verified_at`, `phone`, `phone_verified_at`, `availability_audience`,
  `discoverable`, `timezone`, `buffer_minutes`, `notification_prefs` and `consents` (JSON, each with the time it was given).
- Deleting an account deletes everything that belongs to it (`ON DELETE CASCADE`), plus groups and events nobody else is in. Reports stay without the reporter; moderation logs stay.
- **TigerData / TimescaleDB:** if the database has TimescaleDB, `app_time` becomes a hypertable and the screen-time chart uses `time_bucket()`.

## Matching (`backend/app/matching.py`)

A simple, explainable score out of 100: 10 per shared interest (up to 40), 10 per shared friendship goal (up to 20), 15 for the same university,
5 per free-time slot you're both free (up to 25, and only if the other person shows you their free times). Every point comes with a reason. No AI ranks people.

## Free times and planning (`scheduling.py`, `planning.py`)

1. Each person's **public** free times (morning/afternoon/evening boxes) count only if their availability choice (everyone / friends / nobody) lets you see them.
2. Their **private** commitments (with their buffer time) are subtracted only if they allowed it for friends' plans, or for that group (during their current membership).
   Otherwise they're never even loaded. Your own always count for you.
3. Everyone's free time is intersected, in each person's own time zone. Overnight shifts, one-off and weekly entries, and end dates are handled. Slots shorter than the chosen length are dropped.
4. The answer contains only the free slots and, per person, whether they're included. Never titles, places or reasons.

## Gemini (`ai.py`, `planning.py`, `commitments.py`, `prompts.py`)

Gemini is only used when a person has turned **AI features** on (both people for a match note, everyone for a hangout plan; fictional demo accounts have it on).

| Use | What Gemini receives | Checks |
|---|---|---|
| Match note | shared interests, shared goals, the university if it's the same, up to 6 shared free times | JSON schema, length, no dating words; cached per pair + facts + model + `PROMPT_VERSION` |
| Hangout suggestion | group size, shared interests and goals, the calculated slots (by id) | may only pick slot ids it was given; slot codes in the text are replaced by the real times; saved for an hour |
| Timetable reading | the image or PDF the person chose to send, once | file type and size checked; nothing saved until the person reviews it; the file isn't kept |

If there's no key, a timeout, a quota error, a bad answer or too many requests, a template is used instead, labelled **"Suggested by Meetkat (not AI)"** with the reason.
Keys are only in `backend/.env`.

## Meeting areas (`planning.py`)

People who turn on meeting-area suggestions can save a campus/station preset or their location rounded to ~1 km. Nobody else can read it.
The halfway point is a straight-line average, rounded to ~1 km (~5 km when only two people plan, so you can't work back to the other person's area), and labelled "not based on travel time".
With `GOOGLE_MAPS_API_KEY`, Google Places gets only the halfway point and the kind of place. Otherwise, or if it fails, plain Google Maps search links are shown, labelled as not checked.

## Screen time

- **In Meetkat:** while a tab is open, visible and used in the last minute, the website sends a heartbeat every 30 seconds. Too-close heartbeats are ignored, so two tabs don't count double.
- **Self-reported:** numbers people type in, always labelled. A website can't read a phone's screen time, so Meetkat never claims to.
- **Groups** use one of these two for everyone. Members join only by choosing to share. Missing days show as "No entry", never zero.

## Demo mode

`POST /api/auth/demo` makes a fictional account with two friend requests waiting and one friend who has sent messages. Demo visitors still accept the Terms.
All demo people, groups and events have `is_demo = true` and `@demo.friendfinder.invalid` emails. The website shows a **Demo** badge.
Demo visitor accounts can't log in with a password, are hidden from Discover, can't use email/phone codes, and are deleted after 24 hours.

## What's deliberately simple

- **Messages and notifications use polling**, not WebSockets. Simple and reliable, with a few seconds' delay. No emails or push notifications are sent.
- **Photos are stored in the database** (JPEG, size-limited, location data removed). Memory photos are served through links that expire after an hour.
- **One API process.** Rate limits are kept in memory; caches are in Postgres.
