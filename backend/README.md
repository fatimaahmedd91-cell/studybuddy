# Meerkat API (Python + FastAPI)

(Some internal names still say "friendfinder", the project's first name: the server service, the logger, the database name in examples.)

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
Then call `POST /api/me/accept-terms` with `{"accept": true, "version": "<the current version>"}`. Until you do, most endpoints answer 403 `terms_required` (see "Rules every endpoint follows" below).

## Settings (`backend/.env`)

`.env.example` lists every setting with comments. Copy it to `.env` and fill it in. Real environment variables win over `.env`, which is handy on a server.

| Setting | Needed? | What it does | Without it |
|---|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL or TigerData connection string | `/api/health` says the database isn't available (503) |
| `JWT_SECRET` | yes | signs login tokens and memory photo links (32+ random characters) | logins answer 503 |
| `APP_ENV` | no | `development` (default) or `production`. Production protects demo data from an accidental reset and switches off the age-check test mode. | |
| `MIN_AGE` | no | minimum age to join. Default 18, the **proposed** policy (a team decision, see `docs/PRE_LAUNCH_CHECKLIST.md`). | |
| `TERMS_VERSION` | no | the Terms version people must accept. Raise it after a material change and everyone is asked again. | |
| `GEMINI_API_KEY` | no | Gemini match notes, hangout suggestions and timetable import | labelled "Suggested by Meerkat (not AI)" notes and suggestions; timetable import says it's unavailable (manual entry and `.ics` import still work) |
| `GEMINI_MODEL`, `GEMINI_TIMEOUT_SECONDS` | no | default `gemini-flash-lite-latest` and 12 | |
| `GOOGLE_MAPS_API_KEY` | no | real places near a halfway point (Places API (New), server key) | plain "search on Google Maps" links, labelled "not checked by Meerkat" |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | no | emails 6-digit codes for email verification | email verification shows "not set up" (503) |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` | no | texts codes through Twilio Verify for phone verification | phone verification shows "not set up" (503) |
| `AGE_CHECK_PROVIDER` | no | the hosted selfie age-check provider. **No real provider is integrated yet.** `mock` is a labelled test mode that only works with `APP_ENV=development` and never shows a badge. | "not available" (503), and no badge |
| `DEMO_MODE_ENABLED` | no | default `true`, which shows the "Try the demo" button | |
| `SERVE_WEBSITE`, `WEBSITE_DIR` | no | the API also sends the built website (Docker/Render). On Vultr, Caddy does this instead. | |
| `TEST_DATABASE_URL` | no | a separate database for `pytest` | tests use `DATABASE_URL`, inside a temporary private schema |

Nothing above is ever faked: if a service isn't set up, the endpoint and the website say so.

## Rules every endpoint follows

- **Logged in:** 🔒 means you must send `Authorization: Bearer <access_token>`. Without it: 401.
- **Terms gate:** if you haven't accepted the current `TERMS_VERSION`, 🔒 endpoints answer 403 with `{"detail": "terms_required"}`. The exceptions (`TERMS_EXEMPT` in `app/auth.py`) are `GET /me`, `POST /me/accept-terms`, `DELETE /me`, `GET /me/export` and `POST /privacy-requests`, so people can always see, leave or download their account.
- **Suspended accounts** get 403 on login and on every 🔒 endpoint.
- **Blocks** are enforced here, in both directions (`app/safety.py`): blocked people don't see each other's profiles, memories or posts in shared groups, can't send friend requests, messages or invitations, and don't get notifications from each other. Hidden things answer 404, as if they didn't exist.
- **Roles:** `member` (everyone), `moderator`, `admin`. Moderation endpoints check the role on the server.
- Errors always look like `{"detail": "A message you can show the user"}`.

## Endpoints

All start with `/api`.

### Health and accounts (`main.py`, `auth.py`, `demo.py`, `profiles.py`)

| Endpoint | | What it does |
|---|---|---|
| `GET /health` | | `{"status": "ok"}` (200) if the database works, `"degraded"` (503) if not. Also says whether Gemini and TimescaleDB are available, and whether demo mode is on. Uses no Gemini tokens. |
| `POST /auth/signup` | | `{email, password, name, accept_terms: true, terms_version}` → 201 `{access_token, user}`. `accept_terms` is the unticked "I am at least 18… and I agree to the Terms" box: 422 if it isn't true. 409 if the email is taken, or if `terms_version` isn't the current one. |
| `POST /auth/login` | | `{email, password}` → `{access_token, user}`. 401 if wrong, 403 if suspended. |
| `POST /auth/demo` | | Makes a new, filled-in demo account (fictional profile, AI features on) → 201 `{access_token, user}`. 403 if demo mode is off. The visitor still accepts the Terms first. |
| `GET /me` | 🔒 | Your full profile, including private fields only you see: email, phone, verification, free times, who sees them, time zone, notification choices, optional-feature choices, role, age-check status, and which Terms version you accepted |
| `PATCH /me` | 🔒 | Change any of: `name` (your display name), `pronouns, age, university, hook, bio, interests, looking_for, availability, avatar_emoji, avatar_color, stickers, daily_goal_minutes`, and the privacy settings `availability_audience` (`everyone`, `friends` or `nobody`), `discoverable`, `timezone` |
| `DELETE /me` | 🔒 | `{confirm: "DELETE"}`. Deletes your account and everything that's yours, including groups and events nobody else is in. |
| `PUT /me/photo` | 🔒 | `{image: "data:image/jpeg;base64,..."}`. JPEG up to 2 MB. Location and camera data are removed. |
| `DELETE /me/photo` | 🔒 | Back to the emoji avatar |
| `GET /photos/{id}` | | A profile photo |
| `GET /options` | | Suggested interests and universities, friendship goals, days, time slots, minimum age, current Terms version, notification categories |

### Settings, consent and your data (`account.py`)

| Endpoint | | What it does |
|---|---|---|
| `POST /me/accept-terms` | 🔒 | `{accept: true, version}`. Accepts the current Terms (stores the version and time). |
| `PATCH /me/email` | 🔒 | `{new_email, current_password}`. Changes your login email and removes its "verified" label. |
| `PATCH /me/phone` | 🔒 | `{phone: "+14165550123"}` (international format) or `{phone: null}`. Always private. Removes its "verified" label. |
| `PATCH /me/notification-prefs` | 🔒 | `{"messages": false, ...}`. Switches kinds of notifications on or off (the keys are in `GET /options`). |
| `GET /me/consents` | 🔒 | Your optional-feature choices, with what each one means |
| `PUT /me/consents/{key}` | 🔒 | `{granted: true}`. Keys: `ai_features` (Gemini) and `location_suggestions` (meeting areas). Turning location off deletes your saved meeting area. |
| `GET /me/export` | 🔒 | A copy of your data as JSON (works before accepting the Terms) |
| `POST /privacy-requests` | 🔒 | `{kind, details}`, kind is `access`, `correction`, `deletion`, `withdraw_consent` or `other`. Goes to the admins. Works before accepting the Terms. |
| `GET /privacy-requests` | 🔒 | Your own requests and their status |

### Verification (`verification.py`)

"Verified" is only set after a correct code. Codes expire after 10 minutes, allow 5 tries, can be resent after 60 seconds, at most 5 a day. Demo accounts can't verify (403).

| Endpoint | | What it does |
|---|---|---|
| `GET /verification` | 🔒 | What's verified, and which checks this server can do |
| `POST /verification/email/send` | 🔒 | Emails you a 6-digit code. Needs the `SMTP_*` settings (503 without them, 502 if sending fails). |
| `POST /verification/email/confirm` | 🔒 | `{code}` |
| `POST /verification/phone/send` | 🔒 | Texts a code through Twilio Verify. Needs the `TWILIO_*` settings (503 without them). Add a phone number first. |
| `POST /verification/phone/confirm` | 🔒 | `{code}` |
| `POST /verification/age/start` | 🔒 | `{consent: true}`. Would start a selfie age check with a hosted provider. No provider is integrated, so this answers 503 "not available". With `AGE_CHECK_PROVIDER=mock` and `APP_ENV=development` it records a **test** result that never shows a badge. Meerkat never looks at faces itself or asks Gemini to guess ages. |

### People and friends (`people.py`, `ai.py`, `friends.py`)

| Endpoint | | What it does |
|---|---|---|
| `GET /people` | 🔒 | Discover: people with a finished profile who chose to appear in Discover, best match first. Never blocked or suspended people. Filters: `?university= &interest= &goal= &free_together=true &q=name` |
| `GET /people/{id}` | 🔒 | One profile, the match (score, reasons, shared free times if their settings allow it), verification badges and your friendship status. 404 if either of you blocked the other. |
| `GET /people/{id}/insight` | 🔒 | The match note: Gemini (only if **both** of you turned on AI features), or the labelled fallback. Includes `source`, `fallback_reason` and `facts_sent`. |
| `GET /friends` | 🔒 | `{friends, incoming, outgoing}` |
| `POST /friends/requests` | 🔒 | `{user_id}`. 400 for yourself, 409 if already friends or already asked. If they had already asked you, you become friends. |
| `POST /friends/requests/{id}/accept` | 🔒 | Only the person who was asked (404 otherwise) |
| `POST /friends/requests/{id}/decline` | 🔒 | Only the person who was asked |
| `DELETE /friends/requests/{id}` | 🔒 | Cancel a request you sent |
| `DELETE /friends/{user_id}` | 🔒 | Remove a friend |

### Messages (`messages.py`)

| Endpoint | | What it does |
|---|---|---|
| `GET /conversations` | 🔒 | Your friends, each with the last message and an unread count |
| `GET /messages/{friend_id}` | 🔒 | The chat with one friend (marks it read). `?after_id=` returns only newer messages. |
| `POST /messages/{friend_id}` | 🔒 | `{body}`, up to 1000 characters. Friends only, never blocked people (403). |

### Groups and events (`groups.py`, `events.py`)

| Endpoint | | What it does |
|---|---|---|
| `GET /groups` | 🔒 | `?q= &tag= &mine=true` |
| `POST /groups` | 🔒 | `{name, description, tags}`. You join it automatically. |
| `GET /groups/{id}` | 🔒 | Details, members and upcoming events |
| `POST /groups/{id}/join` | 🔒 | 409 if you're already in it |
| `POST /groups/{id}/leave` | 🔒 | 404 if you're not in it |
| `GET /groups/{id}/posts` | 🔒 | The discussion. Members only (403). Posts by people you blocked (or who blocked you) are hidden. |
| `POST /groups/{id}/posts` | 🔒 | `{body}`. Members only. |
| `GET /events` | 🔒 | `?when=upcoming` (default) or `past`, `&group_id=` |
| `POST /events` | 🔒 | `{title, description, starts_at, ends_at, location, online_url, group_id}`. Times must include a time zone. The start must be in the future and within a year. An event lasts at most 24 hours and needs a location or an `http(s)` link. For a group event you must be a member. |
| `GET /events/{id}` | 🔒 | Details and who's going |
| `POST /events/{id}/rsvp` | 🔒 | "I'm going" (409 if you already are, 400 if it's over) |
| `DELETE /events/{id}/rsvp` | 🔒 | Not going any more |

### Private schedule (`commitments.py`)

Only the owner can ever read their commitments. No endpoint returns anyone else's titles, places or times.

| Endpoint | | What it does |
|---|---|---|
| `GET /commitments` | 🔒 | Your commitments, buffer time and time zone |
| `POST /commitments` | 🔒 | `{title, kind, location, recurrence ("none" or "weekly"), weekday, start_date, end_date, start_time, end_time, timezone}`. An end time earlier than the start means it ends the next day (overnight shifts). |
| `PATCH /commitments/{id}` | 🔒 | Change one of yours (404 if it isn't yours) |
| `DELETE /commitments/{id}` | 🔒 | Delete one of yours |
| `PATCH /me/schedule-settings` | 🔒 | `{buffer_minutes}` (0–120): time kept free before and after each commitment |
| `POST /commitments/import/ics` | 🔒 | `{text: "BEGIN:VCALENDAR..."}` → proposals with warnings. **Saves nothing.** |
| `POST /commitments/import/ai` | 🔒 | `{file: "data:image/png;base64,...", consent: true}`. PNG, JPEG or PDF up to 5 MB. Gemini reads the timetable → proposals. **Saves nothing**, and the file is never stored or logged. Needs `GEMINI_API_KEY`. |
| `POST /commitments/bulk` | 🔒 | `{entries: [...], source}`. Saves the proposals you reviewed and skips duplicates. |

### Planning a hangout (`planning.py`)

Free times are worked out exactly in code (`app/scheduling.py`); Gemini never decides times.

| Endpoint | | What it does |
|---|---|---|
| `POST /planning/slots` | 🔒 | `{friend_ids: [...]}` (friends only) or `{group_id}` (members only), plus `start_date, end_date` (up to 14 days) and `duration_minutes` → shared free slots, and a status for each person (`included`, `public_only` or `no_availability`). Never anyone's commitments. |
| `POST /planning/suggest` | 🔒 | The same, plus `slots` (up to 5 of the calculated ones) and `refresh`. Gemini picks the best times and ideas only if **everyone** included turned on AI features; otherwise a labelled template. Saved and reused for up to an hour. |
| `GET /planning/consents` | 🔒 | Who may use your private schedule when planning |
| `PUT /planning/consents` | 🔒 | `{scope: "friends"}` or `{scope: "group", group_id}` |
| `DELETE /planning/consents` | 🔒 | `?scope=friends` or `?scope=group&group_id=5` |
| `GET /planning/area-presets` | | Campuses, stations and neighbourhoods you can pick as your meeting area |
| `GET /me/meeting-origin` | 🔒 | Your own meeting area (nobody else can read it) |
| `PUT /me/meeting-origin` | 🔒 | `{preset: "union"}` or `{lat, lng, label}` (rounded to about 1 km). Needs the `location_suggestions` consent (403 without it). |
| `DELETE /me/meeting-origin` | 🔒 | Forget your meeting area |
| `POST /planning/area` | 🔒 | The same people as `/slots`, plus `activity` and `budget` → an approximate straight-line halfway point (about 1 km, or about 5 km with only two people), and places from Google Places, or labelled map links without `GOOGLE_MAPS_API_KEY`. Never returns anyone's area. |
| `POST /planning/create-event` | 🔒 | `{title, starts_at, ends_at, location or online_url, invitee_ids, group_id}`. Makes an event and invites friends (403 for anyone who isn't your friend). |

### Memories (`memories.py`)

| Endpoint | | What it does |
|---|---|---|
| `GET /memories` | 🔒 | Memories you're allowed to see, newest first, 10 at a time. `?before_id=` the next page, `?author_id=` one person's |
| `POST /memories` | 🔒 | `{caption, audience, photos}`. Audience `friends` (default), `everyone` or `only_me`. Up to 4 photos. |
| `GET /memories/{id}` | 🔒 | One memory (404 if you aren't allowed to see it) |
| `PATCH /memories/{id}` | 🔒 | `{caption, audience}`. Only the author. |
| `DELETE /memories/{id}` | 🔒 | Deletes it with its photos and comments. Only the author. |
| `POST /memories/{id}/reaction` | 🔒 | Add your ❤️ |
| `DELETE /memories/{id}/reaction` | 🔒 | Take it back |
| `GET /memories/{id}/comments` | 🔒 | The comments |
| `POST /memories/{id}/comments` | 🔒 | `{body}` |
| `DELETE /memories/{id}/comments/{comment_id}` | 🔒 | Its writer, or the memory's author |
| `GET /memory-photos/{uuid}?exp=&sig=` | | A memory photo, through a signed link that expires after about an hour. Links are only given to people allowed to see the memory. |

### Notifications and screen time (`notifications.py`, `screen_time.py`, `screen_time_groups.py`)

| Endpoint | | What it does |
|---|---|---|
| `GET /notifications` | 🔒 | `{items, unread_count}`, newest first. Only the kinds you switched on, never from blocked people. |
| `POST /notifications/{id}/read` | 🔒 | Mark one as read |
| `POST /notifications/read-all` | 🔒 | Mark all as read |
| `POST /screen-time/heartbeat` | 🔒 | The website sends this every 30 s while you're using it. Each one adds 30 s, but beats less than 25 s apart don't count. This is **time in Meerkat** only. |
| `GET /screen-time?tz=America/Toronto` | 🔒 | Time in Meerkat today and the last 7 days, your goal, and `storage` (`timescaledb` or `postgresql`) |
| `GET /screen-time/entries?days=14` | 🔒 | Your **self-reported** phone screen time (typed in by you) |
| `PUT /screen-time/entries/{day}` | 🔒 | `{minutes}` for today or up to 13 days back |
| `DELETE /screen-time/entries/{day}` | 🔒 | Remove one day |
| `GET /screen-time/groups` | 🔒 | Your screen-time groups and invitations |
| `POST /screen-time/groups` | 🔒 | `{name, description, metric ("self_reported" or "in_app"), daily_target_minutes}` |
| `GET /screen-time/groups/{id}` | 🔒 | Members see everything; invited people see the basics; anyone else gets 404 |
| `POST /screen-time/groups/{id}/invite` | 🔒 | `{user_ids}`. Members invite their friends (never blocked people). |
| `POST /screen-time/groups/{id}/accept` | 🔒 | `{share: true}`. Join and agree to share your totals. |
| `POST /screen-time/groups/{id}/decline` | 🔒 | Say no to an invitation |
| `POST /screen-time/groups/{id}/leave` | 🔒 | Stop sharing (the group stops seeing all your numbers). The last member leaving deletes the group. |
| `GET /screen-time/groups/{id}/leaderboard?day=` | 🔒 | Highest first. People with no entry are listed separately as "No entry", never counted as zero. |

Device-wide screen time (from a phone's settings) is **not** available: a website can't read it, so Meerkat never claims to.

### Safety (`safety.py`)

| Endpoint | | What it does |
|---|---|---|
| `GET /blocks` | 🔒 | The people you blocked |
| `POST /blocks` | 🔒 | `{user_id}`. Also ends any friendship or friend request between you. They aren't told. |
| `DELETE /blocks/{user_id}` | 🔒 | Unblock |
| `POST /reports` | 🔒 | `{target_type, target_id, reason, details}`. Targets: `profile`, `message`, `memory`, `group`, `event`, `group_post` (only things you can see). 409 if you already have an open report on it, 400 for your own content. |
| `GET /reports/reasons` | | The report reasons and their labels |

### Moderation (`moderation.py`) — moderators and admins only (403 for members)

| Endpoint | Who | What it does |
|---|---|---|
| `GET /moderation/reports?status=open` | moderator | The report queue (`open`, `dismissed` or `actioned`) |
| `POST /moderation/reports/{id}/dismiss` | moderator | `{note}`. Close a report without action. |
| `POST /moderation/reports/{id}/remove-content` | moderator | `{note}`. Remove what was reported (a profile's text and photo are cleared). |
| `POST /moderation/users/{id}/suspend` | moderator | `{reason, report_id}`. They can't log in until unsuspended. |
| `POST /moderation/users/{id}/unsuspend` | moderator | `{note}` |
| `GET /moderation/actions` | moderator | The log of every moderator action (never edited) |
| `GET /moderation/privacy-requests?status=open` | admin | Privacy requests (`open` or `done`) |
| `POST /moderation/privacy-requests/{id}/done` | admin | `{note}`. Mark one as handled. |

Give someone a role from the server (there's deliberately no button for it):

```
python -m app.roles list
python -m app.roles set someone@example.com moderator    # or admin
python -m app.roles set someone@example.com member       # takes the role away
```

### The website (`website.py`)

Only when `SERVE_WEBSITE=true`: every address that isn't `/api/...` sends a page of the built website from `WEBSITE_DIR`.

### Common errors

| Code | Means |
|---|---|
| 401 | Not logged in, or the token expired. The website logs you out. |
| 403 | Logged in, but not allowed (not friends, not a member, not a moderator, suspended), or `terms_required` |
| 404 | Doesn't exist, isn't yours, or is hidden from you (for example by a block) |
| 409 | Already done (already friends, already joined, already reported…) |
| 422 | Something in the request is missing or wrong. The message says what. |
| 429 | Too many requests. Wait and try again. |
| 502 | An outside service (email, Twilio) failed. Nothing was marked as done. |
| 503 | The database isn't reachable, `JWT_SECRET` is missing, or an optional service isn't set up |

## Database tables (`app/migrations/`)

They run by themselves, in order, when the API starts. Never edit one after it's been merged: add a new numbered file.

| File | What it adds |
|---|---|
| `001_users.sql` | accounts (a password hash, never the password) |
| `002_social.sql` | profiles, friendships, messages, groups, events, notifications, time in the app, saved AI match notes |
| `003_meerkat_foundation.sql` | Terms acceptance, roles, suspension, contact verification, privacy settings, notification and optional-feature choices, blocks, reports, the moderation log, privacy requests |
| `004_memories.sql` | memories, their photos, reactions and comments |
| `005_schedules_planning.sql` | private commitments, buffer time, planning permissions, meeting areas, saved plan suggestions |
| `006_screen_time_groups.sql` | self-reported screen time, screen-time groups, members and invitations |

## Demo data

```
python -m app.seed                               # adds the fictional people, groups and events if missing. Never deletes.
python -m app.seed --reset --yes                 # deletes ALL demo data (incl. "Try the demo" accounts) and adds it back
python -m app.seed --reset --yes --allow-production   # the same, on a server with APP_ENV=production
```

Real accounts are never touched. "Try the demo" accounts are deleted after 24 hours.

## Tests

`pytest` runs the tests (227 passed in the latest full run). They cover every endpoint, the website serving, the permission checks (the wrong person trying each action), blocks, the Terms gate, consent, input checks, demo mode, the seed command, and Gemini.

- Most tests need a database. They work in a temporary private schema that's deleted afterwards, so your real data is never touched.
  With no database set, those tests are skipped.
- Gemini, Twilio, SMTP and Google Places are replaced by fakes in the tests. Two tests call the real Gemini API, and they're skipped if `GEMINI_API_KEY` isn't set. Real email, text messages and Places searches are **not** tested.
