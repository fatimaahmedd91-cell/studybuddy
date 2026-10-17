#!/usr/bin/env bash
# First-time setup on a fresh Ubuntu 24.04 server (for example a Vultr instance).
#
#   git clone https://github.com/sinsiahussain-lab/studybuddy /opt/friendfinder
#   cd /opt/friendfinder
#   bash deploy/setup.sh yourdomain.com
#
# Run it as root. It is safe to run again: it skips anything already done.
set -euo pipefail

DOMAIN="${1:?Usage: bash deploy/setup.sh yourdomain.com}"
APP_DIR=/opt/friendfinder
ENV_FILE="$APP_DIR/backend/.env"

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run this as root (or with sudo)." >&2
  exit 1
fi
if [ ! -f "$APP_DIR/deploy/setup.sh" ]; then
  echo "Clone the repo into $APP_DIR first (see the top of this file)." >&2
  exit 1
fi
cd "$APP_DIR"

echo "==> 1/6 Installing system packages"
apt-get update
apt-get install -y python3-venv python3-pip git curl gnupg debian-keyring debian-archive-keyring apt-transport-https ufw

# Next.js needs Node.js 20.9 or newer. Ubuntu's own package is older, so use NodeSource.
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

# Caddy serves the site and gets HTTPS certificates automatically.
if ! command -v caddy >/dev/null; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi

echo "==> 2/6 Creating the app user"
id friendfinder >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin friendfinder

echo "==> 3/6 Setting up the backend"
python3 -m venv backend/.venv
backend/.venv/bin/pip install --quiet --upgrade pip
backend/.venv/bin/pip install --quiet -r backend/requirements.txt

if [ ! -f "$ENV_FILE" ]; then
  cp backend/.env.example "$ENV_FILE"
fi
# A fresh random JWT_SECRET, if there is none yet.
if grep -q '^JWT_SECRET=$' "$ENV_FILE"; then
  sed -i "s|^JWT_SECRET=$|JWT_SECRET=$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')|" "$ENV_FILE"
fi
# No DATABASE_URL yet? Install PostgreSQL on this server and use it.
# (To use Tiger Data instead, paste its connection string into backend/.env and run update.sh.)
if grep -q '^DATABASE_URL=$' "$ENV_FILE"; then
  echo "    No DATABASE_URL set, so installing PostgreSQL on this server"
  apt-get install -y postgresql
  DB_PASS="$(python3 -c 'import secrets; print(secrets.token_hex(24))')"
  if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='friendfinder'" | grep -q 1; then
    sudo -u postgres psql -qc "CREATE ROLE friendfinder LOGIN"
  fi
  sudo -u postgres psql -qc "ALTER ROLE friendfinder PASSWORD '$DB_PASS'"
  if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='friendfinder'" | grep -q 1; then
    sudo -u postgres createdb -O friendfinder friendfinder
  fi
  sed -i "s|^DATABASE_URL=$|DATABASE_URL=postgresql://friendfinder:$DB_PASS@127.0.0.1:5432/friendfinder|" "$ENV_FILE"
fi
# Only the app user can read the secrets file.
chown friendfinder:friendfinder "$ENV_FILE"
chmod 600 "$ENV_FILE"

echo "==> 4/6 Building the website"
(cd frontend && npm ci --no-audit --no-fund && npm run build)

echo "==> 5/6 Starting the services"
cp deploy/friendfinder-api.service /etc/systemd/system/friendfinder-api.service
systemctl daemon-reload
systemctl enable friendfinder-api
systemctl restart friendfinder-api
sed "s/DOMAIN_NAME/$DOMAIN/g" deploy/Caddyfile > /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl enable caddy
systemctl restart caddy

echo "==> 6/6 Turning on the firewall (SSH, HTTP, HTTPS only)"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo
echo "Done!"
if grep -q '^GEMINI_API_KEY=$' "$ENV_FILE"; then
  echo "  * Add your Gemini key:  nano $ENV_FILE   then:  systemctl restart friendfinder-api"
fi
echo "  * Once your GoDaddy DNS points here, open https://$DOMAIN"
echo "  * Health check: https://$DOMAIN/api/health"
