"""Accounts: signup, login, sessions (tokens), and protected endpoints."""

from datetime import datetime, timedelta, timezone

import jwt
import pytest

from app import config, db
from tests.helpers import signup

AMIRA = {"email": "Amira@Example.com", "password": "bubble-tea-42", "name": "  Amira Khan  ", "accept_terms": True}


def test_signup_creates_an_account_and_returns_a_token(database, client):
    response = client.post("/api/auth/signup", json=AMIRA)

    assert response.status_code == 201
    body = response.json()
    assert body["access_token"]
    assert body["user"]["email"] == "amira@example.com"
    assert body["user"]["name"] == "Amira Khan"
    assert body["user"]["onboarded"] is False
    assert "password" not in response.text


def test_signup_stores_a_hash_not_the_password(database, client):
    client.post("/api/auth/signup", json=AMIRA)
    with db.get_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT password_hash FROM users")
        stored = cur.fetchone()["password_hash"]
    assert stored != AMIRA["password"] and stored.startswith("$argon2")


def test_signup_requires_the_age_and_terms_checkbox(database, client):
    response = client.post("/api/auth/signup", json={**AMIRA, "accept_terms": False})
    assert response.status_code == 422
    assert "18" in response.json()["detail"] and "Terms" in response.json()["detail"]


def test_signup_rejects_an_email_that_is_already_used(database, client):
    client.post("/api/auth/signup", json=AMIRA)
    assert client.post("/api/auth/signup", json={**AMIRA, "email": "AMIRA@example.com"}).status_code == 409


@pytest.mark.parametrize(
    "changes",
    [{"email": "not-an-email"}, {"password": "short"}, {"password": "x" * 129}, {"name": "   "}, {"name": "x" * 61}],
)
def test_signup_rejects_bad_input(client, changes):
    assert client.post("/api/auth/signup", json={**AMIRA, **changes}).status_code == 422


def test_login_with_the_right_password(database, client):
    client.post("/api/auth/signup", json=AMIRA)
    response = client.post("/api/auth/login", json={"email": "amira@EXAMPLE.com", "password": AMIRA["password"]})
    assert response.status_code == 200
    assert response.json()["user"]["email"] == "amira@example.com"


def test_login_gives_the_same_message_for_wrong_password_and_unknown_email(database, client):
    client.post("/api/auth/signup", json=AMIRA)
    wrong = client.post("/api/auth/login", json={"email": AMIRA["email"], "password": "wrong-password"})
    unknown = client.post("/api/auth/login", json={"email": "nobody@example.com", "password": "whatever1"})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json()["detail"] == unknown.json()["detail"]


def test_login_is_rate_limited(database, client):
    codes = [
        client.post("/api/auth/login", json={"email": "x@example.com", "password": "nope-nope"}).status_code
        for _ in range(11)
    ]
    assert codes[:10] == [401] * 10 and codes[10] == 429


def test_the_session_token_works_for_api_me(database, client):
    headers, _ = signup(client)
    response = client.get("/api/me", headers=headers)
    assert response.status_code == 200
    assert "password" not in response.text


@pytest.mark.parametrize("path", ["/api/me", "/api/people", "/api/friends", "/api/groups", "/api/events",
                                  "/api/notifications", "/api/conversations", "/api/screen-time"])
def test_protected_endpoints_refuse_requests_without_a_token(client, path):
    assert client.get(path).status_code == 401


def test_tokens_that_are_made_up_expired_or_signed_by_someone_else_are_refused(client):
    old = datetime.now(timezone.utc) - timedelta(days=30)
    expired = jwt.encode({"sub": "1", "exp": old + timedelta(days=7)}, config.JWT_SECRET, algorithm="HS256")
    foreign = jwt.encode({"sub": "1", "exp": datetime.now(timezone.utc) + timedelta(days=1)},
                         "a-different-secret-that-is-also-long-123", algorithm="HS256")
    for token in ["not.a.token", expired, foreign]:
        assert client.get("/api/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_a_deleted_account_can_no_longer_use_its_token(database, client):
    headers, _ = signup(client)
    assert client.request("DELETE", "/api/me", json={"confirm": "DELETE"}, headers=headers).status_code == 200
    assert client.get("/api/me", headers=headers).status_code == 401


def test_signup_without_a_database_answers_503(client, monkeypatch):
    monkeypatch.setattr(config, "DATABASE_URL", "")
    assert client.post("/api/auth/signup", json=AMIRA).status_code == 503


def test_signup_without_jwt_secret_fails_and_saves_nothing(database, client, monkeypatch):
    monkeypatch.setattr(config, "JWT_SECRET", "")
    assert client.post("/api/auth/signup", json=AMIRA).status_code == 503
    with db.get_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT count(*) AS n FROM users")
        assert cur.fetchone()["n"] == 0
