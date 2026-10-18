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
