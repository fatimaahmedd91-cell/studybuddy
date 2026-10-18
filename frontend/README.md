# Meetkat website (Next.js + TypeScript + Tailwind)

Colours from the logo: its dark brown (sidebar, text, card frames), its light blue (inside cards and highlighted panels) and its cream (page background), with green only for the main buttons and switches.
Everything you see comes from the API. There's no fake data in the website.
The name and slogan ("Finding your mob shouldn't be up to chance.") live in `src/lib/brand.ts`. Change them there only.

## Run it

You need Node.js 20.9 or newer, and the API running on port 8000 (see the [main README](../README.md)).

```
npm ci            # first time, or after package-lock.json changes
npm run dev       # http://localhost:3000
```

While developing, `/api/...` requests are forwarded to the API on 127.0.0.1:8000 (`next.config.ts`).

| Command | What it does |
|---|---|
| `npm run dev` | the site for development, reloads when you save. It runs Next.js with a larger header limit (64 KB), because GitHub Codespaces sends big login cookies that the default 16 KB limit refused. |
| `npm run typecheck` | checks the TypeScript for mistakes |
| `npm run build` | builds the live site into `out/` (plain HTML/CSS/JS that Caddy, or the API with `SERVE_WEBSITE=true`, serves; see `../DEPLOY.md`) |

## Pages (`src/app/`)

