#!/bin/bash
# FriendFinder: put the whole site live on a brand-new Vultr server, in one step.
#
# How to use it (you never have to type anything on the server):
#   1. In Vultr: Deploy + → Deploy New Server → Cloud Compute (Shared CPU).
#      Pick a location near you, the image "Ubuntu 24.04 LTS x64", and the cheapest plan with at least 1 GB RAM.
#   2. Optional: fill in GEMINI_API_KEY below (and DOMAIN, if your own domain already points at this server).
#   3. Turn on "Cloud-Init User-Data", paste this WHOLE file into the box, and click Deploy.
#   4. Wait about 15 minutes, then open  http://YOUR_SERVER_IP  (Vultr shows the IP on the server's page).
#      The secure address is https://YOUR-IP-WITH-DASHES.sslip.io, for example https://203-0-113-10.sslip.io
#
# If something goes wrong, http://YOUR_SERVER_IP shows the error instead of the site.
# The full log is in /var/log/friendfinder-launch.log on the server.
#
# Already have a server? Log in to it as root (ssh root@YOUR_SERVER_IP) and run:
#   curl -fsSL https://raw.githubusercontent.com/fatimaahmedd91-cell/studybuddy/main/deploy/vultr-launch.sh -o launch.sh
#   GEMINI_API_KEY='your-key' bash launch.sh

# Settings given on the command line, like GEMINI_API_KEY='...' bash launch.sh, are used if the lines below are empty.
FROM_COMMAND_LINE_GEMINI_API_KEY="${GEMINI_API_KEY:-}"
FROM_COMMAND_LINE_DOMAIN="${DOMAIN:-}"

# ---------------- Fill these in before pasting (both optional) ----------------
GEMINI_API_KEY=""   # your Gemini key, for real AI match notes. Empty = the labelled non-AI notes.
DOMAIN=""           # your own domain, ONLY if its DNS already points at this server. Empty = free sslip.io address.
# -------------------------------------------------------------------------------

GEMINI_API_KEY="${GEMINI_API_KEY:-$FROM_COMMAND_LINE_GEMINI_API_KEY}"
DOMAIN="${DOMAIN:-$FROM_COMMAND_LINE_DOMAIN}"
REPO="https://github.com/fatimaahmedd91-cell/studybuddy.git"
BRANCH="main"
APP_DIR=/opt/friendfinder
LOG=/var/log/friendfinder-launch.log

set -Eeuo pipefail
export HOME=/root PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a
exec > >(tee -a "$LOG") 2>&1

# If any step fails: stop the web server and show the end of this log at http://YOUR_SERVER_IP instead,
# so you can see what went wrong without logging in to the server. (The log never contains your keys.)
show_failure() {
  echo "!! The launch stopped with an error (exit code $?). See the lines above."
  mkdir -p /var/www/friendfinder-status
  {
    echo '<!doctype html><meta charset="utf-8"><title>FriendFinder setup stopped</title>'
    echo '<h1>FriendFinder setup stopped with an error</h1>'
    echo '<p>Take a screenshot of this page and send it to whoever is helping you. These are the last lines of the setup log:</p><pre>'
    tail -n 60 "$LOG" | sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g'
    echo '</pre>'
  } > /var/www/friendfinder-status/index.html
  chmod -R a+rX /var/www/friendfinder-status
  systemctl stop caddy 2>/dev/null || true
  if command -v ufw >/dev/null; then ufw allow 80/tcp >/dev/null 2>&1 || true; fi
  systemd-run --unit friendfinder-status --working-directory=/var/www/friendfinder-status \
    python3 -m http.server 80 >/dev/null 2>&1 || true
}
trap show_failure ERR

echo "==> FriendFinder launch started $(date -u)"
if [ "$(id -u)" -ne 0 ]; then
  echo "Please run this as root (log in with: ssh root@YOUR_SERVER_IP)."
  false
fi
# The site needs Python 3.12, which comes with Ubuntu 24.04. Older Ubuntu versions are too old.
. /etc/os-release
if [ "${ID:-}" != "ubuntu" ] || [ "${VERSION_ID:-0}" \< "24" ]; then
  echo "This server runs ${PRETTY_NAME:-an unknown system}, but FriendFinder needs Ubuntu 24.04."
  echo "In Vultr: open the server -> Settings -> Change OS -> Ubuntu 24.04 LTS x64. Then run this again."
  false
fi
echo 'DPkg::Lock::Timeout "900";' > /etc/apt/apt.conf.d/90friendfinder-wait-for-lock
apt-get update
apt-get install -y git curl

echo "==> Finding this server's public IP address"
IP="$(curl -fsS --max-time 5 http://169.254.169.254/v1/interfaces/0/ipv4/address 2>/dev/null || true)"
[[ "$IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || IP="$(curl -4 -fsS --max-time 10 https://api.ipify.org || true)"
[[ "$IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || IP="$(hostname -I | awk '{print $1}')"
if ! [[ "$IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Couldn't find this server's public IP address."
  false
fi
[ -n "$DOMAIN" ] || DOMAIN="${IP//./-}.sslip.io"
echo "    IP: $IP   web address: https://$DOMAIN"

echo "==> Downloading FriendFinder ($BRANCH)"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone --branch "$BRANCH" "$REPO" "$APP_DIR"
fi
cd "$APP_DIR"

# Put the Gemini key (if any) into the server's private settings file before setup.sh fills in the rest.
(
  umask 077  # only root can read these files (setup.sh hands .env to the app's own user)
  [ -f backend/.env ] || cp backend/.env.example backend/.env
  if [ -n "$GEMINI_API_KEY" ]; then
    grep -v '^GEMINI_API_KEY=' backend/.env > backend/.env.new
    printf 'GEMINI_API_KEY=%s\n' "$GEMINI_API_KEY" >> backend/.env.new
    mv backend/.env.new backend/.env
  fi
)

ALSO_SERVE="http://$IP" bash deploy/setup.sh "$DOMAIN"

echo "==> Checking that everything works"
for _ in $(seq 1 30); do
  if curl -fsS "http://$IP/api/health" >/dev/null 2>&1; then break; fi
  sleep 2
done
python3 scripts/smoke_test.py "http://$IP" || echo "!! Some checks failed. See the lines above."

cat > /root/FRIENDFINDER.txt <<EOF
FriendFinder is live.
  Website:        http://$IP   and   https://$DOMAIN
  Health check:   https://$DOMAIN/api/health
  Settings:       $APP_DIR/backend/.env   (restart after changes: systemctl restart friendfinder-api)
  Update to the newest code:   cd $APP_DIR && bash deploy/update.sh
  Launch log:     $LOG
EOF
echo "==> Done! Open http://$IP or https://$DOMAIN"
