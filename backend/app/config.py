"""Settings for the backend.

Secrets are read ONLY from backend/.env (or from real environment variables on the server).
Never hardcode keys here, and never print them.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

# The backend folder (this file lives in backend/app/).
BACKEND_DIR = Path(__file__).resolve().parent.parent

# Copy the lines from backend/.env into os.environ. Variables that are already set
# (for example on the Vultr server) are kept, so the server's own settings win.
load_dotenv(BACKEND_DIR / ".env")

# "development" on your computer, "production" on the live server.
# In production, the demo-data reset command refuses to run unless you force it.
APP_ENV = os.getenv("APP_ENV", "development")

DATABASE_URL = os.getenv("DATABASE_URL", "")
JWT_SECRET = os.getenv("JWT_SECRET", "")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
# Which Gemini model writes match notes. "gemini-flash-lite-latest" is an alias Google keeps
# pointed at its current fast model; /api/health checks that it exists for your key.
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-flash-lite-latest")
GEMINI_TIMEOUT_SECONDS = int(os.getenv("GEMINI_TIMEOUT_SECONDS", "12"))

# Lets judges click "Try the demo" without signing up. Set to "false" to turn it off.
DEMO_MODE_ENABLED = os.getenv("DEMO_MODE_ENABLED", "true").lower() == "true"

# When the whole site runs as one program (the Dockerfile, Render), the API also sends the
# website's pages from WEBSITE_DIR. On a Vultr server Caddy does that instead, so it's off by default.
SERVE_WEBSITE = os.getenv("SERVE_WEBSITE", "false").lower() == "true"
WEBSITE_DIR = Path(os.getenv("WEBSITE_DIR", BACKEND_DIR.parent / "frontend" / "out"))

# ---------- Meetkat: age policy, terms, providers ----------

# Minimum age to join. 18 is the PROPOSED launch policy and still needs the team's confirmation
# (see docs/PRE_LAUNCH_CHECKLIST.md). Minors and adults are never mixed in the meantime.
MIN_AGE = int(os.getenv("MIN_AGE", "18"))

# The Terms of Service version people must accept. Change it when the terms change materially:
# everyone who accepted an older version is asked to accept again on their next visit.
TERMS_VERSION = os.getenv("TERMS_VERSION", "2026-10-18")

# Email codes (Settings → Verification). Any SMTP account works, for example a Gmail app password.
# Leave SMTP_HOST empty and email verification shows "not set up" instead of pretending.
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", "")

# Phone codes through Twilio Verify. All three are needed; otherwise phone checks show "not set up".
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_VERIFY_SERVICE_SID = os.getenv("TWILIO_VERIFY_SERVICE_SID", "")

# Selfie age check through an outside provider. Empty = not set up (no badge is ever shown).
# "mock" is a clearly labelled test mode that only works when APP_ENV=development.
AGE_CHECK_PROVIDER = os.getenv("AGE_CHECK_PROVIDER", "")

# Google Maps Platform key for real place search (server-side only, never sent to browsers).
# Empty = the planner still works and offers plain "search on Google Maps" links instead.
GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")
