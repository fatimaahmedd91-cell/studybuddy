# FriendFinder (StudyBuddy) - Beginner Guide

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
5. Add the Gemini API key (only needed for the AI insight; the app works without it):
   - Copy `.env.example` and rename the copy to `.env.local` (same folder as `package.json`).
   - Paste the key after `GEMINI_API_KEY=` and save. Get the key from your team privately, not from GitHub.
   - `.env.local` is ignored by git. **Never put the key in any other file or commit it.** This repo is public.
6. Start the app:
   ```
   npm run dev
   ```
7. Open the link it prints (usually http://localhost:5173) in your browser.

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
| 4 | Back-end B (logic + testing) | `src/lib/matching.js`, `src/lib/insight.js`, `server/insightApi.js`, `server/index.js` |

## Easy tasks for each person (ask Claude if you get stuck)

**Person 1:** Open `src/styles/theme.css`. Change `--accent` and `--brand2` at the top to new colors (for example `#e63946`). Save. The page updates by itself.

**Person 2:** In the app, open Profile, edit the hook, press Save. Then switch "Demo as" at the top and confirm the feed changes. Report anything that looks broken.

**Person 3:** Open `src/data/students.json`. Copy one student block, paste it after the last one, give it a new `id` (13), a new name, and your own interests and courses. Save. Check the new student appears in the feed. Make sure every block ends with a comma except the last one.

**Person 4:** Open `src/lib/matching.js`. Find the lines starting `const interestScore`. These control how many points each shared interest is worth. Change the `10` to `15`, save, and watch the match percentages change. Write down what happened. This is the explanation you give the judges.

## How matching works (say this in the demo)

Each pair of students gets a score out of 100: up to 40 points for shared interests, up to 35 for shared courses, up to 25 for overlapping free time. No AI is involved in ranking.

## About the AI part (be honest with judges)

**Ranking is plain math, not AI.** Only the "Match Insight" sentence uses AI.

- When you open a match, the app asks **Google Gemini** to write the "why you might get along" sentence. The label says "AI insight · Gemini".
- Gemini sees only shared interests, shared courses, and shared free times. Never names, ages, or contact info. The suggested event is added by our own code, not the AI.
- The key stays on the computer running `npm run dev`. The browser calls our own `/api/insight` endpoint (`server/insightApi.js`), and that endpoint calls Gemini. The key is never in the web page.
- If there is no key, no internet, or Gemini fails, the box falls back to our **templates** and the label says "Template insight". Tell the judges which one they are seeing.
- The endpoint runs with `npm run dev`, `npm run preview`, and `npm start` (the live website). If you upload only the `dist/` folder to a plain file host, you will get the template insight.

## Keep editing (the everyday loop)

1. Get the newest code: `git pull`
2. Start the app: `npm run dev`, and keep it open in the browser.
3. Edit files and save. The page updates by itself.
4. Check for mistakes: `npm run lint` and `npm run build` (both should finish without errors).
5. Save your work to GitHub:
   ```
   git add .
   git commit -m "Short note about what you changed"
   git push
   ```
   Run `git status` before `git add .` and make sure `.env.local` is **not** in the list. It never should be, because git ignores it.

If two people edit the same lines, `git pull` may report a conflict. Ask Claude to help fix it.

## Put it online with GoDaddy

Use GoDaddy **Node.js Hosting**, which comes with GoDaddy Web Hosting plans (Economy, Deluxe, Ultimate). Plain file hosting or Website Builder cannot run the AI part.

How the live site works: GoDaddy runs `npm install`, then `npm run build` (makes the `dist/` folder), then `npm start` (runs `server/index.js`). That server sends the app to visitors and answers `/api/insight`. It also limits each visitor to 30 insights per 10 minutes so nobody can use up the Gemini key.

1. In your GoDaddy account, open **Node.js Hosting** and create a new app.
2. Choose **Connect GitHub** and pick this repository. GoDaddy will deploy again every time you `git push`.
   (The other option is uploading a zip of the project. Do not include `node_modules` or `.env.local` in the zip.)
3. In the app's environment variables, add `GEMINI_API_KEY` with the key. Type it into GoDaddy's settings. **Never commit it to GitHub.**
4. Deploy, open the preview link, and test: Feed, then click a match, and look for the "AI insight · Gemini" label.
5. Connect your domain in GoDaddy's domain settings for the app.

GoDaddy's screens may name these buttons a little differently. Their help pages for Node.js Hosting have the current steps.

To test the live-site server on your own computer first: `npm run build`, then `npm start`, then open http://localhost:3000.

## Demo script (2 minutes)

1. Landing page, click "Find my match".
2. Show the feed as Amira. Point out the top match and the percentage.
3. Click Tariq: read the AI insight (point at the "AI insight · Gemini" label) and show the green shared free time.
4. Switch to "Study buddies" to show the filter.
5. Open Events, press "Count me in".
6. Open Screen Time, start and finish a short focus session.
