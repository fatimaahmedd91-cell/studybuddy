#!/usr/bin/env bash
# Runs every time the Codespace starts (and again whenever you want a restart):
#   port 8000: the whole site (website + API) as one program, the same way Render runs it. Open this one.
#   port 3000: the live-editing website (changes show as you save), which forwards /api to port 8000.
# Port 8000 is the one to use: Codespaces sends large login cookies, and the plain Next.js dev server
# used to refuse them (it showed as "HTTP ERROR 502"). The dev server now accepts bigger headers too.
set -euo pipefail
cd "$(dirname "$0")/.."
LOGS=/tmp/friendfinder
mkdir -p "$LOGS"

# Stop copies that are already running, so this also works as a restart.
pkill -f "uvicorn app.main:app" 2>/dev/null || true
pkill -f "next/dist/bin/next dev" 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true
sleep 1

# Wait for the database, so the API can create its tables when it starts.
DB_URL="$(grep '^DATABASE_URL=' backend/.env | cut -d= -f2-)"
for _ in $(seq 1 30); do
  if backend/.venv/bin/python -c "import psycopg2, sys; psycopg2.connect(sys.argv[1], connect_timeout=2).close()" "$DB_URL" 2>/dev/null; then
    break
  fi
  sleep 1
done

# Build the website, so the API can serve it on port 8000 (takes about a minute).
echo "Building the website (about a minute)..."
if ! (cd frontend && npm run build) > "$LOGS/build.log" 2>&1; then
  echo "The website didn't build. See $LOGS/build.log"
fi

cd backend
# Tables, plus the fictional demo people, groups and events (only adds what's missing).
.venv/bin/python -m app.seed || echo "Couldn't add demo data yet. The database may still be starting."
SERVE_WEBSITE=true setsid nohup .venv/bin/uvicorn app.main:app --port 8000 --reload --reload-dir app \
  > "$LOGS/api.log" 2>&1 < /dev/null &
cd ../frontend
# --hostname 0.0.0.0: listen on every address, so Codespaces' port forwarding can reach it.
BACKEND_URL=http://127.0.0.1:8000 setsid nohup npm run dev -- --port 3000 --hostname 0.0.0.0 \
  > "$LOGS/web.log" 2>&1 < /dev/null &

echo "Meerkat is starting. Open port 8000 (the Ports tab) in about 10 seconds."
echo "After changing website code, either use port 3000 (updates live) or run this script again."
echo "Logs: $LOGS/api.log, $LOGS/web.log and $LOGS/build.log"
