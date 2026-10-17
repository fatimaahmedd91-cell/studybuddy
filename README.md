# FriendFinder (StudyBuddy)

## What's where (start here)

| Folder | What it is |
|---|---|
| `frontend/` | **The website** (Next.js + TypeScript + Tailwind), built from the design PDF. See `frontend/README.md`. |
| `backend/` | **The API** (Python + FastAPI): accounts, health check, AI insight. See `backend/README.md`. |
| `deploy/` + `DEPLOY.md` | How to put it live on a Vultr server with your GoDaddy domain. |
| `scripts/smoke_test.py` | Checks a running site end to end and prints PASS/FAIL: `python scripts/smoke_test.py` (your computer) or `python scripts/smoke_test.py https://your-domain.com`. |
| `src/`, `index.html`, `package.json` (repo root) | The first prototype (React + Vite). The new `frontend/` replaces it. |

---

## The first prototype: beginner guide

Everything is already written. Your job is to run it, test it, and be able to explain it.

## Step 1: Run the app (everyone, 5 minutes)

1. Install Node.js from https://nodejs.org (choose "LTS") if you do not have it. Restart your computer afterward.
2. Open a terminal:
   - Windows: press the Windows key, type `cmd`, press Enter.
   - Mac: press Cmd+Space, type `Terminal`, press Enter.
3. Go into the project folder (replace the path with where you saved it):
   ```
   cd path/to/studybuddy
   ```
4. Install (first time only):
   ```
   npm install
   ```
5. Start the app:
   ```
   npm run dev
   ```
6. Open the link it prints (usually http://localhost:5173) in your browser.

**You should see:** a landing page. Click "Find my match" and you will see match cards.

**If you see an error:**
- `npm is not recognized` or `command not found`: Node is not installed or you need to restart the terminal.
- `Cannot find module` or similar: run `npm install` again.
- Page is blank: press Ctrl+C in the terminal, run `npm run dev` again, and refresh the browser.
- Anything else: copy the full error and paste it to Claude.

## Who owns what

| Person | Role | Files |
|---|---|---|
| 1 | Front-end A (design) | `src/styles/theme.css`, `src/components/`, `src/pages/Landing.jsx` |
| 2 | Front-end B (interactions) | `src/App.jsx`, `src/pages/` (Feed, Profile, Events, ScreenTime), `src/components/Timetable.jsx` |
| 3 | Back-end A (data + testing) | `src/data/students.json`, `src/data/events.json` |
| 4 | Back-end B (logic + testing) | `src/lib/matching.js`, `src/lib/insight.js` |

## Easy tasks for each person (ask Claude if you get stuck)

**Person 1:** Open `src/styles/theme.css`. Change `--accent` and `--brand2` at the top to new colors (for example `#e63946`). Save. The page updates by itself.

**Person 2:** In the app, open Profile, edit the hook, press Save. Then switch "Demo as" at the top and confirm the feed changes. Report anything that looks broken.

**Person 3:** Open `src/data/students.json`. Copy one student block, paste it after the last one, give it a new `id` (13), a new name, and your own interests and courses. Save. Check the new student appears in the feed. Make sure every block ends with a comma except the last one.

**Person 4:** Open `src/lib/matching.js`. Find the lines starting `const interestScore`. These control how many points each shared interest is worth. Change the `10` to `15`, save, and watch the match percentages change. Write down what happened. This is the explanation you give the judges.

## How matching works (say this in the demo)

Each pair of students gets a score out of 100: up to 40 points for shared interests, up to 35 for shared courses, up to 25 for overlapping free time. No AI is involved in ranking.

## About the AI part (be honest with judges)

The "Match Insight" box currently uses **templates**, and it is labeled "Template insight" on screen. It is not a live AI model. Say that clearly. A live AI call can be added later, sending only shared interests, courses, and free slots (never names).

## Demo script (2 minutes)

1. Landing page, click "Find my match".
2. Show the feed as Amira. Point out the top match and the percentage.
3. Click Tariq: read the insight and show the green shared free time.
4. Switch to "Study buddies" to show the filter.
5. Open Events, press "Count me in".
6. Open Screen Time, start and finish a short focus session.
