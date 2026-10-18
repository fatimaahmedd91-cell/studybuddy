# What works, what doesn't yet

Last checked: 18 October 2026, on branch `claude/friendfinder-mvp`.

✅ done and tested · 🟡 partly done, or done but not tried in the real setup yet · ❌ not built

## Features

| Feature | Status | Notes |
|---|---|---|
| Meerkat name, slogan and green design | ✅ | Colours are tokens in `frontend/src/app/globals.css`, the name and slogan in `frontend/src/lib/brand.ts`. Some internal names still say "friendfinder". |
| Sign up, log in, log out, stay logged in for 7 days | ✅ | Argon2 passwords. Sign-up needs the unticked "I am at least 18 and agree to the Terms…" box. The accepted Terms version and time are saved. |
| Terms gate and re-acceptance | ✅ | Raising `TERMS_VERSION` asks everyone to accept again. Until they do, the server refuses everything except reading, exporting or deleting their account. |
| Terms, Privacy Policy and Community Guidelines pages | 🟡 | Your text, with `[INSERT …]` placeholders and "Draft check" notes. Each page says "Draft — not ready to publish" until the placeholders are filled. **Not legally reviewed.** See `docs/PRE_LAUNCH_CHECKLIST.md`. |
| Onboarding and profile (display name, pronouns, age 18+, university, interests, goals, hook, bio, free times, photo or emoji) | ✅ | Display name is separate from email. Age is optional, and must be 18+ if given. |
| "Try the demo" without signing up | ✅ | A labelled, fictional demo account (AI turned on, because nothing in it is real). Hidden from Discover, deleted after 24 h. |
| Discover with filters and explained match % | ✅ | Hides people who are blocked, suspended or hidden from Discover. |
| Friends, messages, groups, events, notifications bell | ✅ | Messages arrive within ~4 s (polling). Notifications respect your Settings choices and blocks. |
| Settings: Profile, Account and contact, Verification, Privacy and availability, Notifications, Blocked people, Terms and privacy | ✅ | Changes are saved on the server and survive a refresh (tested in the browser). Download your data, send a privacy request, delete your account. |
| Email verification codes | 🟡 | Works only when SMTP is set up. 10-minute codes, 5 tries, 60 s between sends, 5 sends a day, reset when you change the address. Tested with sending faked, **not** with a real mail server. Without SMTP the page says "not set up". |
| Phone verification codes | 🟡 | Twilio Verify, only when its 3 settings are set. Tested with Twilio's responses faked, **not** against live Twilio. |
| Selfie age check | 🟡 switched off | Only an integration boundary. No provider is connected, so it says "not available" and no "Age checked" badge can appear. A clearly labelled test mode exists only in development, and never gives a badge. Meerkat never analyses faces. |
| Public vs private free times | ✅ | Public "free to hang out" times: everyone / friends only / nobody. Enforced on the server for Discover, profiles, match notes and planning. |
| Private schedule (classes, shifts, other) | ✅ | Only the owner can ever read it. Manual entry, weekly or one-off, overnight shifts, buffer time, duplicates skipped. |
| Import a schedule | ✅ / 🟡 | `.ics` calendar files: ✅. Timetable image or PDF read by Gemini: works with a key, but only tested with Gemini faked. Either way you review and edit before anything is saved, and the file is never stored. |
| Plan a hangout with friends or a group | ✅ | Free times are calculated exactly (not by AI). Someone's private schedule counts only if they allowed it for friends or that group. Nobody's commitments are ever shown. Turn a time into an event. |
| Hangout suggestions (Gemini) | ✅ | Only if everyone in the plan turned AI on. Gemini sees shared interests, goals, group size and the free times, nothing else, and can only pick from those times. Saved and reused for up to an hour ("Updated at …"), with a Refresh button. Labelled fallback otherwise. Tested live. |
| Meeting area and halfway point | ✅ / 🟡 | Opt-in. Pick a campus or station, or a location rounded to ~1 km. Others never see it; the halfway point is rounded to ~1 km (~5 km with only two people) and labelled "not based on travel time". Venue search with Google Places needs `GOOGLE_MAPS_API_KEY` (tested with Google faked only). Without it: labelled map-search links. |
| Memories feed | ✅ | Audiences: friends (default), everyone, only me. Up to 4 photos, location data removed, served by expiring links. Edit, delete, hearts, comments, report, pagination. Blocked people never see each other's. |
| Screen time | ✅ | Time in Meerkat (counted while you use it), plus phone screen time you type in yourself, labelled "self-reported". No device tracking. |
| Screen-time groups | ✅ | Invite friends, one daily target, and a leaderboard of who recorded the most that day (highest first, as the brief asked; each row also shows whether the person stayed under the target). People with no entry are listed separately, never as zero. Joining needs a separate "share my numbers" choice. |
| Blocking | ✅ | Both ways, on the server: Discover, profiles, messages, friend requests, memories, notifications, group posts. Unblock in Settings. |
| Reporting | ✅ | Profiles, messages, memories, groups, group posts, events. One open report per thing per person. |
| Moderators' area (`/moderation`) | ✅ | Report queue, dismiss, remove content, suspend / unsuspend, action log, privacy requests (admins). Roles set with `python -m app.roles`. Members are refused by the server. |
| Phone layout | ✅ | Checked at 390 px: no page scrolls sideways; bottom tab bar with a "More" menu. |
| Forgot password | ❌ | Needs SMTP; not built. |
| Edit or delete an event or group | ❌ | Only creating (moderators can remove them). |
| Live push (WebSockets), emails or phone notifications | ❌ | On purpose for the demo: the bell polls. |

