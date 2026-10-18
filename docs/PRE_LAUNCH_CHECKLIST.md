# Pre-launch checklist

Meerkat works as a hackathon demo. Before real people use it, the team needs to decide or finish everything below.
Nothing here has been reviewed by a lawyer, and nothing in the app claims legal compliance.

Legend: **Decision** = the team has to choose · **Legal** = needs qualified legal/privacy review · **Setup** = configuration · **Build** = code still to write

## 1. Product decisions (need the team's confirmation)

| # | Item | Type | Current state in the code |
|---|---|---|---|
| 1 | **Minimum age.** 18+ is the *proposed* launch policy. | Decision | `MIN_AGE=18`. Sign-up asks for an unticked "I am at least 18…" box. Minors and adults are never mixed, because minors can't join. Changing this needs a full safety review: how minors and adults may interact is not designed. |
| 2 | **How age is checked.** A checkbox is only a self-declaration. | Decision | No age-assurance provider is integrated. The selfie flow is switched off, and no "Age checked" badge can appear. |
| 3 | **Which age-assurance provider** (if any), and whether it *estimates* age or *verifies* a document. | Decision + Legal | Integration boundary only (`backend/app/verification.py`, `AGE_PROVIDERS`). Biometric (selfie) data is sensitive. Assess before enabling, and complete Privacy Policy §6 first. |
| 4 | **Default audiences.** | Decision | Profiles: logged-in members (can hide from Discover). Public free times: everyone (choice: friends / nobody). Memories: friends. Contact details, private schedule, meeting area: never shown. |
| 5 | **AI on or off by default.** | Decision | Off for real accounts until each person turns it on. On for fictional demo accounts. |
| 6 | **Blocking policy in shared groups and events.** | Decision | Member and attendee lists stay visible to both people. In a shared group's discussion, each person's posts are hidden from the other. |
| 7 | **Who moderates, and how fast.** | Decision | Reports wait in a queue. Nobody is on call. The app never promises 24/7 moderation. Roles are set with `python -m app.roles`. |
| 8 | **Retention periods** for every data category. | Decision + Legal | Kept until account deletion. Moderation logs and reports are kept, the latter without the reporter. Uploaded timetables are never stored. |
| 9 | **Leaving a screen-time group**: do past entries stay visible? | Decision | They are hidden from the group once you leave. |
| 10 | **Planning permissions.** Should private schedules ever be usable by default? | Decision | No. Each person allows "plans friends make with me" and/or each group separately; without that, only their public free times count. A group permission ends when they leave the group. |
| 11 | **Meeting areas.** The preset list is Toronto-area campuses and stations; the halfway point is a straight line. | Decision | `AREA_PRESETS` in `backend/app/planning.py`. Rounded to ~1 km (~5 km with two people). Not travel time, cost, accessibility or safety, and the page says so. |

## 2. Legal documents (`frontend/src/content/legal.ts`)

| # | Item | Type |
|---|---|---|
| 12 | Fill in `LEGAL_CONFIG`: operator's legal name, support, privacy and moderation emails, mailing address, effective dates, Privacy Policy version. | Setup |
| 13 | Replace every remaining `[INSERT …]` placeholder. The pages count them and show "Draft — not ready to publish" until none are left. | Setup |
| 14 | Privacy Policy §2: remove categories you don't collect; list analytics, cookies and tracking (today: none; the browser's local storage holds the login token). | Legal |
| 15 | Privacy Policy §5: confirm Gemini's retention, training-use and processing-location details for your API account and region. | Legal |
| 16 | Privacy Policy §7–8: the real provider table (Gemini, Places, Twilio, SMTP, host, database) and the countries data goes to. | Legal |
| 17 | Privacy Policy §10: confirm the security controls listed in the "Draft check" note, then move them into the text. | Legal |
| 18 | Remove every "Draft check" note once the text matches the code. | Setup |
| 19 | Have the Terms, Privacy Policy and Guidelines reviewed by someone qualified (Ontario/Canada; PIPEDA and meaningful-consent guidance). | Legal |
| 20 | When the Terms change materially, raise `TERMS_VERSION`. Everyone is asked to accept again. Nobody is assumed to have accepted a version they never saw. | Setup |

## 3. Services to set up (all optional; the app says "not set up" without them)

| # | Service | Settings (backend/.env) | Notes |
|---|---|---|---|
| 21 | Email codes | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Any SMTP account (for example a Gmail app password). Untested against a live server here: test once configured. |
| 22 | Phone codes | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` | Twilio Verify (paid). Untested against live Twilio here. |
| 23 | Gemini | `GEMINI_API_KEY`, `GEMINI_MODEL` | Server-side only. A key was pasted into chats during development: **make a new key** and delete the old one. |
| 24 | Venue search | `GOOGLE_MAPS_API_KEY` (Places API (New)) | Needs a Google Cloud billing account (paid after the free allowance). Restrict the key to the Places API and your server's IP. Without it, plain map-search links are shown. |
| 25 | Age check | `AGE_CHECK_PROVIDER` | Leave empty until items 2 and 3 are decided, and Privacy Policy §6 (age assurance) is written and reviewed (item 19). |
| 26 | Moderators | `python -m app.roles set you@example.com admin` | Run on the server. |

## 4. Still to build before real users

| # | Item | Type |
|---|---|---|
| 27 | Password reset by email (needs SMTP). | Build |
| 28 | Rate limits are kept in memory per server process. With several servers, move them to the database or Redis. | Build |
| 29 | Device-wide screen time: not possible from a website. It would need a separately identified native integration. | Build |
| 30 | Photo moderation (memories and profile photos are not scanned). | Decision + Build |
| 31 | Blockchain features: none are offered. Don't add any without the separate notice the Terms describe. | Decision |

## 5. Before every deploy

- `pytest` (backend), `npm run typecheck` and `npm run build` (frontend) all pass.
- `python scripts/smoke_test.py https://your-domain` passes against the live site.
- `.env` files are not in git (`git status` doesn't list them).
