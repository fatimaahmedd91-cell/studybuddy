"""Tests for the account endpoints: signup, login, and /api/me.

Tests marked with the "database" fixture need TEST_DATABASE_URL or DATABASE_URL (see conftest.py).
The others only check input validation and tokens, so they always run.
"""

from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi.testclient import TestClient

from app import config, db, main

client = TestClient(main.app)

AMIRA = {"email": "Amira@Example.com", "password": "bubble-tea-42", "name": "  Amira Khan  "}


def signup(data=AMIRA):
    return client.post("/api/auth/signup", json=data)


def auth_header(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- Signup ----------


def test_signup_creates_an_account_and_returns_a_token(database):
    response = signup()

    assert response.status_code == 201
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    # Email is stored in lowercase, and spaces around the name are removed.
    assert body["user"]["email"] == "amira@example.com"
    assert body["user"]["name"] == "Amira Khan"
    assert "password" not in response.text


def test_signup_stores_a_hash_not_the_password(database):
    signup()

    with db.get_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT password_hash FROM users")
        stored = cur.fetchone()["password_hash"]

    assert stored != AMIRA["password"]
    assert stored.startswith("$argon2")


def test_signup_rejects_an_email_that_is_already_used(database):
    signup()
    response = signup({**AMIRA, "email": "AMIRA@example.com"})

    assert response.status_code == 409


@pytest.mark.parametrize(
    "changes",
    [
        {"email": "not-an-email"},
        {"password": "short"},
        {"password": "x" * 129},
        {"name": "   "},
        {"name": "x" * 61},
    ],
)
def test_signup_rejects_bad_input(changes):
    response = signup({**AMIRA, **changes})
    assert response.status_code == 422


def test_signup_rejects_missing_fields():
    response = client.post("/api/auth/signup", json={"email": "amira@example.com"})
    assert response.status_code == 422


def test_signup_without_jwt_secret_fails_and_saves_nothing(database, monkeypatch):
    monkeypatch.setattr(config, "JWT_SECRET", "")

    response = signup()

    assert response.status_code == 503
    with db.get_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT count(*) AS n FROM users")
        assert cur.fetchone()["n"] == 0


def test_signup_without_a_database_answers_503(monkeypatch):
    monkeypatch.setattr(config, "DATABASE_URL", "")
    assert signup().status_code == 503


# ---------- Login ----------


def test_login_with_the_right_password_returns_a_token(database):
    signup()

    response = client.post("/api/auth/login", json={"email": "amira@EXAMPLE.com", "password": AMIRA["password"]})

    assert response.status_code == 200
    assert response.json()["user"]["email"] == "amira@example.com"
    assert "password" not in response.text


def test_login_with_a_wrong_password_is_refused(database):
    signup()

    response = client.post("/api/auth/login", json={"email": AMIRA["email"], "password": "wrong-password"})

    assert response.status_code == 401
    assert response.json()["detail"] == "Wrong email or password"


def test_login_with_an_unknown_email_gives_the_same_message(database):
    response = client.post("/api/auth/login", json={"email": "nobody@example.com", "password": "whatever1"})

    assert response.status_code == 401
    assert response.json()["detail"] == "Wrong email or password"


# ---------- /api/me ----------


def test_me_returns_the_logged_in_user(database):
    token = signup().json()["access_token"]

    response = client.get("/api/me", headers=auth_header(token))

    assert response.status_code == 200
    assert response.json()["email"] == "amira@example.com"
    assert "password" not in response.text


def test_login_token_also_works_for_me(database):
    signup()
    login = client.post("/api/auth/login", json={"email": AMIRA["email"], "password": AMIRA["password"]})

    response = client.get("/api/me", headers=auth_header(login.json()["access_token"]))

    assert response.status_code == 200


def test_me_without_a_token_is_refused():
    assert client.get("/api/me").status_code == 401


def test_me_with_a_made_up_token_is_refused():
    assert client.get("/api/me", headers=auth_header("not.a.token")).status_code == 401


def test_me_with_an_expired_token_is_refused():
    old = datetime.now(timezone.utc) - timedelta(days=30)
    token = jwt.encode({"sub": "1", "iat": old, "exp": old + timedelta(days=7)}, config.JWT_SECRET, algorithm="HS256")

    assert client.get("/api/me", headers=auth_header(token)).status_code == 401


def test_me_with_a_token_signed_by_someone_else_is_refused():
    exp = datetime.now(timezone.utc) + timedelta(days=1)
    token = jwt.encode({"sub": "1", "exp": exp}, "a-different-secret-that-is-also-long-123", algorithm="HS256")

    assert client.get("/api/me", headers=auth_header(token)).status_code == 401


def test_me_for_a_deleted_account_is_refused(database):
    token = signup().json()["access_token"]
    with db.get_connection() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM users")

    assert client.get("/api/me", headers=auth_header(token)).status_code == 401
