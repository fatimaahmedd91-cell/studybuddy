# Putting FriendFinder live (GoDaddy domain + Vultr server)

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

Budget about 30 minutes. DNS changes can take a few minutes, and sometimes up to an hour, to work everywhere.

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
| A | `@` | your Vultr IP address | 600 seconds |
| A | `www` | your Vultr IP address | 600 seconds |

Edit the existing `@` A record (GoDaddy adds a "parked" one) instead of adding a second one. Delete any other `A` record for `@`, and any `CNAME` for `www`.

## 4. Set up the server

On your own computer, open a terminal and connect (replace the IP; paste the root password when asked):

```
ssh root@YOUR_VULTR_IP
```

Then, on the server:

```
git clone https://github.com/sinsiahussain-lab/studybuddy /opt/friendfinder
cd /opt/friendfinder
bash deploy/setup.sh your-domain.com
```

If this code is still on a branch (not merged into `main` yet), run `git checkout claude/friendfinder-site` after the `cd` line.

`setup.sh` installs everything, builds the site, and starts it. It also:
- makes a random `JWT_SECRET`,
- installs PostgreSQL on the server if `DATABASE_URL` is empty (you can switch to Tiger Data later),
- turns on a firewall that only allows SSH and the website.

## 5. Add the Gemini key on the server

The key goes only in the server's `.env` file, never in GitHub:

```
nano /opt/friendfinder/backend/.env
```

Paste your key after `GEMINI_API_KEY=`, save (Ctrl+O, Enter, Ctrl+X), then restart the API:

```
systemctl restart friendfinder-api
```

To use **Tiger Data** instead of the local database, paste its connection string after `DATABASE_URL=` in the same file and restart the same way.

## 6. Check it

- Open `https://your-domain.com`. The padlock means HTTPS is working.
- Open `https://your-domain.com/api/health`. You want `"status":"ok"`.
- Or open **Settings** (☰ at the bottom of the sidebar) and look at **System status**.
- Or run the full checker from your own computer: `python scripts/smoke_test.py https://your-domain.com` (every line should say PASS).

## Updating the live site

After pushing new code to GitHub:

```
ssh root@YOUR_VULTR_IP
cd /opt/friendfinder && bash deploy/update.sh
```

## If something is wrong

| Problem | Try |
|---|---|
| Domain doesn't open | DNS may still be updating. Check that `ping your-domain.com` shows your Vultr IP. |
| Browser warns about the certificate | Caddy gets the certificate once DNS points at the server. Wait a few minutes, then run `systemctl restart caddy`. |
| Site loads but login says the database isn't available | Run `systemctl status friendfinder-api` and `journalctl -u friendfinder-api -n 50`. |
| "Template insight" instead of "AI insight" | The Gemini key is missing or wrong in `backend/.env`. See `/api/health`. |
| Caddy errors | Run `journalctl -u caddy -n 50`. |
