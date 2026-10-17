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

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-flash-lite-latest")
DATABASE_URL = os.getenv("DATABASE_URL", "")
