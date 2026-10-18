# Judge demo (about 4 minutes)

**Before judging:**

- Open the site and `/api/health`. You want `"status":"ok"`, and `"gemini": {"ok": true}` for live AI.
- If it's been a few days, refresh the demo data from the `backend` folder: `python -m app.seed`. It moves demo events that have ended into the coming week, and never deletes anything.
- Optional: a second browser (or private window) logged in as a real test account, for the messaging step.

| # | Do | Say |
|---|---|---|
| 1 | Landing page → **Try the demo** → tick the box → **Accept and continue**. | "Meetkat: finding your mob shouldn't be up to chance. It's for adults looking for *friends*, not dates. Even the demo asks you to accept the Terms, and everything in the demo is fictional and marked *Demo*." |
| 2 | **Discover**. Point at the match % and its reasons. Use the **Interest** filter. | "Matching is simple and explainable: shared interests, goals, campus and free time. No AI decides who you see." |
| 3 | **View profile** on someone. Scroll to the **match note** → open **"What was sent to Gemini?"** | "Gemini writes the conversation starter, from only what you two share. Never names, photos or messages. AI is a choice each person makes in Settings, and both people have to say yes." |
| 4 | **Plan** → tick Daniel → **Find times**. Point at **Daniel: Included**. | "These free times are calculated exactly, not by AI. Daniel let friends' plans use his private schedule, so his classes and shifts are avoided, but we never see what they are. Friends only ever see *when* you're both free." |
| 5 | Tick a couple of times → **Get suggestions**. Point at **Written by Gemini**, **Updated at …** and **Refresh**. | "Gemini ranks the times and suggests what to do, but it can only pick from the times we calculated. Suggestions are saved for an hour, so we don't call Gemini on every page view." |
| 6 | **My schedule** tab → **Import a timetable image or PDF with Gemini** (show the consent text, don't need to upload). | "Gemini can read a timetable photo, but only after you choose to send it, and you review everything before it's saved. We never keep the file." |
| 7 | Back to **Plan a hangout** → under **My meeting area** pick a campus → **Find a halfway area** (Daniel has one set). | "Meeting areas are opt-in and approximate: a campus or a rounded location. Nobody sees anyone else's, and the halfway point is labelled: it's a straight line, not travel time." |
| 8 | **Memories** → post a caption (audience: **Friends**). | "Memories default to friends only. Photos lose their location data and are only served to people allowed to see them." |
| 9 | **Screen Time** → **Groups** tab. | "Screen-time groups use numbers people type in themselves, labelled *self-reported*. A website can't read your phone's screen time, so we never pretend to. No entry is never shown as zero." |
| 10 | Someone's profile → **Report profile** (show the reasons) → Cancel. Then **Settings** → **Privacy and availability** and **Verification**. | "Blocking and reporting are enforced on the server. Email and phone codes need a real provider, and when one isn't set up, the page says so instead of faking it. There's no selfie age check: no provider is connected, so no badge can appear." |
| 11 | Footer → **Privacy Policy**. Point at **In plain language**. | "Our Privacy Policy says exactly what the app does: which details go to Gemini, what other people can see, and how long things are kept." |
| 12 | Make the browser phone-sized. | "Works on phones, with a bottom tab bar." |

**Tech, if they ask:** Next.js + TypeScript + Tailwind website, FastAPI + PostgreSQL API, Gemini structured output (JSON checked against a schema), with caching and labelled fallbacks.
273 API tests, a 39-step browser test and a 56-check API journey. Moderators get a report queue with an action log.

**Be honest about:** the legal pages haven't been reviewed by a lawyer yet, email/phone codes and password reset need SMTP/Twilio, no age-check provider, Solana not built (see `docs/STATUS.md`).

**If something breaks during the demo:** say so, then go on to the next step. `/api/health` tells you what's down.
If Gemini fails, the labelled fallback appears by itself.