| Address | File | What it is |
|---|---|---|
| `/` | `page.tsx` | Landing page, with **Try the demo** |
| `/login`, `/signup` | `login/page.tsx`, `signup/page.tsx` | Log in, sign up (both use `components/AuthForm.tsx`; sign-up has the unticked 18+ and Terms box) |
| `/forgot-password` | `forgot-password/page.tsx` | Get a reset code by email, then choose a new password (says so honestly if email isn't set up on the server) |
| `/onboarding` | `onboarding/page.tsx` | Finish your profile (new accounts are sent here) |
| `/feed` | `feed/page.tsx` | Discover people, with filters and match reasons |
| `/memories`, `?id=4`, `?author_id=3` | `memories/page.tsx` | Share memories (caption, up to 4 photos, who can see it), hearts and comments, report |
| `/plan` | `plan/page.tsx` | **Plan a hangout**: pick friends or a group, find shared free times, get suggestions (Gemini or labelled template), meeting area, make an event |
| `/plan?tab=schedule` | `plan/page.tsx` | **My schedule**: your private classes and shifts, `.ics` or timetable import, buffer time, who can plan around your schedule |
| `/profile`, `?id=3`, `?edit=1` | `profile/page.tsx` | Your profile (edit it), or someone else's (match, free times, match note, badges, report, block) |
| `/friends` | `friends/page.tsx` | Friends, requests you got, requests you sent |
| `/messages?with=3` | `messages/page.tsx` | Chats with friends (report a message, block) |
| `/groups`, `?id=2` | `groups/page.tsx` | Group list, one group (members, events, discussion, report). The owner can edit it, delete it (typing its name to confirm) and remove members. |
| `/events`, `?id=5` | `events/page.tsx` | Calendar, upcoming and past events, one event, free times with a friend. The organiser can edit or cancel an event (using the create form in `components/CreateForms.tsx`). |
| `/screen-time`, `?tab=groups`, `?group=7` | `screen-time/page.tsx` | **My time**: time in Meetkat, daily goal, self-reported phone screen time. **Groups**: screen-time groups and leaderboards |
| `/settings` | `settings/page.tsx` | Profile, account and contact, verification, privacy and availability, notifications, blocked people, Terms and privacy (download your data, privacy requests, delete account), system status |
| `/moderation` | `moderation/page.tsx` | Report queue, suspensions, action log, privacy requests (admins). Members see "only for moderators", and the server refuses them too. |
| `/terms`, `/privacy`, `/guidelines` | `terms/`, `privacy/`, `guidelines/` | The **draft** Terms of Service, Privacy Policy and Community Guidelines. Open to everyone, logged in or not. |

Pages that show one item use `?id=` instead of `/groups/2`, because the live site is a static export.

On phones, the tab bar shows Discover, Memories, Plan and Friends; the rest are under **More**.
If someone hasn't accepted the current Terms, every app page shows the Terms screen (`TermsGate.tsx`) first.

## Components (`src/components/`)

| File | What it is |
|---|---|
| `AppShell.tsx` | header, sidebar, phone tab bar, which pages need you to be logged in, and the Terms gate |
| `Brand.tsx` | the logo (the image `public/logo.png`; the browser-tab icons are `src/app/icon.png` and `src/app/apple-icon.png`) |
| `HeaderActions.tsx` | the **+** create menu and the notifications bell |
| `ui.tsx` | buttons (`primary`, `dark`, `outline`, `light`, `danger`), `FrameCard`, `DarkPanel`, form fields, chips, the Demo badge, page headings, `Toggle` switches, `SettingsSection` |
| `States.tsx` | loading, error (with "Try again"), empty, and success/error/warning/info notices |
| `Dialog.tsx` | pop-up windows (keyboard-friendly, closes with Esc) |
| `Avatar.tsx` | profile photo, or emoji on a colour |
| `AuthForm.tsx` | the log-in and sign-up form |
| `TermsGate.tsx` | "Before you continue" / "Our Terms have changed": accept the current Terms |
| `LegalPage.tsx`, `LegalLinks.tsx` | shows a legal document from `content/legal.ts`, and the Terms/Privacy/Guidelines links |
| `ProfileForm.tsx`, `ProfileInputs.tsx` | the profile form, chip pickers, free-time grid, photo upload |
| `ProfileViews.tsx` | the info view and the expressive (stickers) view |
| `VerificationBadges.tsx` | specific labels like "Email verified". Never a general "Verified". |
| `FriendButton.tsx` | Add friend → Request sent → Friends, or Accept / Decline |
| `MatchInsight.tsx` | the Gemini note or the "Suggested by Meetkat (not AI)" fallback, with "What was sent to Gemini?" |
| `SafetyActions.tsx` | the **Report** dialog and the **Block** button (the server enforces both) |
| `CreateForms.tsx` | create a group, create an event |
| `ScreenTimeGroups.tsx` | screen-time group list, invitations, one group and its leaderboard |
| `Icons.tsx` | the sidebar and header icons |
| `settings/` | one file per group of Settings sections: `AccountSection.tsx` (Profile, Account and contact, change password), `VerificationSection.tsx`, `PrivacySection.tsx`, `OtherSections.tsx` (Notifications, Blocked people, Terms and privacy, System status), and `useSave.ts` (shows "Saved." only after the server saved it) |
| `plan/` | `PlanHangout.tsx` (who's coming, free times, suggestions, make an event), `MeetingArea.tsx` (your meeting area and the halfway area), `MySchedule.tsx`, `CommitmentForm.tsx`, `ScheduleImport.tsx` (`.ics` and Gemini timetable import, reviewed before saving), `PlanningConsents.tsx` |

## Helpers and content

| File | What it is |
|---|---|
| `lib/api.ts` | calls to the API (accounts, people, friends, messages, groups, events, settings, verification, blocks and reports), plus `get`/`send` helpers that pages like `/moderation` use directly |
| `lib/memories.ts`, `lib/planning.ts`, `lib/screenTime.ts` | calls and data shapes for Memories, Plan and screen-time groups |
| `lib/auth.tsx` | who is logged in (`useAuth`, `useMe`) |
| `lib/useApi.ts` | load data for a page, optionally refreshing every few seconds |
| `lib/types.ts` | the shapes of the data the API sends |
| `lib/time.ts` | dates and times in your time zone |
| `lib/options.ts` | the suggested interests, universities, goals and notification categories (from the API) |
| `lib/brand.ts` | the app's name, slogan and description |
| `content/legal.ts` | the Terms, Privacy Policy and Guidelines text. `LEGAL_CONFIG` holds the placeholders (company name, contact email…) the team must fill in; pages show them highlighted until then. |

**Colours** live in `src/app/globals.css` under `@theme` (with Tailwind v4 that replaces `tailwind.config.js`).
Change a colour there and it changes everywhere. Use them as classes, for example `bg-bark`, `text-cream`, `bg-forest`, `border-sky-strong`:

| Token | Used for |
|---|---|
| `bark` | the logo's brown: sidebar, dark panels, card frames, main text |
| `forest` | green, used sparingly: main buttons, switches, unread dots, progress bars |
| `sky-strong`, `sky` | the logo's blue: highlighted panels and selected items; the light blue inside cards |
| `cream`, `sand` | header, inputs and cards; the page background (the logo's cream) |
| `danger`, `warning`, `success` (+ `-soft`) | errors and destructive buttons; "check this" notes; success messages |

Corner sizes are tokens too: `rounded-frame` (outer frames) and `rounded-inner` (cards inside them).
More in [docs/WHERE_TO_EDIT.md](../docs/WHERE_TO_EDIT.md).
