#!/usr/bin/env bash
# Runs once, when the Codespace is created: installs the backend and the website.
# (The database runs in its own container, see docker-compose.yml.)
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> 1/2 Setting up the backend"
python -m venv backend/.venv
backend/.venv/bin/pip install --quiet --disable-pip-version-check -r backend/requirements.txt

if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
  sed -i "s|^DATABASE_URL=$|DATABASE_URL=postgresql://friendfinder:friendfinder@localhost:5432/friendfinder|" backend/.env
  sed -i "s|^JWT_SECRET=$|JWT_SECRET=$(python -c 'import secrets; print(secrets.token_urlsafe(48))')|" backend/.env
fi
# The Gemini key comes from your Codespaces secret (GEMINI_API_KEY), so it is never written to a file.

echo "==> 2/2 Installing the website"
(cd frontend && npm ci --no-audit --no-fund --loglevel=error)

echo "Setup finished."
