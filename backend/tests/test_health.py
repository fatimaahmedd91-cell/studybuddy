"""Tests for GET /api/health. Run them from the backend folder with:  pytest"""

import pytest
from fastapi.testclient import TestClient

from app import config, health, main
from tests.conftest import REAL_GEMINI_KEY

client = TestClient(main.app)

OK = {"ok": True, "detail": "fake ok"}
DOWN = {"ok": False, "detail": "fake down"}


def test_health_is_ok_when_the_database_works(monkeypatch, database):
    monkeypatch.setattr(main, "check_database", lambda: dict(OK))
    monkeypatch.setattr(main, "check_gemini", lambda: OK)
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_missing_gemini_does_not_make_the_app_degraded(monkeypatch, database):
    monkeypatch.setattr(main, "check_database", lambda: dict(OK))
    monkeypatch.setattr(main, "check_gemini", lambda: DOWN)
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["gemini"] == DOWN


def test_health_is_degraded_when_the_database_is_down(monkeypatch):
    monkeypatch.setattr(main, "check_database", lambda: dict(DOWN))
    monkeypatch.setattr(main, "check_gemini", lambda: OK)
    response = client.get("/api/health")
    assert response.status_code == 503
    assert response.json()["status"] == "degraded"


def test_database_check_reports_missing_setting(monkeypatch):
    monkeypatch.setattr(config, "DATABASE_URL", "")
    assert health.check_database() == {"ok": False, "detail": "DATABASE_URL is not set"}


def test_database_check_never_shows_the_password(monkeypatch):
    monkeypatch.setattr(config, "DATABASE_URL", "postgresql://user:SECRET123@127.0.0.1:1/db")
    result = health.check_database()
    assert result["ok"] is False and "SECRET123" not in result["detail"]


def test_gemini_check_reports_missing_key(monkeypatch):
    monkeypatch.setattr(config, "GEMINI_API_KEY", "")
    assert health.check_gemini() == {"ok": False, "detail": "GEMINI_API_KEY is not set"}


@pytest.mark.skipif(not REAL_GEMINI_KEY, reason="GEMINI_API_KEY is not set in backend/.env")
def test_gemini_is_reachable_with_the_real_key(monkeypatch):
    monkeypatch.setattr(config, "GEMINI_API_KEY", REAL_GEMINI_KEY)
    assert health.check_gemini()["ok"] is True
