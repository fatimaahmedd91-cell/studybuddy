# FriendFinder website (Next.js + TypeScript + Tailwind)

The pages follow the design PDF: dark-brown sidebar, cream top bar, light-blue page, orange-framed cards.

| Page | File |
|---|---|
| Home (your profile) | `src/app/page.tsx` |
| Feed | `src/app/feed/page.tsx` |
| Messages | `src/app/messages/page.tsx` |
| Study groups | `src/app/groups/page.tsx` |
| Screen time | `src/app/screen-time/page.tsx` |
| Events | `src/app/events/page.tsx` |
| Friends (matching + AI insight) | `src/app/friends/page.tsx` |
| Settings (☰) | `src/app/settings/page.tsx` |
| Log in / Sign up | `src/app/login`, `src/app/signup` |

Shared pieces live in `src/components/` (sidebar and top bar are in `AppShell.tsx`), and the logic lives in `src/lib/`.

**Colours** are defined once in `src/app/globals.css` under `@theme`. With Tailwind v4 that block replaces the old `tailwind.config.js`. Use them as classes like `bg-bark`, `text-paper`, `bg-ember`, `bg-card`, `bg-ice`.

**What is real and what is demo data:**
- Real: sign up, log in, `/api/me`, the AI insight, and the system status. These call the Python backend.
- Demo: students, posts, groups, chats, screen time, and events come from `src/lib/data.ts` and `src/data/*.json`, and your changes are saved in your browser.

## Run it on your computer

You need Node.js 20.9 or newer. Start the backend first (see `backend/README.md`), then:

```
cd frontend
npm install
npm run dev
```

Open http://localhost:3000. While developing, calls to `/api/...` are forwarded to the backend on port 8000.

## Build for the live site

```
npm run build
```

This writes plain HTML/CSS/JS into `out/`, which Caddy serves on the server. See `../DEPLOY.md`.
