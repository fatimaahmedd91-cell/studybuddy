# Working on Meerkat together

## The golden rules

1. **Never commit secrets.** API keys, passwords and database URLs go only in `backend/.env`, which git ignores.
   Before every commit, run `git status` and make sure no `.env` file is listed.
   If a key ever lands in a commit, tell the team and make a new key straight away. Deleting the commit isn't enough.
2. **Never push straight to `main`.** Work on a branch and open a pull request.
3. **Pull before you start, and commit often.** Small commits are easier to review and to undo.
4. **Run the tests before opening a pull request** (see below).
5. **Don't overwrite someone else's work.** If `git pull` reports a conflict in a file a teammate is editing, ask them before you pick a side.

## Your first time

Follow "Run it on your own computer" in [README.md](README.md), or use Codespaces (nothing to install).

## Every time you work on something

```
git checkout main
git pull
git checkout -b yourname/what-you-are-doing        # for example: amira/events-filter
```

Make your change, then check it works (see "Before you open a pull request"), then:

```
git status                      # check: no .env files listed!
git add the/files/you/changed
git commit -m "Add a filter for online events"
git push -u origin yourname/what-you-are-doing
```

Then open the link git prints, or go to the repo on GitHub, and click **Compare & pull request**.
Ask one teammate to review it. Once it's approved, click **Merge**.

To bring in new changes from `main` while you work:
```
git checkout main && git pull
git checkout yourname/what-you-are-doing
git merge main
```

## Before you open a pull request

| You changed | Run |
|---|---|
| Anything in `backend/` | `pytest` in `backend` (with the virtual environment active). Every test should pass. |
| Anything in `frontend/` | `npm run typecheck` and `npm run build` in `frontend`. Both should finish without errors. |
| Anything a user can see | Click through it in the browser, at full width **and** phone width (browser dev tools → device toolbar). |
| Before a demo or a deploy | `python scripts/smoke_test.py` with the site running. Every line should say PASS. |

## Who owns what (suggested split for 4 people)

| Person | Area | Main files |
|---|---|---|
| 1 | Look and feel | `frontend/src/app/globals.css`, `frontend/src/components/ui.tsx`, `AppShell.tsx`, `ProfileViews.tsx` |
| 2 | Pages and interactions | `frontend/src/app/*/page.tsx`, `frontend/src/components/` |
| 3 | Data and API | `backend/app/*.py`, `backend/app/migrations/`, `backend/app/seed_data.py` |
| 4 | Matching, AI and testing | `backend/app/matching.py`, `backend/app/prompts.py`, `backend/app/ai.py`, `backend/tests/`, `scripts/` |

[docs/WHERE_TO_EDIT.md](docs/WHERE_TO_EDIT.md) lists exactly which file to open for common changes.

## How the code is written

- **Explain the why in comments**, in plain words. Someone new to code should be able to follow along.
- **Match the code around you**: same naming, same style, same level of comments.
- **The server checks everything.** The website checks forms to be friendly, but the API repeats every check, including "is this person allowed to do this?", because anyone can call the API directly.
- **Be honest on screen.** Only show "Saved", "Sent" or "Joined" after the server says it worked. Label demo data "Demo" and AI text "Gemini".
- **Privacy.** Never show someone's email or exact free times to other people. Never send names, emails or photos to Gemini. Never guess anything about a person from their photo.

## Changing the database

Never edit a migration that has already been merged: other people's databases have already run it.
Add a new file instead, with the next number, for example `backend/app/migrations/003_event_capacity.sql`.
The API runs new migrations by itself when it starts.

## Adding a package

Ask the team first. Every package is more to install, more to update, and more that can break.
Then add it with its exact version: in `backend/requirements.txt` for Python, or with `npm install` in `frontend` for the website, so `package-lock.json` updates too.
