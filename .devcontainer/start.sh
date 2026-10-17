#!/usr/bin/env bash
# Runs every time the Codespace starts: starts the API (port 8000) and the website
# (port 3000, which forwards /api to the API).
set -euo pipefail
cd "$(dirname "$0")/.."
LOGS=/tmp/friendfinder
mkdir -p "$LOGS"

# Stop copies that are already running, so this also works as a restart.
pkill -f "uvicorn app.main:app" 2>/dev/null || true
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

cd backend
setsid nohup .venv/bin/uvicorn app.main:app --port 8000 --reload --reload-dir app > "$LOGS/api.log" 2>&1 < /dev/null &
cd ../frontend
setsid nohup npm run dev -- --port 3000 > "$LOGS/web.log" 2>&1 < /dev/null &

echo "FriendFinder is starting. The website opens on port 3000 in about 30 seconds."
echo "Logs: $LOGS/api.log and $LOGS/web.log"
