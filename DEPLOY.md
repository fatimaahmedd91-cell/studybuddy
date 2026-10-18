# Putting Meerkat live (GoDaddy domain + Vultr server)

(The server folder, service and database are still called `friendfinder`, the project's first name. Keep them: renaming would break updates on servers that already run it.)

How it fits together:

```
your-domain.com (GoDaddy DNS)  →  Vultr server
                                   ├─ Caddy: HTTPS, serves the website (frontend/out)
                                   │         and sends /api/... to ↓
                                   ├─ FastAPI backend (port 8000, private)
                                   └─ PostgreSQL (or Tiger Data, if you set DATABASE_URL)
```

- GoDaddy gives you the **domain name** (the MLH code covers this).
- Vultr gives you the **server** the site runs on.

> **Ask the team first.** Steps 1 and 2 cost money (or use up a promo code), and step 3 changes where your domain points.
> Agree on who pays and who has the logins before you start. Nothing in this repo does any of these steps by itself.

In this guide, replace:

| Placeholder | With |
|---|---|
| `your-domain.com` | the domain you bought, for example `meerkat.example` |
| `YOUR_VULTR_IP` | the server's IP address from Vultr, for example `203.0.113.10` |

Budget about 30 minutes. DNS changes can take a few minutes, and sometimes up to an hour, to work everywhere.

## Easiest: Render (free, one button, no server to manage)

`render.yaml` and `Dockerfile` describe the whole site, so Render sets everything up by itself:
the website and API as one program, plus a free PostgreSQL database.

1. Have your Gemini key ready (https://aistudio.google.com/apikey).
2. Open **https://render.com/deploy?repo=https://github.com/fatimaahmedd91-cell/studybuddy** and sign in with GitHub.
3. Render lists what it will create: **friendfinder** (the site) and **friendfinder-db** (the database).
   It asks for **GEMINI_API_KEY**: paste your key there. That's the only place it goes.
4. Click **Deploy Blueprint** (or **Apply**). The first build takes about 10 minutes.
5. Open **friendfinder** in the Render dashboard. When it says **Live**, click its address (`https://friendfinder-….onrender.com`).
   Check `…/api/health` says `"status":"ok"` and `"gemini": {"ok": true`.

Free-plan things to know:
- The site **sleeps after about 15 minutes without visitors**. The next visit takes about a minute to wake it, so open it a couple of minutes before a demo.
- The free database is **deleted after 30 days**. That's fine for a hackathon. Upgrade it in Render, or switch `DATABASE_URL` to TigerData, to keep it longer.

### Put your GoDaddy domain on Render

1. In Render: **friendfinder → Settings → Custom Domains → Add Custom Domain**. Add `your-domain.com`, then `www.your-domain.com`.
2. Render shows the DNS records to create. In GoDaddy: **My Products → your domain → DNS → Manage DNS**:

   | Type | Name | Value |
   |---|---|---|
   | A | `@` | the IP address Render shows (edit GoDaddy's existing "parked" `@` record instead of adding a second one) |
   | CNAME | `www` | your Render address, like `friendfinder-abcd.onrender.com` |

3. Back in Render, click **Verify**. Once DNS has updated (minutes, sometimes up to an hour), Render adds the HTTPS certificate by itself.

## Another way: your own Vultr server, one paste

This gets a working site on a Vultr server without typing anything on the server.

1. In Vultr: **Deploy +** → **Deploy New Server** → **Cloud Compute (Shared CPU)**.
   Pick a location near you, the image **Ubuntu 24.04 LTS x64**, and the cheapest plan with **at least 1 GB RAM**.
2. Open [`deploy/vultr-launch.sh`](deploy/vultr-launch.sh) on GitHub and click the **copy** button (top right of the file).
   Optional: paste it into Notepad first and put your Gemini key between the quotes on the `GEMINI_API_KEY=""` line.
3. Back in Vultr, turn on **Cloud-Init User-Data** and paste the script into the box. Click **Deploy**.
4. Wait about 15 minutes, then open `http://YOUR_VULTR_IP` (the IP is on the server's page in Vultr).
   - The secure address is `https://YOUR-IP-WITH-DASHES.sslip.io`, for example `https://203-0-113-10.sslip.io`.
     It uses a free shared address service, so its certificate is sometimes slow or unavailable. The `http://` address always works.
   - If setup fails, `http://YOUR_VULTR_IP` shows the error instead of the site. Screenshot it.

When you have a domain later, do steps 1 and 3 below, then on the server run
`cd /opt/friendfinder && ALSO_SERVE="http://YOUR_VULTR_IP" bash deploy/setup.sh your-domain.com`.

## 1. Get the domain on GoDaddy

1. Log in at godaddy.com, search for the domain you want, and add it to the cart.
2. Enter your MLH Hack the Valley promo code at checkout. Check the MLH sponsor page if the code asks for anything else.
3. Finish checkout. Hosting add-ons are not needed.

## 2. Create the Vultr server

1. In Vultr, click **Deploy +** → **Deploy New Server**.
2. Choose **Cloud Compute (shared CPU)**, a region near Toronto (for example Toronto or New York), and **Ubuntu 24.04 LTS**.
3. The smallest plan with **at least 1 GB RAM** is enough (building the website needs about 1 GB).
4. Deploy, wait until it says *Running*, and copy its **IP address** and **root password**.

## 3. Point the domain at the server (GoDaddy DNS)

In GoDaddy: **My Products → your domain → DNS → Manage DNS**.

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `@` | `YOUR_VULTR_IP` | 600 seconds |
| A | `www` | `YOUR_VULTR_IP` | 600 seconds |

Edit the existing `@` A record (GoDaddy adds a "parked" one) instead of adding a second one. Delete any other `A` record for `@`, and any `CNAME` for `www`.

Check it from your computer after a few minutes: `nslookup your-domain.com` should show `YOUR_VULTR_IP`.

## 4. Set up the server

On your own computer, open a terminal and connect (replace the IP; paste the root password when asked):

```
ssh root@YOUR_VULTR_IP
```

Then, on the server:

```
git clone https://github.com/fatimaahmedd91-cell/studybuddy /opt/friendfinder
cd /opt/friendfinder
bash deploy/setup.sh your-domain.com
```

If this code is still on a branch (not merged into `main` yet), run `git checkout claude/friendfinder-mvp` after the `cd` line.

`setup.sh` installs everything, builds the site, and starts it. It also:
- makes a random `JWT_SECRET`,
- sets `APP_ENV=production` (so the demo-data reset needs an extra `--allow-production`),
- installs PostgreSQL on the server if `DATABASE_URL` is empty (or see below to use TigerData),
- creates the tables and adds the fictional demo people, groups and events,
- turns on a firewall that only allows SSH and the website.

**Want TigerData from the start?** Before running `setup.sh`, create `backend/.env` from `backend/.env.example` and paste the TigerData URL after `DATABASE_URL=`.
Then `setup.sh` won't install PostgreSQL. If you switch later, the data already in the server's PostgreSQL doesn't move over by itself.

## 5. Settings on the server

The key goes only in the server's `.env` file, never in GitHub:

```
nano /opt/friendfinder/backend/.env
```

Paste your key after `GEMINI_API_KEY=`, save (Ctrl+O, Enter, Ctrl+X), then restart the API:

```
systemctl restart friendfinder-api
```

The same file has the other settings (see `backend/.env.example` for all of them):

| Setting | Change it when… |
|---|---|
| `DATABASE_URL` | you move to TigerData: paste its connection string |
| `GEMINI_MODEL` | you want a different Gemini model |
| `DEMO_MODE_ENABLED` | you want to hide "Try the demo" after judging: set it to `false` |
| `GOOGLE_MAPS_API_KEY` | you want real places near the halfway point (Google Places API (New); costs money after the free allowance) |
| `SMTP_…`, `TWILIO_…` | you set up email or phone codes (see `docs/PRE_LAUNCH_CHECKLIST.md`) |
| `TERMS_VERSION` | the Terms changed: everyone is asked to accept again |

Restart after every change: `systemctl restart friendfinder-api`.

## 6. Check it

- Open `https://your-domain.com`. The padlock means HTTPS is working.
- Open `https://your-domain.com/api/health`. You want `"status":"ok"`.
- Or open **Settings** (☰ at the bottom of the sidebar) and look at **System status**.
- Or run the full checker from your own computer: `python scripts/smoke_test.py https://your-domain.com` (every line should say PASS).
  It makes two test accounts and deletes them again at the end.

## Updating the live site

After new code is merged on GitHub:

```
ssh root@YOUR_VULTR_IP
cd /opt/friendfinder && bash deploy/update.sh
```

It pulls the code, restarts the API (which adds any new database tables by itself), rebuilds the website, and checks `/api/health`.

**The first update to Meerkat** (from the FriendFinder version) needs no extra steps: no new packages, and the new tables are added at start-up.
Existing accounts keep their data, are asked to accept the Terms on their next visit, and have AI turned off until they choose it.
This upgrade was tested on a copy of a database made by the old version.

## Everyday commands on the server

| To… | Run |
|---|---|
| See if the API is running | `systemctl status friendfinder-api` |
| See the API's recent log | `journalctl -u friendfinder-api -n 50` (add `-f` to keep watching) |
| Restart the API | `systemctl restart friendfinder-api` |
| See Caddy's log (HTTPS, website) | `journalctl -u caddy -n 50` |
| Restart Caddy | `systemctl restart caddy` |
| Check the API from the server itself | `curl -s http://127.0.0.1:8000/api/health` |
| Refresh demo events (moves ended ones to next week) | `cd /opt/friendfinder/backend && sudo -u friendfinder .venv/bin/python -m app.seed` |
| Delete and re-add **all** demo data (real accounts stay) | `cd /opt/friendfinder/backend && sudo -u friendfinder .venv/bin/python -m app.seed --reset --yes --allow-production` |

## If something is wrong

| Problem | Try |
|---|---|
| Domain doesn't open | DNS may still be updating. Check that `ping your-domain.com` shows your Vultr IP. |
| Browser warns about the certificate | Caddy gets the certificate once DNS points at the server. Wait a few minutes, then run `systemctl restart caddy`. |
| Site loads but login says the database isn't available | Run `systemctl status friendfinder-api` and `journalctl -u friendfinder-api -n 50`. |
| Match notes say "Suggested by Meerkat (not AI)" | Gemini isn't working. The note says why. Check `GEMINI_API_KEY` in `backend/.env` and `/api/health`. |
| `deploy/update.sh` says the API did not answer | Run `journalctl -u friendfinder-api -n 50`. It's usually a typo in `backend/.env`. |
| The website build runs out of memory | Use a plan with at least 1 GB RAM, or add swap: `fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile` |
| Caddy errors | Run `journalctl -u caddy -n 50`. |
