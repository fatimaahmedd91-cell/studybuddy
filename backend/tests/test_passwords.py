"""Forgot password (reset by email code) and change password. Emails are collected, not sent."""

import re

import pytest

from app import config, db, verification
from tests.helpers import signup

GENERIC = "If that email belongs to a Meetkat account"


def run(sql, params=()):
    with db.get_connection() as conn, conn.cursor() as cur:
        cur.execute(sql, params)


@pytest.fixture
def outbox(monkeypatch):
    """Pretends SMTP is set up and collects the emails instead of sending them."""
    sent = []
    monkeypatch.setattr(config, "SMTP_HOST", "smtp.example.com")
    monkeypatch.setattr(config, "SMTP_FROM", "Meetkat <hello@example.com>")
    monkeypatch.setattr(verification, "send_email", lambda to, subject, body: sent.append((to, subject, body)))
    return sent


def code_in(body):
    return re.search(r"\b(\d{6})\b", body).group(1)


def ask_reset(client, email):
    return client.post("/api/auth/password-reset/request", json={"email": email})


def confirm(client, email, code, new_password="brand-new-password-1"):
    return client.post("/api/auth/password-reset/confirm", json={"email": email, "code": code, "new_password": new_password})


def log_in(client, email, password):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def other_code(code):
    return "000000" if code != "000000" else "111111"


# ---------- Forgot password ----------


def test_without_smtp_reset_says_it_is_not_set_up(database, client):
    signup(client, email="amira@example.com")
    response = ask_reset(client, "amira@example.com")
    assert response.status_code == 503 and "isn't available" in response.json()["detail"]


def test_unknown_email_gets_the_same_answer_and_no_email(database, client, outbox):
    signup(client, email="amira@example.com")
    known = ask_reset(client, "amira@example.com")
    unknown = ask_reset(client, "nobody@example.com")
    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json() and GENERIC in known.json()["message"]
    assert [to for to, _, _ in outbox] == ["amira@example.com"]


def test_reset_flow_changes_password_and_logs_out_old_sessions(database, client, outbox):
    old_headers, _ = signup(client, email="amira@example.com", password="old-password-1")
    assert client.get("/api/me", headers=old_headers).status_code == 200
    assert ask_reset(client, "Amira@Example.com").status_code == 200  # emails are matched without capitals
    to, subject, body = outbox[0]
    assert to == "amira@example.com" and "Reset" in subject and "15 minutes" in body

    done = confirm(client, "amira@example.com", code_in(body), "new-password-22")
    assert done.status_code == 200 and "Password changed" in done.json()["message"]

    stale = client.get("/api/me", headers=old_headers)
    assert stale.status_code == 401 and "password was changed" in stale.json()["detail"]
    assert log_in(client, "amira@example.com", "old-password-1").status_code == 401
    fresh = log_in(client, "amira@example.com", "new-password-22")
    assert fresh.status_code == 200
    new_headers = {"Authorization": f"Bearer {fresh.json()['access_token']}"}
    assert client.get("/api/me", headers=new_headers).status_code == 200

    # The code can't be used again.
    assert confirm(client, "amira@example.com", code_in(body), "another-password-3").status_code == 400


def test_five_wrong_codes_kill_the_code(database, client, outbox):
    signup(client, email="amira@example.com", password="old-password-1")
    ask_reset(client, "amira@example.com")
    code = code_in(outbox[0][2])
    for _ in range(5):
        wrong = confirm(client, "amira@example.com", other_code(code))
        assert wrong.status_code == 400 and wrong.json()["detail"] == "That code is wrong or has expired."
    # Even the right code doesn't work any more.
    assert confirm(client, "amira@example.com", code).status_code == 400
    assert log_in(client, "amira@example.com", "old-password-1").status_code == 200


def test_expired_code_is_refused(database, client, outbox):
    signup(client, email="amira@example.com", password="old-password-1")
    ask_reset(client, "amira@example.com")
    run("UPDATE contact_verifications SET expires_at = now() - interval '1 minute'")
    response = confirm(client, "amira@example.com", code_in(outbox[0][2]))
    assert response.status_code == 400 and response.json()["detail"] == "That code is wrong or has expired."
    assert log_in(client, "amira@example.com", "old-password-1").status_code == 200


def test_unknown_email_and_wrong_code_look_the_same(database, client, outbox):
    signup(client, email="amira@example.com")
    ask_reset(client, "amira@example.com")
    unknown = confirm(client, "nobody@example.com", "123456")
    wrong = confirm(client, "amira@example.com", other_code(code_in(outbox[0][2])))
    assert unknown.status_code == wrong.status_code == 400
    assert unknown.json() == wrong.json()


