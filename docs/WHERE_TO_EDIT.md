# Where to edit things

Paths start at the repo root. The website reloads by itself when you save (`npm run dev`).
The API reloads if you started it with `--reload`.

## Look and feel

| I want to change… | Open | Notes |
|---|---|---|
| The app's name, slogan or description | `frontend/src/lib/brand.ts` | Used by the landing page, header, page titles and legal pages. |
| The logo (the meerkat drawing) | `MeerkatMark` in `frontend/src/components/Brand.tsx` | |
| The colours | `frontend/src/app/globals.css` (the `@theme` block) | `pine` (dark green, text and frames), `forest` (main buttons), `sage` and `sage-strong` (light greens), `cream` and `sand` (warm backgrounds), and `danger`, `warning`, `success` with `-soft` versions for messages. Use them as classes like `bg-forest`, `text-pine`. Change a colour here and it changes everywhere. Check contrast if you darken or lighten one. |
| Corner roundness | `--radius-frame` and `--radius-inner` in `globals.css` | |
| The font | `frontend/src/app/globals.css` (`--font-sans`) | |
| Buttons, cards, switches, chips, settings blocks, the "Demo" badge | `frontend/src/components/ui.tsx` | Used on every page. |
| Loading, error, empty and notice messages | `frontend/src/components/States.tsx` | |
| The header, sidebar and phone tab bar | `frontend/src/components/AppShell.tsx` | |
| Which pages are in the navigation, their order, and which show on phones | `NAV` near the top of `AppShell.tsx` (`phone: true` = in the phone tab bar, the rest go under "More") | Icons are in `frontend/src/components/Icons.tsx`. |
| The **+** menu and the bell | `frontend/src/components/HeaderActions.tsx` | |
| The landing page (logged out) | `frontend/src/app/page.tsx` | |

## Pages

