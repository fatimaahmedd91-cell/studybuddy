"""Tests for POST /api/insight. Gemini is replaced with a fake, so no internet is needed."""

import pytest
from fastapi.testclient import TestClient

from app import config, insight, main

client = TestClient(main.app)

FACTS = {
    "sharedInterests": ["Coding", "Cafes"],
    "sharedCourses": ["CSCA48"],
    "sharedSlots": [{"day": "Tue", "slot": "afternoon"}],
}


@pytest.fixture(autouse=True)
def fresh_limits(monkeypatch):
    """Every test starts with a key set and an empty rate-limit record."""
    monkeypatch.setattr(config, "GEMINI_API_KEY", "fake-key-for-tests")
    insight._requests_by_visitor.clear()


def test_insight_returns_the_ai_text(monkeypatch):
    prompts = []

    def fake_gemini(prompt):
        prompts.append(prompt)
        return "You both love coding and cafes."

    monkeypatch.setattr(insight, "ask_gemini", fake_gemini)

    response = client.post("/api/insight", json=FACTS)

    assert response.status_code == 200
    assert response.json()["text"] == "You both love coding and cafes."
    # The prompt holds the shared facts.
    assert "CSCA48" in prompts[0] and "Tue afternoon" in prompts[0]


def test_insight_refuses_extra_fields_like_names(monkeypatch):
    monkeypatch.setattr(insight, "ask_gemini", lambda prompt: "unused")

    response = client.post("/api/insight", json={**FACTS, "name": "Amira Khan"})

    assert response.status_code == 422


@pytest.mark.parametrize(
    "bad",
    [
        {"sharedSlots": [{"day": "Sun", "slot": "afternoon"}]},
        {"sharedSlots": [{"day": "Mon", "slot": "midnight"}]},
        {"sharedInterests": ["x" * 41]},
        {"sharedCourses": ["A"] * 11},
    ],
)
def test_insight_refuses_bad_input(bad):
    assert client.post("/api/insight", json={**FACTS, **bad}).status_code == 422


def test_insight_without_a_key_answers_503(monkeypatch):
    monkeypatch.setattr(config, "GEMINI_API_KEY", "")
    assert client.post("/api/insight", json=FACTS).status_code == 503


def test_insight_hides_gemini_errors(monkeypatch):
    def broken(prompt):
        raise RuntimeError("secret internal detail")

    monkeypatch.setattr(insight, "ask_gemini", broken)

    response = client.post("/api/insight", json=FACTS)

    assert response.status_code == 502
    assert "secret" not in response.text


def test_insight_rate_limit(monkeypatch):
    monkeypatch.setattr(insight, "ask_gemini", lambda prompt: "ok")

    codes = [client.post("/api/insight", json=FACTS).status_code for _ in range(insight.LIMIT + 1)]

    assert codes[: insight.LIMIT] == [200] * insight.LIMIT
    assert codes[-1] == 429
