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

echo "Updated. Check /api/health on your domain."
