# What works, what doesn't yet

Last checked: 18 October 2026, on branch `claude/friendfinder-mvp`.

✅ done and tested · 🟡 partly done, or done but not tried in the real setup yet · ❌ not built

## Features

| Feature | Status | Notes |
|---|---|---|
| Sign up, log in, log out, stay logged in for 7 days | ✅ | Argon2 passwords. Sign-up needs a "16 or older, here for friendship" tick. |
| Onboarding (name, pronouns, age, university, interests, goals, hook, bio, free times) | ✅ | Pronouns, age and free times are optional. |
| Profile photo upload, or an emoji avatar instead | ✅ | JPEG up to 2 MB, resized in the browser, location data removed on the server. |
| Profile: info view and expressive view (stickers), edit / save / cancel | ✅ | The view you pick is remembered on your device. |
| "Try the demo" without signing up | ✅ | A labelled demo account with friend requests and a chat waiting. Hidden from Discover, deleted after 24 h. |
| Discover: filters (name, university, interest, goal, "free when I'm free"), match % with reasons | ✅ | |
| Friend requests: send, cancel, accept, decline; no duplicates or requests to yourself | ✅ | If two people ask each other, they simply become friends. |
| Remove a friend (asks first) | ✅ | |
| Direct messages between friends, saved | ✅ | New messages appear within ~4 s (polling, not live push). |
| Groups: list, search, create, join, leave, members, discussion | ✅ | The discussion is visible to members only. |
| Events: calendar, list, past events, create, RSVP / un-RSVP, counts | ✅ | Times are shown in your own time zone, and the time zone is named. Can be linked to a group. |
| Compare free times with a friend (Events page) | ✅ | |
| Notifications bell: requests, accepts, messages, group joins, new group events, RSVPs; mark read | ✅ | Checks every 20 s. |
| Create menu (+): group, event, edit profile | ✅ | |
| Screen time in FriendFinder, 7-day chart, daily goal | ✅ | Counts only this app, only while the tab is visible and in use. |
| Gemini "why you might get along" note | ✅ | Labelled; shows exactly what was sent; non-AI fallback when Gemini isn't available. |
| Delete your account | ✅ | Type DELETE to confirm. Your groups and events go too, if nobody else is in them. |
| Phone layout with bottom tab bar | ✅ | Checked at 390 px wide: no page scrolls sideways. |
| Block or report someone | ❌ | The most important missing safety feature before real users. The Settings page says it isn't built yet. |
| Forgot password / email verification | ❌ | Needs an email service. |
| Edit or delete an event or group; remove a group member | ❌ | Only creating is built. |
| Live push (WebSockets) | ❌ | On purpose: polling is simpler and fine for a demo. |

## Checks that were run

| Check | Result |
|---|---|
| API tests (`pytest`, 117 tests) on PostgreSQL 16 | ✅ all pass, including one that calls the real Gemini API |
| API tests on TimescaleDB 2.30.2 (same engine as TigerData) | ✅ all pass. The hypertable and `time_bucket` path is used. |
| Website type check and production build | ✅ |
| Browser journey (`scripts/e2e/journey.mjs`, 29 steps: two new users, demo mode, phone size, delete account) on the dev server with a real Gemini key | ✅ 29 / 29, the match note was written by Gemini |
| The same browser journey on the production build served by Caddy, without a Gemini key (fallback labelled) | ✅ 29 / 29 |
| API journey (`scripts/smoke_test.py`, 39 checks) through Caddy | ✅ 39 / 39 |
| A fresh copy of the repo, set up by following README.md (Mac/Linux steps) with a new empty database | ✅ tests 115 pass + 2 Gemini tests skipped (no key in that copy), typecheck and build pass, smoke test 39 / 39, browser journey 29 / 29. The Windows commands weren't run (no Windows machine). |

## Sponsor integrations

| Sponsor | Status | What's there | What's needed |
|---|---|---|---|
| **Google Gemini** | ✅ working | Server-side only, key in `backend/.env`, model set by `GEMINI_MODEL`, JSON output checked, cached, timeout, rate limit, labelled fallback. Only shared interests, goals, university and free times are sent. Tested with a real key (~2 s per note). | Put the key on the server's `.env` when deploying. |
| **TigerData** (Timescale) | 🟡 ready, not connected | Numbered migrations, seed command, local Postgres fallback. Screen time uses a TimescaleDB hypertable and `time_bucket` when available. Tested on TimescaleDB 2.30.2 locally. The app never falls back to keeping data only in memory. | Create a TigerData service, then paste its URL into `DATABASE_URL`. |
| **Vultr** | 🟡 ready, not deployed | `deploy/setup.sh` (one command on Ubuntu 24.04), systemd service, firewall, `deploy/update.sh`. Caddy config tested locally. | A Vultr server (**costs money**: needs the team's OK), then follow `DEPLOY.md`. |
| **GoDaddy** | 🟡 documented, not done | DNS steps with placeholders in `DEPLOY.md`. Caddy gets the HTTPS certificate by itself. | The domain (MLH code), then two A records pointing at the server. |
| **Solana** | ❌ deferred | Nothing is built, on purpose (see below). The app never asks for wallets, keys or seed phrases. | A team decision on whether it's worth the time. |
| **GitHub** | 🟡 | Work is on branch `claude/friendfinder-mvp` with clear commits. `CONTRIBUTING.md` explains branches and pull requests. | Push the branch and open a pull request (waiting for the team's OK). |

### Solana: why it's deferred, and the smallest version worth building

A blockchain feature only makes sense here if it gives users something real. The smallest honest one:
an **attendance badge** after an event, written as a memo on Solana **devnet** (test network, no real money).

1. After an event ends, its organiser clicks "Issue attendance badges".
2. The server (with a devnet-only key kept in `backend/.env`, funded from the free devnet faucet) sends one transaction with a Memo like `friendfinder:event:42:attendees:7`.
   It contains no names, emails or wallet addresses.
3. The event page shows "Recorded on Solana devnet" with a link to the transaction on the Solana Explorer, **only after** the transaction is confirmed.

What it would never do: ask anyone for a wallet, private key or seed phrase, or call anything "on-chain" before it's confirmed.
It would need one new package (`solders` or `solana-py`) and about half a day of work, including tests.
Skip it unless you're aiming for the Solana prize.

## Things that changed from earlier plans

- **No selfie age check.** An earlier plan had an "AI age estimate" from a selfie. It was dropped: the brief says never to infer things about people from their photos.
  Instead there's a "16 or older" confirmation at sign-up, and an optional age on the profile, which must be 16+.
- **Feed = Discover.** The design's Feed page shows people to meet, not a timeline of posts. Posts live in group discussions.
- **Messages aren't in the sidebar.** The brief's sidebar list doesn't include them. You reach them from Friends, from a profile ("Message"), and from the bell.
  The sidebar highlights Friends while you're in Messages.
