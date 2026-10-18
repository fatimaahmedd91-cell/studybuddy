"""Serves the built website (frontend/out) from the API itself.

Used when the whole site runs as one program, for example on Render with the Dockerfile.
On a Vultr server, Caddy serves the website instead (see deploy/Caddyfile), so this is only
switched on when SERVE_WEBSITE=true.

For an address like /feed it sends, in order: the file "feed", "feed.html", "feed/index.html",
and otherwise the site's own 404 page. (The same rule as try_files in deploy/Caddyfile.)
"""

from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app import config

router = APIRouter()

# Files in /_next/static/ have a fingerprint in their name, so browsers may keep them for a year.
LONG_CACHE = {"Cache-Control": "public, max-age=31536000, immutable"}


def find_file(root: Path, path: str):
    """The file to send for this address, or None. Never returns anything outside root."""
    path = path.strip("/")
    candidates = [path, f"{path}.html", f"{path}/index.html"] if path else ["index.html"]
    for candidate in candidates:
        file = (root / candidate).resolve()
        if file.is_relative_to(root) and file.is_file():
            return file
    return None


@router.get("/{path:path}", include_in_schema=False)
def website(path: str):
    # Unknown API addresses stay JSON errors, like every other API answer.
    if path == "api" or path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not Found")
    root = config.WEBSITE_DIR.resolve()
    file = find_file(root, path)
    if file:
        headers = LONG_CACHE if path.startswith("_next/static/") else None
        return FileResponse(file, headers=headers)
    not_found = root / "404.html"
    if not_found.is_file():
        return FileResponse(not_found, status_code=404)
    raise HTTPException(status_code=404, detail="Not Found")
