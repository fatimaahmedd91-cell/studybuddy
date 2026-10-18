# Meerkat in Codespaces

Everything starts by itself: the database, the API (with demo data), and the website.

1. Wait for the pop-up **"Your application running on port 3000 is available"** and click **Open in Browser**.
   (No pop-up? Open the **Ports** tab at the bottom and click the globe icon next to port 3000.)
2. Click **Try the demo**, or sign up.
3. Test everything at once. In the **Terminal** tab, run:
   ```
   python scripts/smoke_test.py
   ```
   Every line should say PASS (lines starting with INFO are just information).

**Gemini key:** add it as a Codespaces secret named `GEMINI_API_KEY` (GitHub → Settings → Codespaces → Secrets, and allow this repository), then restart the Codespace.
Without it, match notes are labelled **"Suggested by Meerkat (not AI)"**. With it, they say **"Written by Gemini"**.

**Run the API tests:** `cd backend && .venv/bin/pytest`

**Share with your team:** in the **Ports** tab, right-click port 3000 → **Port Visibility** → **Public**, then send them the address.
Set it back to **Private** when you're done.

**Something not working?** The logs are in `/tmp/friendfinder/api.log` and `/tmp/friendfinder/web.log`. To restart everything, run `bash .devcontainer/start.sh`.
