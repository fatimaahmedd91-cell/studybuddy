# The whole FriendFinder site as one program: the API also sends the website's pages.
# Render uses this (see render.yaml). It works on any host that runs Docker images.
#
#   docker build -t friendfinder .
#   docker run -p 8000:8000 -e DATABASE_URL=... -e JWT_SECRET=... -e GEMINI_API_KEY=... friendfinder
#
# Secrets are never built into the image: they come from the host's settings when it starts.

# ---- 1. Build the website into plain HTML/CSS/JS (frontend/out) ----
FROM node:22-slim AS website
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---- 2. The API, plus the website from step 1 ----
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    APP_ENV=production \
    SERVE_WEBSITE=true \
    WEBSITE_DIR=/app/frontend/out
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY scripts/ /app/scripts/
COPY --from=website /app/frontend/out /app/frontend/out

# Run as an ordinary user, not root.
RUN useradd --create-home friendfinder
USER friendfinder

EXPOSE 8000
# On every start: create or update the tables and add the demo data if it's missing (never deletes),
# then start the API. Hosts like Render say which port to use in $PORT.
CMD ["sh", "-c", "python -m app.seed || echo 'Demo data not added yet; check /api/health'; exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips '*'"]
