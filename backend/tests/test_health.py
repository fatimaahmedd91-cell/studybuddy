"""Tests for GET /api/health. Run them from the backend folder with:  pytest

Most tests swap in fake checks (with monkeypatch), so they work without a database or internet.
The last test calls the real Gemini API, and is skipped if GEMINI_API_KEY is not set.
"""

import pytest
from fastapi.testclient import TestClient

from app import config, health, main

client = TestClient(main.app)

OK = {"ok": True, "detail": "fake ok"}
DOWN = {"ok": False, "detail": "fake down"}


def test_health_is_ok_when_everything_is_reachable(monkeypatch):
    monkeypatch.setattr(main, "check_database", lambda: OK)
    monkeypatch.setattr(main, "check_gemini", lambda: OK)

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": OK, "gemini": OK}


def test_health_is_degraded_when_the_database_is_down(monkeypatch):
    monkeypatch.setattr(main, "check_database", lambda: DOWN)
    monkeypatch.setattr(main, "check_gemini", lambda: OK)

    response = client.get("/api/health")

    assert response.status_code == 503
    assert response.json()["status"] == "degraded"
    assert response.json()["database"] == DOWN


def test_health_is_degraded_when_gemini_is_down(monkeypatch):
    monkeypatch.setattr(main, "check_database", lambda: OK)
    monkeypatch.setattr(main, "check_gemini", lambda: DOWN)

    response = client.get("/api/health")

    assert response.status_code == 503
    assert response.json()["gemini"] == DOWN


def test_database_check_reports_missing_setting(monkeypatch):
    monkeypatch.setattr(config, "DATABASE_URL", "")
    assert health.check_database() == {"ok": False, "detail": "DATABASE_URL is not set"}


def test_database_check_never_shows_the_password(monkeypatch):
    # Port 1 on this computer has no database, so the connection fails straight away.
    monkeypatch.setattr(config, "DATABASE_URL", "postgresql://user:SECRET123@127.0.0.1:1/db")

    result = health.check_database()

    assert result["ok"] is False
    assert "SECRET123" not in result["detail"]


def test_gemini_check_reports_missing_key(monkeypatch):
    monkeypatch.setattr(config, "GEMINI_API_KEY", "")
    assert health.check_gemini() == {"ok": False, "detail": "GEMINI_API_KEY is not set"}


def test_gemini_check_reports_a_wrong_key(monkeypatch):
    monkeypatch.setattr(config, "GEMINI_API_KEY", "not-a-real-key")

    result = health.check_gemini()

    assert result["ok"] is False
    assert "not-a-real-key" not in result["detail"]


@pytest.mark.skipif(not config.GEMINI_API_KEY, reason="GEMINI_API_KEY is not set in backend/.env")
def test_gemini_is_reachable_with_the_real_key():
    assert health.check_gemini()["ok"] is True
