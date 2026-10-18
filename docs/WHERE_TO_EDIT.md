# Where to edit things

Paths start at the repo root. The website reloads by itself when you save (`npm run dev`).
The API reloads if you started it with `--reload`.

## Look and feel

| I want to change… | Open | Notes |
|---|---|---|
| The colours | `frontend/src/app/globals.css` (the `@theme` block) | Five colours: `bark` (dark brown), `ember` (orange), `paper` (cream), `card` (card cream), `ice` (light blue). Use them as classes like `bg-ember`, `text-bark`. Keep text on orange **large and bold**, because normal-size text on orange is hard to read. |
| The font | `frontend/src/app/globals.css` (`--font-sans`) | |
| Buttons, cards, chips, the "Demo" badge | `frontend/src/components/ui.tsx` | Used on every page. |
| Loading, error and empty messages | `frontend/src/components/States.tsx` | |
| The logo, header, sidebar and phone tab bar | `frontend/src/components/AppShell.tsx` | |
| Which pages are in the sidebar, and their order | `NAV` near the top of `AppShell.tsx` | Icons are in `frontend/src/components/Icons.tsx`. |
| The **+** menu and the bell | `frontend/src/components/HeaderActions.tsx` | |
| The landing page (logged out) | `frontend/src/app/page.tsx` | |

## Pages

| Page | File |
|---|---|
| Landing | `frontend/src/app/page.tsx` |
| Log in / Sign up | `frontend/src/app/login/page.tsx`, `frontend/src/app/signup/page.tsx`, both use `frontend/src/components/AuthForm.tsx` |
| Onboarding | `frontend/src/app/onboarding/page.tsx` (the form itself is `ProfileForm.tsx`) |
| Feed (Discover) | `frontend/src/app/feed/page.tsx` |
| Profile (yours and other people's) | `frontend/src/app/profile/page.tsx` |
| Friends | `frontend/src/app/friends/page.tsx` |
| Messages | `frontend/src/app/messages/page.tsx` |
| Groups (list and one group) | `frontend/src/app/groups/page.tsx` |
| Events (calendar, list, one event) | `frontend/src/app/events/page.tsx` |
| Screen Time | `frontend/src/app/screen-time/page.tsx` |
| Settings | `frontend/src/app/settings/page.tsx` |

## Profiles

| I want to change… | Open |
|---|---|
| The two profile looks (info view, expressive view with stickers) | `frontend/src/components/ProfileViews.tsx` (stickers per interest: `STICKERS`) |
| The profile / onboarding form | `frontend/src/components/ProfileForm.tsx`, with the pickers in `ProfileInputs.tsx` |
| The suggested interests, universities and friendship goals | `backend/app/options.py` (the website loads them from `/api/options`) |
| The minimum age (16) | `MIN_AGE` in `backend/app/options.py` and the checkbox text in `frontend/src/components/AuthForm.tsx` |
| **Add a new profile field** | 1. a new migration in `backend/app/migrations/` (for example `003_add_instagram.sql`) · 2. `USER_COLUMNS` and `public_profile` / `own_profile` in `backend/app/users.py` · 3. `ProfileUpdate` in `backend/app/profiles.py` · 4. the types in `frontend/src/lib/types.ts` · 5. the form in `ProfileForm.tsx` and the views in `ProfileViews.tsx` · 6. a test in `backend/tests/test_profiles.py` |

## Matching and AI

| I want to change… | Open |
|---|---|
| How many points each shared thing is worth | `WEIGHTS` in `backend/app/matching.py` (the tests in `backend/tests/test_people_and_friends.py` check the totals) |
| The reasons shown on Discover cards | `compute_match` in `backend/app/matching.py` |
| What Gemini is told | `backend/app/prompts.py`. **Raise `PROMPT_VERSION`** after a change, so saved notes are written again. |
| Which Gemini model is used | `GEMINI_MODEL` in `backend/.env` (no code change) |
| The non-AI fallback notes | `fallback_insight` and `ACTIVITY_BY_INTEREST` in `backend/app/ai.py` |
| How the note looks, and its labels | `frontend/src/components/MatchInsight.tsx` |

## Friends, groups, events

| I want to change… | Open |
|---|---|
| Friend request rules | `backend/app/friends.py` |
| The Add friend / Request sent / Accept / Friends button | `frontend/src/components/FriendButton.tsx` |
| Group rules (who can post, join, leave) | `backend/app/groups.py` |
| Event rules (how far ahead, how long, online links) | `EventCreate` and `create_event` in `backend/app/events.py` |
| The create group / create event forms | `frontend/src/components/CreateForms.tsx` |
| How often messages and the bell refresh | the last number passed to `useApi(...)` in `messages/page.tsx` (4 seconds) and `HeaderActions.tsx` (20 seconds) |
| Rate limits | the `RateLimiter(...)` lines at the top of each backend file |

## Demo data

| I want to change… | Open |
|---|---|
| The fictional people, groups, events, friendships | `backend/app/seed_data.py`, then `python -m app.seed --reset --yes` (in `backend`) to reload it |
| What a "Try the demo" account starts with | `DEMO_EXPLORER`, `DEMO_INCOMING_REQUESTS`, `DEMO_FRIEND`, `DEMO_FRIEND_MESSAGES` in `backend/app/seed_data.py` |

Keep demo people **fictional**: made-up names, no real photos, `.invalid` emails.

## Calling the API from the website

All calls go through `frontend/src/lib/api.ts`. To use a new endpoint, add one line to the `api` object there, and its types to `frontend/src/lib/types.ts`.