## Checks that were run (18 October 2026)

| Check | Result |
|---|---|
| API tests (`pytest`) on PostgreSQL 16, with a real Gemini key | ✅ 227 passed |
| Website type check and production build (20 pages) | ✅ |
| Browser journey (`scripts/e2e/journey.mjs`, 35 steps: two new users, memories, private schedule and planning, settings after refresh, report/block/unblock, moderation refused, legal pages, demo, phone size, delete account), dev server | ✅ 35 / 35 |
| The same browser journey on a **new empty database**, with the production build served by the API (the way Render/Docker run it) | ✅ 35 / 35 |
| API journey (`scripts/smoke_test.py`, 56 checks), dev server and the fresh database | ✅ 56 / 56 both |
| Upgrading: a database made by the pre-Meerkat version (what the Vultr server has), then opened by the new code | ✅ migrations 003–006 ran by themselves at start-up. The old account kept its data and logged in, was asked to accept the Terms (never assumed), then everything worked, with AI off until they turn it on. |
| Live Gemini: match note for a demo account, and 3 hangout suggestions | ✅ written by Gemini; the slot codes were replaced by real times |
| Live SMTP, live Twilio, live Google Places, an age-check provider | ❌ not tested: no accounts were used. Faked in tests only. |
| The Docker image Render builds, with a new empty database and **no** Gemini key | ✅ it sets itself up; browser journey 35 / 35 and API journey 56 / 56, with every AI feature showing its labelled fallback |

## Sponsor integrations

| Sponsor | Status | What's there | What's needed |
|---|---|---|---|
| **Google Gemini** | ✅ working | Match notes, hangout suggestions and timetable reading. Server-side only, JSON output checked, cached, rate-limited, labelled fallback, per-person AI choice. Tested live. | Make a **new** key (the old one was pasted into chats), put it in the server's `.env`. |
| **Google Maps Platform** | 🟡 ready, no key | Places (New) text search near the halfway point; plain Maps links without a key. | A Google Cloud project with billing and a Places key, restricted to your server. |
| **Vultr** | 🟡 live, older version | Your server runs the version from before Meerkat (it works). `deploy/update.sh` brings it up to date. | The team's OK to update the live server once this branch is merged. |
| **GoDaddy** | 🟡 documented, not done | DNS steps in `DEPLOY.md`. HTTPS certificates are automatic. | The domain, then the DNS records. |
| **TigerData** (Timescale) | 🟡 ready, not connected | Screen time uses a hypertable when TimescaleDB is there. | A TigerData service URL in `DATABASE_URL`. |
| **Render** (hosting) | 🟡 ready, not deployed | `render.yaml` + `Dockerfile`. | A Render account. See `DEPLOY.md`. |
| **Solana** | ❌ not built | Nothing on-chain. The app never asks for wallets, keys or seed phrases. | A team decision (the smallest honest version is below). |
| **GitHub** | ✅ | Branch `claude/friendfinder-mvp`. | Review and merge into `main`. |

### Solana: the smallest version worth building

An **attendance badge** after an event, written as a memo on Solana **devnet** (test network, no real money):
the organiser clicks "Issue attendance badges", the server sends one memo transaction (no names, emails or wallet addresses),
and the event shows "Recorded on Solana devnet" with an Explorer link **only after** it's confirmed.
It needs one new package and about half a day. The Terms ask for a separate notice before any blockchain feature.

## Things that changed from earlier plans

- **FriendFinder is now Meerkat**, for adults (18+ is the *proposed* policy; see the pre-launch checklist).
- **No AI age guess from selfies.** Only a hosted age-assurance provider could do this, and none is connected.
- **Feed = Discover.** Posts live in Memories and group discussions.
- **Messages aren't in the main navigation.** You reach them from Friends, a profile, or the bell.
