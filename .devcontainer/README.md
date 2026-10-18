# Meerkat in Codespaces

Everything starts by itself: the database, the API (with demo data), and the website.

1. Wait about 4 minutes the first time (it installs everything, then builds the website).
   When the pop-up says **port 8000** is available, click **Open in Browser**.
   (No pop-up? Open the **Ports** tab at the bottom, find **8000 · Meerkat (open this one)** and click its globe icon.)
2. Click **Try the demo**, or sign up.
3. Test everything at once. In the **Terminal** tab, run:
   ```
   python scripts/smoke_test.py http://localhost:8000
   ```
   Every line should say PASS (lines starting with INFO are just information).

**Gemini key:** add it as a Codespaces secret named `GEMINI_API_KEY` (GitHub → Settings → Codespaces → Secrets, and allow this repository), then restart the Codespace.
Without it, match notes are labelled **"Suggested by Meerkat (not AI)"**. With it, they say **"Written by Gemini"**.

**Run the API tests:** `cd backend && .venv/bin/pytest`

**Editing the website?** Port 8000 shows the website as it was when the Codespace started. To see your changes, either run
`bash .devcontainer/start.sh` again (rebuilds it, about a minute), or use port **3000**, which updates as you save.

**Why port 8000 and not 3000?** Codespaces sends large login cookies with every request. The website's development server
used to refuse them, which showed up as **HTTP ERROR 502** on port 3000. Port 8000 is the same program Render runs, and handles them.
Port 3000 now accepts larger cookies too, but 8000 is the safe choice.

**Share with your team:** in the **Ports** tab, right-click port 8000 → **Port Visibility** → **Public**, then send them the address.
Set it back to **Private** when you're done.

**Something not working?** The logs are in `/tmp/friendfinder/` (`api.log`, `web.log`, `build.log`). To restart everything, run `bash .devcontainer/start.sh`.
