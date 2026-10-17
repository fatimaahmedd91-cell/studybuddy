"""Gemini match notes (with a fake Gemini), the template fallback, caching, and demo mode."""

import pytest

from app import ai, config, seed
from tests.conftest import REAL_GEMINI_KEY
from tests.helpers import make_person, signup


def fake_gemini(calls, text="You both like coding."):
    def ask(facts):
        calls.append(facts)
        return ai.InsightOut(explanation=text, conversation_starter="What are you building lately?",
                             activity="Grab a coffee on Tue afternoon.")
    return ask


def test_without_a_key_the_template_note_is_used(database, client):
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")
    note = client.get(f"/api/people/{b[1]['id']}/insight", headers=a[0]).json()
    assert note["source"] == "fallback" and note["fallback_reason"] == "not_configured"
    assert "coding" in note["explanation"].lower()
    assert note["conversation_starter"] == "What got you into coding?"
    assert note["activity"].endswith("on Tue afternoon.")


def test_gemini_note_is_used_and_saved(database, client, monkeypatch):
    calls = []
    monkeypatch.setattr(ai, "ask_gemini", fake_gemini(calls))
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")

    first = client.get(f"/api/people/{b[1]['id']}/insight", headers=a[0]).json()
    assert first["source"] == "gemini" and first["cached"] is False
    # The other person sees the same saved note, without a second Gemini call.
    second = client.get(f"/api/people/{a[1]['id']}/insight", headers=b[0]).json()
    assert second["cached"] is True and second["explanation"] == first["explanation"]
    assert len(calls) == 1


def test_only_shared_facts_are_sent_to_gemini(database, client, monkeypatch):
    calls = []
    monkeypatch.setattr(ai, "ask_gemini", fake_gemini(calls))
    a = make_person(client, "Amira Khan", bio="Secret bio", interests=["Coding", "Opera"])
    b = make_person(client, "Tariq Aziz", interests=["coding", "Rugby"])
    client.get(f"/api/people/{b[1]['id']}/insight", headers=a[0])

    sent = calls[0]
    assert set(sent) == {"shared_interests", "shared_friendship_goals", "same_university", "both_free"}
    text = str(sent)
    for private in ("Amira", "Tariq", "Secret bio", "Opera", "Rugby", "@example.com", "19"):
        assert private not in text


def test_changing_what_you_share_makes_a_new_note(database, client, monkeypatch):
    calls = []
    monkeypatch.setattr(ai, "ask_gemini", fake_gemini(calls))
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")
    client.get(f"/api/people/{b[1]['id']}/insight", headers=a[0])
    client.patch("/api/me", json={"interests": ["Chess"]}, headers=a[0])
    client.get(f"/api/people/{b[1]['id']}/insight", headers=a[0])
    assert len(calls) == 2


@pytest.mark.parametrize("reason", ["quota", "timeout", "invalid_response", "error"])
def test_gemini_problems_fall_back_to_the_template(database, client, monkeypatch, reason):
    def broken(facts):
        raise ai.GeminiUnavailable(reason)

    monkeypatch.setattr(ai, "ask_gemini", broken)
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")
    note = client.get(f"/api/people/{b[1]['id']}/insight", headers=a[0]).json()
    assert note["source"] == "fallback" and note["fallback_reason"] == reason


def test_unusable_gemini_answers_are_rejected(monkeypatch):
    class FakeModels:
        def generate_content(self, **kwargs):
            class Response:
                text = '{"explanation": "short"}'
            return Response()

    class FakeClient:
        def __init__(self, **kwargs):
            self.models = FakeModels()

    import google.genai

    monkeypatch.setattr(config, "GEMINI_API_KEY", "fake-key")
    monkeypatch.setattr(google.genai, "Client", FakeClient)
    with pytest.raises(ai.GeminiUnavailable) as raised:
        ai.ask_gemini({"shared_interests": []})
    assert raised.value.reason == "invalid_response"


def test_romance_wording_is_rejected(monkeypatch):
    class FakeModels:
        def generate_content(self, **kwargs):
            class Response:
                text = ('{"explanation": "You two would make a romantic pair.", '
                        '"conversation_starter": "What do you like?", "activity": "Dinner date."}')
            return Response()

    class FakeClient:
        def __init__(self, **kwargs):
            self.models = FakeModels()

    import google.genai

    monkeypatch.setattr(config, "GEMINI_API_KEY", "fake-key")
    monkeypatch.setattr(google.genai, "Client", FakeClient)
    with pytest.raises(ai.GeminiUnavailable):
        ai.ask_gemini({"shared_interests": []})


def test_insight_about_yourself_or_unknown_people(database, client):
    a = make_person(client)
    assert client.get(f"/api/people/{a[1]['id']}/insight", headers=a[0]).status_code == 400
    assert client.get("/api/people/99999/insight", headers=a[0]).status_code == 404


@pytest.mark.skipif(not REAL_GEMINI_KEY, reason="GEMINI_API_KEY is not set in backend/.env")
def test_real_gemini_returns_a_structured_note(database, client, monkeypatch):
    monkeypatch.setattr(config, "GEMINI_API_KEY", REAL_GEMINI_KEY)
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")
    note = client.get(f"/api/people/{b[1]['id']}/insight", headers=a[0]).json()
    assert note["source"] == "gemini", note
    assert note["explanation"] and note["conversation_starter"] and note["activity"]


# ---------- Demo mode and seed data ----------


def test_try_the_demo_creates_a_ready_account(database, client):
    response = client.post("/api/auth/demo")
    assert response.status_code == 201
    body = response.json()
    assert body["user"]["is_demo"] and body["user"]["onboarded"]
    headers = {"Authorization": f"Bearer {body['access_token']}"}

    friends = client.get("/api/friends", headers=headers).json()
    assert len(friends["incoming"]) == 2 and len(friends["friends"]) == 1
    assert client.get("/api/conversations", headers=headers).json()[0]["unread"] == 2
    assert len(client.get("/api/people", headers=headers).json()["people"]) == 12
    assert len(client.get("/api/groups", headers=headers).json()) == 6
    assert len(client.get("/api/events", headers=headers).json()) == 6

    # Two demo visitors get separate accounts.
    other = client.post("/api/auth/demo").json()
    assert other["user"]["id"] != body["user"]["id"]


def test_demo_accounts_cannot_log_in_with_a_password(database, client):
    email = client.post("/api/auth/demo").json()["user"]["email"]
    assert client.post("/api/auth/login", json={"email": "amira.khan@x.com", "password": "x"}).status_code == 401
    assert email.endswith(".invalid")


def test_demo_mode_can_be_turned_off(database, client, monkeypatch):
    monkeypatch.setattr(config, "DEMO_MODE_ENABLED", False)
    assert client.post("/api/auth/demo").status_code == 403


def test_seed_reset_removes_demo_data_but_keeps_real_accounts(database, client):
    real_headers, _ = signup(client, "Real Person")
    client.post("/api/auth/demo")
    assert seed.main(["--reset", "--yes"]) == 0
    assert client.get("/api/me", headers=real_headers).status_code == 200
    from app import db
    with db.get_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT count(*) AS n FROM users WHERE is_demo")
        assert cur.fetchone()["n"] == 12  # the explorer account is gone, the 12 fictional people are back


def test_seed_reset_needs_confirmation_and_is_blocked_in_production(database, monkeypatch):
    assert seed.main(["--reset"]) == 1
    monkeypatch.setattr(config, "APP_ENV", "production")
    assert seed.main(["--reset", "--yes"]) == 1
    assert seed.main(["--reset", "--yes", "--allow-production"]) == 0
