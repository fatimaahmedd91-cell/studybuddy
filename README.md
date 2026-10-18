# Meerkat

**Finding your mob shouldn't be up to chance.**

A platonic friendship app for adults (18+, the proposed launch policy). Find people who share your interests,
goals and free time. Then become friends, message, share memories, plan hangouts that really fit
everyone's schedule, join groups and events, and keep screen time in check together.
Built for Hack the Valley. (Some internal names still say "friendfinder", the project's first name.)

- **Website:** Next.js + TypeScript + Tailwind (`frontend/`)
- **API:** Python + FastAPI (`backend/`)
- **Database:** PostgreSQL, or TigerData (Timescale) in the cloud
- **AI (optional, per person):** Google Gemini writes match notes, hangout suggestions and timetable imports, always labelled, with non-AI fallbacks
- **Safety:** blocking, reporting, a moderators' area, and contact details and schedules that stay private by default

What works today, and what doesn't yet: [docs/STATUS.md](docs/STATUS.md).
Before real users: [docs/PRE_LAUNCH_CHECKLIST.md](docs/PRE_LAUNCH_CHECKLIST.md) (decisions for the team, legal review, services to set up).

## Docs

| File | Read it when you want to… |
|---|---|
| [docs/DEMO.md](docs/DEMO.md) | demo the app to judges (3 minutes) |
| [docs/WHERE_TO_EDIT.md](docs/WHERE_TO_EDIT.md) | change a colour, a page, the matching, the AI prompt… |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | understand how the pieces fit together |
| [docs/STATUS.md](docs/STATUS.md) | see what's done, what's missing, and the sponsor integrations |
| [docs/PRE_LAUNCH_CHECKLIST.md](docs/PRE_LAUNCH_CHECKLIST.md) | see what the team must decide, review or set up before real users |
| [CONTRIBUTING.md](CONTRIBUTING.md) | work on the code with the team (branches, pull requests, tests) |
| [DEPLOY.md](DEPLOY.md) | put the site live: one button on Render (free), or a Vultr server, plus your GoDaddy domain |
| [backend/README.md](backend/README.md) | see every API endpoint |
| [frontend/README.md](frontend/README.md) | see every page and component |

---

## Start here: the easiest way (GitHub Codespaces, nothing to install)

1. On the repo page on GitHub, click **Code → Codespaces → Create codespace on** your branch.
2. Wait about 3 minutes. The database, API and website all start by themselves, with demo data.
3. When the pop-up says port 3000 is ready, click **Open in Browser**, then **Try the demo**.

Details: [.devcontainer/README.md](.devcontainer/README.md).

## Run it on your own computer

### You need

- **Python 3.12 or newer**: https://www.python.org/downloads/ (on Windows, tick **"Add python.exe to PATH"** in the installer)
- **Node.js 20.9 or newer** (pick "LTS"): https://nodejs.org
- **A PostgreSQL database**. Pick one:
  - **TigerData** (free cloud Postgres with Timescale, recommended): make a service at https://console.cloud.timescale.com and copy its connection string.
  - **PostgreSQL on your computer**: https://www.postgresql.org/download/ . Then create a database called `friendfinder`.

Restart your terminal after installing, so it finds `python` and `npm`.

### 1. Get the code

```
git clone https://github.com/sinsiahussain-lab/studybuddy.git
cd studybuddy
```

### 2. Set up the API (first time only)

**Windows** (Command Prompt):
```
cd backend
py -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

**Mac / Linux**:
```
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

(Using PowerShell on Windows? Activate with `.venv\Scripts\Activate.ps1`. If it says scripts are disabled, run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once.)

Now open `backend/.env` in your editor and fill in:

| Setting | What to put |
|---|---|
| `DATABASE_URL` | Your database's connection string, for example `postgresql://postgres:YOUR_PASSWORD@localhost:5432/friendfinder` |
| `JWT_SECRET` | A long random string. Make one with `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `GEMINI_API_KEY` | Optional. Your key from https://aistudio.google.com/apikey . Without it, match notes use the labelled fallback. |

`.env` is ignored by git, so your secrets stay on your computer. **Never** put a key in any other file, and never paste it into a chat or a commit.

Add the demo data (fictional students, groups and events, all marked "Demo"):
```
python -m app.seed
```

### 3. Set up the website (first time only)

Open a **second** terminal in the `studybuddy` folder:
```
cd frontend
npm ci
```

### 4. Run it (every time)

Terminal 1, the API (activate the virtual environment first, as in step 2):
```
cd backend
uvicorn app.main:app --reload
```

Terminal 2, the website:
```
cd frontend
npm run dev
```

Open **http://localhost:3000** and click **Try the demo**, or sign up.
Check that everything is connected at http://localhost:3000/api/health (you want `"status":"ok"`).

## Test it

| What | Command (run from…) |
|---|---|
| API tests (122 tests, need a database; the 2 that call Gemini are skipped without a key) | `pytest` (from `backend`, with `.venv` active) |
| Website type check | `npm run typecheck` (from `frontend`) |
| Website production build | `npm run build` (from `frontend`) |
| Whole journey against a running site, PASS/FAIL per step | `python scripts/smoke_test.py` (from the repo root; add `https://your-domain.com` for the live site) |
| Browser test (optional, needs Playwright) | see the top of `scripts/e2e/journey.mjs` |

## Demo data

- `python -m app.seed` adds the fictional people, groups and events if they're missing. It never deletes anything. It also moves demo events that have ended into the coming week.
- `python -m app.seed --reset --yes` deletes **all** demo data (including "Try the demo" accounts) and adds it back fresh. Real accounts are never touched.
- On the live server (`APP_ENV=production`) the reset also needs `--allow-production`, so nobody resets it by accident.
- Each **Try the demo** click makes a new demo account. These accounts are hidden from Discover and are deleted after 24 hours. Turn the button off with `DEMO_MODE_ENABLED=false`.

## Folders

| Folder | What it is |
|---|---|
| `frontend/` | The website |
| `backend/` | The API, the database tables (`backend/app/migrations/`) and the tests (`backend/tests/`) |
| `deploy/` | Server setup for Vultr: one-paste launch, Caddy (HTTPS), systemd service, setup and update scripts |
| `Dockerfile`, `render.yaml` | The whole site as one program, and the one-button Render setup |
| `scripts/` | `smoke_test.py` (API journey) and `e2e/journey.mjs` (browser journey) |
| `.devcontainer/` | GitHub Codespaces setup |
| `docs/` | The guides listed above |
| `src/`, `index.html`, `package.json`, `vite.config.js` (repo root) | The **first prototype** (React + Vite). `frontend/` replaces it. It's kept until the team agrees to delete it. |

## Troubleshooting

| You see | Try |
|---|---|
| `python` / `npm` is not recognized | Install it (see "You need"), then open a new terminal. On Windows try `py` instead of `python`. |
| The website says the server isn't reachable | Is terminal 1 (the API) still running? Open http://127.0.0.1:8000/api/health |
| `/api/health` says the database isn't available | Check `DATABASE_URL` in `backend/.env`, and that Postgres is running. TigerData URLs need `?sslmode=require` on the end. |
| Match notes say "Suggested by Meerkat (not AI)" | That's the fallback, and the note says why. Either AI is off for one of you (Settings → Privacy), or Gemini isn't set up or failed (check `GEMINI_API_KEY`). |
| `Too many sign-ups from this network` | The sign-up limit is 10 per hour per network. Restart the API to clear it locally. |
