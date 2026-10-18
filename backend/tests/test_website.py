"""The API sending the website's pages (SERVE_WEBSITE=true, used by the Dockerfile and Render)."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import config, website


@pytest.fixture
def site(tmp_path, monkeypatch):
    """A tiny fake website folder, like frontend/out, served by an app with only the website router."""
    out = tmp_path / "out"
    (out / "_next" / "static").mkdir(parents=True)
    (out / "feed").mkdir()
    (out / "index.html").write_text("home page")
    (out / "feed.html").write_text("feed page")
    (out / "feed.txt").write_text("feed data")
    (out / "404.html").write_text("not found page")
    (out / "_next" / "static" / "app.js").write_text("js")
    (tmp_path / "secret.txt").write_text("outside the website")
    monkeypatch.setattr(config, "WEBSITE_DIR", out)
    app = FastAPI()
    app.include_router(website.router)
    return TestClient(app)


def test_pages_are_found_with_or_without_html(site):
    assert site.get("/").text == "home page"
    assert site.get("/feed").text == "feed page"  # the feed/ folder doesn't hide feed.html
    assert site.get("/feed.txt").text == "feed data"


def test_unknown_pages_get_the_sites_404_page(site):
    response = site.get("/nope")
    assert response.status_code == 404 and response.text == "not found page"


def test_unknown_api_addresses_stay_json(site):
    response = site.get("/api/nope")
    assert response.status_code == 404 and response.json() == {"detail": "Not Found"}


def test_fingerprinted_files_are_cached_for_a_year(site):
    assert "immutable" in site.get("/_next/static/app.js").headers["cache-control"]
    assert "cache-control" not in site.get("/feed").headers


def test_files_outside_the_website_folder_are_never_sent(site):
    for path in ("/../secret.txt", "/%2e%2e/secret.txt", "/feed/../../secret.txt"):
        response = site.get(path)
        assert "outside the website" not in response.text, path
