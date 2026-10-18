#!/usr/bin/env bash
# Put the newest code from GitHub live. Run as root on the server:
#   cd /opt/friendfinder && bash deploy/update.sh
set -euo pipefail
cd /opt/friendfinder

echo "==> Getting the newest code"
git pull --ff-only

echo "==> Updating the backend"
backend/.venv/bin/pip install --quiet -r backend/requirements.txt
systemctl restart friendfinder-api

echo "==> Rebuilding the website"
(cd frontend && npm ci --no-audit --no-fund && npm run build)
systemctl reload caddy

echo "==> Checking the API (it updates the database tables when it starts)"
for _ in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:8000/api/health; then
    echo
    echo "Updated."
    exit 0
  fi
  sleep 1
done
echo "The API did not answer. See what went wrong with:  journalctl -u friendfinder-api -n 50" >&2
exit 1