def test_resend_limits_apply_but_the_answer_stays_the_same(database, client, outbox):
    signup(client, email="amira@example.com")
    assert ask_reset(client, "amira@example.com").status_code == 200
    again = ask_reset(client, "amira@example.com")  # within 60 seconds
    assert again.status_code == 200 and GENERIC in again.json()["message"]
    assert len(outbox) == 1
    # After the wait, a new code replaces the old one.
    run("UPDATE contact_verifications SET sent_at = sent_at - interval '2 minutes'")
    ask_reset(client, "amira@example.com")
    assert len(outbox) == 2
    first, second = code_in(outbox[0][2]), code_in(outbox[1][2])
    if first != second:
        assert confirm(client, "amira@example.com", first).status_code == 400
    assert confirm(client, "amira@example.com", second).status_code == 200


def test_demo_and_suspended_accounts_get_no_email(database, client, outbox):
    # Real demo emails end in .invalid, which isn't accepted as an email at all, so mark a normal one as demo.
    signup(client, email="demo-person@example.com")
    run("UPDATE users SET is_demo = TRUE WHERE email = 'demo-person@example.com'")
    assert ask_reset(client, "demo-person@example.com").json()["message"].startswith("If that email")

    signup(client, email="sus@example.com")
    run("UPDATE users SET suspended_at = now() WHERE email = 'sus@example.com'")
    assert ask_reset(client, "sus@example.com").status_code == 200
    assert outbox == []


def test_a_failed_send_still_gives_the_same_answer(database, client, monkeypatch):
    monkeypatch.setattr(config, "SMTP_HOST", "smtp.example.com")
    monkeypatch.setattr(config, "SMTP_FROM", "x@example.com")

    def broken(to, subject, body):
        raise verification.SendFailed()

    monkeypatch.setattr(verification, "send_email", broken)
    signup(client, email="amira@example.com")
    response = ask_reset(client, "amira@example.com")
    assert response.status_code == 200 and GENERIC in response.json()["message"]
    # The unsent code can't be used.
    with db.get_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT count(*) AS n FROM contact_verifications WHERE used_at IS NULL")
        assert cur.fetchone()["n"] == 0


def test_new_password_must_follow_the_signup_rules(database, client, outbox):
    signup(client, email="amira@example.com")
    ask_reset(client, "amira@example.com")
    short = confirm(client, "amira@example.com", code_in(outbox[0][2]), "short")
    assert short.status_code == 422


# ---------- Change password (logged in) ----------


def test_change_password_needs_the_current_one(database, client):
    headers, _ = signup(client, email="amira@example.com", password="old-password-1")
    wrong = client.patch("/api/me/password", json={"current_password": "nope-nope", "new_password": "new-password-22"}, headers=headers)
    assert wrong.status_code == 403
    assert log_in(client, "amira@example.com", "old-password-1").status_code == 200


def test_change_password_keeps_this_device_and_logs_out_the_others(database, client):
    this_device, _ = signup(client, email="amira@example.com", password="old-password-1")
    other = log_in(client, "amira@example.com", "old-password-1").json()["access_token"]
    other_device = {"Authorization": f"Bearer {other}"}

    response = client.patch(
        "/api/me/password", json={"current_password": "old-password-1", "new_password": "new-password-22"}, headers=this_device
    )
    assert response.status_code == 200
    fresh = {"Authorization": f"Bearer {response.json()['access_token']}"}
    assert client.get("/api/me", headers=fresh).status_code == 200
    assert client.get("/api/me", headers=this_device).status_code == 401
    assert client.get("/api/me", headers=other_device).status_code == 401
    assert log_in(client, "amira@example.com", "new-password-22").status_code == 200
    assert log_in(client, "amira@example.com", "old-password-1").status_code == 401


def test_demo_accounts_cant_change_password(database, client):
    token = client.post("/api/auth/demo").json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    client.post("/api/me/accept-terms", json={"accept": True, "version": config.TERMS_VERSION}, headers=headers)
    response = client.patch("/api/me/password", json={"current_password": "whatever-1", "new_password": "new-password-22"}, headers=headers)
    assert response.status_code == 403


def test_password_change_never_appears_in_the_profile(database, client):
    headers, _ = signup(client)
    assert "password_changed_at" not in client.get("/api/me", headers=headers).json()