| Page | File |
|---|---|
| Landing | `frontend/src/app/page.tsx` |
| Log in / Sign up | `frontend/src/app/login/page.tsx`, `frontend/src/app/signup/page.tsx`, both use `frontend/src/components/AuthForm.tsx` |
| Onboarding | `frontend/src/app/onboarding/page.tsx` (the form itself is `ProfileForm.tsx`) |
| Discover (`/feed`) | `frontend/src/app/feed/page.tsx` |
| Memories | `frontend/src/app/memories/page.tsx` |
| Plan (hangouts and your private schedule) | `frontend/src/app/plan/page.tsx`, with the parts in `frontend/src/components/plan/` |
| Profile (yours and other people's) | `frontend/src/app/profile/page.tsx` |
| Friends, Messages | `frontend/src/app/friends/page.tsx`, `frontend/src/app/messages/page.tsx` |
| Groups (list and one group), Events | `frontend/src/app/groups/page.tsx`, `frontend/src/app/events/page.tsx` |
| Screen Time (and its groups) | `frontend/src/app/screen-time/page.tsx`, groups in `frontend/src/components/ScreenTimeGroups.tsx` |
| Settings | `frontend/src/app/settings/page.tsx`, with each section in `frontend/src/components/settings/` |
| Moderators' area | `frontend/src/app/moderation/page.tsx` |
| Terms, Privacy, Guidelines | `frontend/src/app/terms/`, `privacy/`, `guidelines/` (they all show `LegalPage.tsx`) |

## Legal text, consent and age

| I want to change… | Open | Notes |
|---|---|---|
| The Terms, Privacy Policy or Guidelines text | `frontend/src/content/legal.ts` | Fill in `LEGAL_CONFIG` (names, emails, dates) and the `[INSERT …]` placeholders. Remove each "Draft check" note once the text matches the code. |
| Ask everyone to accept the Terms again | `TERMS_VERSION` in `backend/.env` (or `backend/app/config.py` for the default) | Use a new value, for example a date. |
| The sign-up checkbox wording | `frontend/src/components/AuthForm.tsx` | And `TermsGate.tsx` for people re-accepting. |
| The minimum age (18, proposed) | `MIN_AGE` in `backend/.env` / `backend/app/config.py`, plus the checkbox text | A team decision with safety consequences: see `docs/PRE_LAUNCH_CHECKLIST.md`. |
| The optional consents (AI features, meeting-area suggestions) and their wording | `CONSENTS` in `backend/app/account.py` | |
| Report reasons | `REPORT_REASONS` in `backend/app/safety.py` | |
| Notification categories | `CATEGORIES` and `KIND_CATEGORY` in `backend/app/notifications.py` | |
| Verification code rules (expiry, tries, resends) | `CODE_MINUTES`, `MAX_ATTEMPTS`, `RESEND_SECONDS`, `MAX_SENDS_PER_DAY` in `backend/app/verification.py` | |
| Badge wording ("Email verified"…) | `BADGE_LABELS` in `backend/app/users.py` | Only use labels for things that were really checked. |

## Profiles

| I want to change… | Open |
|---|---|
| The two profile looks (info view, expressive view with stickers) | `frontend/src/components/ProfileViews.tsx` (stickers per interest: `STICKERS`) |
| The profile / onboarding form | `frontend/src/components/ProfileForm.tsx`, with the pickers in `ProfileInputs.tsx` |
| The suggested interests, universities and friendship goals | `backend/app/options.py` (the website loads them from `/api/options`) |
| **Add a new profile field** | 1. a new migration in `backend/app/migrations/` (the next number, for example `007_add_instagram.sql`; never edit an old one) · 2. `USER_COLUMNS` and `public_profile` / `own_profile` in `backend/app/users.py` · 3. `ProfileUpdate` in `backend/app/profiles.py` · 4. the types in `frontend/src/lib/types.ts` · 5. the form in `ProfileForm.tsx` and the views in `ProfileViews.tsx` · 6. a test in `backend/tests/test_profiles.py` |

## Matching, planning and AI

| I want to change… | Open |
|---|---|
| How many points each shared thing is worth | `WEIGHTS` in `backend/app/matching.py` |
| What Gemini is told (match notes, hangout suggestions, timetable reading) | `backend/app/prompts.py`. **Raise `PROMPT_VERSION` or `PLAN_PROMPT_VERSION`** after a change, so saved results are made again. |
| Which Gemini model is used | `GEMINI_MODEL` in `backend/.env` (no code change) |
| The non-AI fallbacks | `fallback_insight` and `ACTIVITY_BY_INTEREST` in `backend/app/ai.py`; `fallback_plan` in `backend/app/planning.py` |
| What the morning/afternoon/evening free-time boxes mean, the normal day used when someone has no public times, the longest plan (14 days) | `SLOT_HOURS`, `DEFAULT_DAY`, `MAX_DAYS`, `MIN_DURATION`, `MAX_DURATION` in `backend/app/scheduling.py` |
| How free times are worked out (overnight shifts, buffers, overlaps) | the functions in `backend/app/scheduling.py` (tests: `backend/tests/test_schedules.py`) |
| Default buffer time | `buffer_minutes` default in `backend/app/migrations/005_schedules_planning.sql` (use a new migration to change it) |
| How long a suggestion is reused | `SUGGESTION_MAX_AGE` in `backend/app/planning.py` (1 hour) |
| The meeting-area list (campuses, stations) | `AREA_PRESETS` in `backend/app/planning.py` |
| What kind of place to search for, per interest | `PLACE_QUERY_BY_INTEREST` in `backend/app/planning.py` |
| `.ics` calendar reading | `backend/app/ics.py` |

## Friends, groups, events, memories, screen time

| I want to change… | Open |
|---|---|
| Friend request rules | `backend/app/friends.py` |
| Group rules, event rules | `backend/app/groups.py`, `EventCreate` and `create_event` in `backend/app/events.py` |
| The create group / create event forms | `frontend/src/components/CreateForms.tsx` |
| Memories: audiences, photo count, page size, how long photo links work | `AUDIENCES` in `frontend/src/lib/memories.ts`; `MAX_PHOTOS`, `PAGE_SIZE`, `PHOTO_LINK_SECONDS` in `backend/app/memories.py` |
| Screen-time group measurements and labels | `METRIC_LABELS` in `backend/app/screen_time_groups.py` |
| Blocking rules | `backend/app/safety.py` (and where `blocked_ids` is used) |
| How often messages and the bell refresh | the last number passed to `useApi(...)` in `messages/page.tsx` (4 seconds) and `HeaderActions.tsx` (20 seconds) |
| Rate limits | the `RateLimiter(...)` lines at the top of each backend file |

## Demo data

| I want to change… | Open |
|---|---|
| The fictional people, groups, events, friendships | `backend/app/seed_data.py`, then `python -m app.seed --reset --yes` (in `backend`) to reload it |
| What a "Try the demo" account starts with | `DEMO_EXPLORER`, `DEMO_INCOMING_REQUESTS`, `DEMO_FRIEND`, `DEMO_FRIEND_MESSAGES` in `backend/app/seed_data.py` |

Keep demo people **fictional** and 18+: made-up names, no real photos, `.invalid` emails.

## Calling the API from the website

Most calls go through `frontend/src/lib/api.ts`. Bigger features have their own file next to it: `lib/memories.ts`, `lib/planning.ts`, `lib/screenTime.ts`.
To use a new endpoint, add a function there and its types (`frontend/src/lib/types.ts` for shared ones).
