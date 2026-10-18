# FriendFinder website (Next.js + TypeScript + Tailwind)

The look follows the design PDF: dark-brown sidebar, cream header, light-blue page, orange-framed cards.
Everything you see comes from the API. There's no fake data in the website.

## Run it

You need Node.js 20.9 or newer, and the API running on port 8000 (see the [main README](../README.md)).

```
npm ci            # first time, or after package-lock.json changes
npm run dev       # http://localhost:3000
```

While developing, `/api/...` requests are forwarded to the API on 127.0.0.1:8000 (`next.config.ts`).

| Command | What it does |
|---|---|
| `npm run dev` | the site for development, reloads when you save |
| `npm run typecheck` | checks the TypeScript for mistakes |
| `npm run build` | builds the live site into `out/` (plain HTML/CSS/JS that Caddy serves, see `../DEPLOY.md`) |

## Pages (`src/app/`)

| Address | File | What it is |
|---|---|---|
| `/` | `page.tsx` | Landing page, with **Try the demo** |
| `/login`, `/signup` | `login/page.tsx`, `signup/page.tsx` | Log in, sign up (both use `components/AuthForm.tsx`) |
| `/onboarding` | `onboarding/page.tsx` | Finish your profile (new accounts are sent here) |
| `/feed` | `feed/page.tsx` | Discover people, with filters and match reasons |
| `/profile`, `/profile?id=3` | `profile/page.tsx` | Your profile (edit it), or someone else's (match, free times, Gemini note) |
| `/friends` | `friends/page.tsx` | Friends, requests you got, requests you sent |
| `/messages?with=3` | `messages/page.tsx` | Chats with friends |
| `/groups`, `/groups?id=2` | `groups/page.tsx` | Group list, one group (members, events, discussion) |
| `/events`, `/events?id=5` | `events/page.tsx` | Calendar, upcoming and past events, one event, free times with a friend |
| `/screen-time` | `screen-time/page.tsx` | Time in FriendFinder this week and a daily goal |
| `/settings` | `settings/page.tsx` | Account, log out, delete account, privacy, system status |

Pages that show one item use `?id=` instead of `/groups/2`, because the live site is a static export.

## Components (`src/components/`)

| File | What it is |
|---|---|
| `AppShell.tsx` | header, sidebar, phone tab bar, and which pages need you to be logged in |
| `HeaderActions.tsx` | the **+** create menu and the notifications bell |
| `ui.tsx` | buttons, cards, chips, the Demo badge, page headings |
| `States.tsx` | loading, error (with "Try again"), empty, and success/error notices |
| `Dialog.tsx` | pop-up windows (keyboard-friendly, closes with Esc) |
| `Avatar.tsx` | profile photo, or emoji on a colour |
| `ProfileForm.tsx`, `ProfileInputs.tsx` | the profile form, chip pickers, free-time grid, photo upload |
| `ProfileViews.tsx` | the info view and the expressive (stickers) view |
| `FriendButton.tsx` | Add friend → Request sent → Friends, or Accept / Decline |
| `MatchInsight.tsx` | the Gemini / fallback note, with "What was sent to Gemini?" |
| `CreateForms.tsx` | create a group, create an event |
| `Icons.tsx` | the sidebar and header icons |

## Helpers (`src/lib/`)

| File | What it is |
|---|---|
| `api.ts` | every call to the API, in one place |
| `auth.tsx` | who is logged in (`useAuth`, `useMe`) |
| `useApi.ts` | load data for a page, optionally refreshing every few seconds |
| `types.ts` | the shapes of the data the API sends |
| `time.ts` | dates and times in your time zone |
| `options.ts` | the suggested interests, universities and goals (from the API) |

**Colours** live in `src/app/globals.css` under `@theme` (with Tailwind v4 that replaces `tailwind.config.js`).
Use them as classes: `bg-bark`, `text-paper`, `bg-ember`, `bg-card`, `bg-ice`.
More in [docs/WHERE_TO_EDIT.md](../docs/WHERE_TO_EDIT.md).
