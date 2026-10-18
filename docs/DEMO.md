# Judge demo (about 3 minutes)

**Before judging:**

- Open the site and `/api/health`. You want `"status":"ok"`, and `"gemini": {"ok": true}` if you want live AI notes.
- If it's been a few days, refresh the demo data from the `backend` folder: `python -m app.seed`. It moves demo events that have ended into the coming week, and never deletes anything.
- Have a second browser (or a private window) ready, logged in as a real test account. That's for step 6.

| # | Do | Say |
|---|---|---|
| 1 | Landing page → **Try the demo** | "FriendFinder helps students find *friends*, not dates, based on what they're into, what kind of friend they want, their campus, and when they're free. Judges can try it without signing up. Everything from the demo is marked *Demo*." |
| 2 | **Feed** (Discover). Point at the top card's match % and the reasons. Use the **Interest** filter, then tick **Free when I'm free**. | "Matching is simple and explainable: points for shared interests, goals, university and free time. We show *why*, not just a number. No AI decides who you see." |
| 3 | Click **View profile** on someone. Toggle **Info view / Expressive view**. Scroll to **Times you're both free** and the **match note**. Open **"What was sent to Gemini?"** | "Gemini writes the conversation starter. We only send what you two share: interests, goals, university, free times. Never names, photos or bios. If Gemini is down, we say so and show a non-AI suggestion, clearly labelled." |
| 4 | Click the **bell** → open a friend request → **Accept**. | "Notifications are saved on the server, and requests can't be duplicated or sent to yourself. The server checks all of that, not just the page." |
| 5 | **Friends** → **Message** Daniel → send a message. | "Messages are saved and only friends can message each other." |
| 6 | (Optional, two browsers) From your second account, send the demo account a message, and it appears within a few seconds. | "We use simple polling instead of live sockets: reliable, and honest about the few-second delay." |
| 7 | **Groups** → open a group → **JOIN!** → write a post. Then **Plan an event for this group**. | "Groups have members-only discussions. Events can belong to a group, and members get notified." |
| 8 | **Events** → the calendar → open an event → **I'm going** (watch the count go up). | "Times are shown in your own time zone, and we name it, so nobody shows up an hour late." |
| 9 | **Screen Time** → set a daily goal. | "This only counts time in FriendFinder, and says so. The idea is to get people off the app and into real hangouts." |
| 10 | Make the browser phone-sized (or open it on a phone). | "Works on phones, with a bottom tab bar." |

**Tech, if they ask:** Next.js + TypeScript + Tailwind website, FastAPI + PostgreSQL API, and Gemini structured output with caching and a fallback.
Screen time uses a TimescaleDB hypertable on TigerData. 117 API tests plus an end-to-end browser test.
Deployed with Caddy on a Vultr server and a GoDaddy domain (once deployed).

**Be honest about:** no block/report yet, no password reset, Solana not built (see `docs/STATUS.md`).

**If something breaks during the demo:** say so, then go on to the next step. `/api/health` tells you what's down.
If Gemini fails, the labelled fallback appears by itself.
