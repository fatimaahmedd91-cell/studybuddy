"""Email/phone verification (with fake senders), the age-check boundary, and moderation."""

import re

import pytest

from app import config, db, verification
from tests.helpers import befriend, make_person, signup


def run(sql, params=()):
    with db.get_connection() as conn, conn.cursor() as cur:
        cur.execute(sql, params)


@pytest.fixture
def outbox(monkeypatch):
    """Pretends SMTP is set up and collects the emails instead of sending them."""
    sent = []
    monkeypatch.setattr(config, "SMTP_HOST", "smtp.example.com")
    monkeypatch.setattr(config, "SMTP_FROM", "Meetkat <hello@example.com>")
    monkeypatch.setattr(verification, "send_email", lambda to, subject, body: sent.append((to, body)))
    return sent


def code_in(body):
    return re.search(r"\b(\d{6})\b", body).group(1)


def allow_resend():
    run("UPDATE contact_verifications SET sent_at = sent_at - interval '2 minutes'")


# ---------- Email ----------


def test_without_smtp_email_verification_says_it_is_unavailable(database, client):
    headers, _ = signup(client)
    status = client.get("/api/verification", headers=headers).json()
    assert status["email"]["available"] is False and status["email"]["verified"] is False
    response = client.post("/api/verification/email/send", headers=headers)
    assert response.status_code == 503 and "isn't set up" in response.json()["detail"]


def test_email_code_verifies_only_with_the_right_code(database, client, outbox):
    headers, user = signup(client, email="amira@example.com")
    assert client.post("/api/verification/email/send", headers=headers).json()["sent"] is True
    to, body = outbox[0]
    assert to == "amira@example.com"
    code = code_in(body)
    wrong = "000000" if code != "000000" else "111111"
    bad = client.post("/api/verification/email/confirm", json={"code": wrong}, headers=headers)
    assert bad.status_code == 400 and "4 tries left" in bad.json()["detail"]
    assert client.get("/api/me", headers=headers).json()["email_verified"] is False
    good = client.post("/api/verification/email/confirm", json={"code": code}, headers=headers)
    assert good.status_code == 200 and good.json()["email_verified"] is True
    # The code can't be used twice, and an already verified email can't ask for a new one.
    assert client.post("/api/verification/email/confirm", json={"code": code}, headers=headers).status_code == 400
    assert client.post("/api/verification/email/send", headers=headers).status_code == 409


def test_email_codes_expire_have_limited_tries_and_resend_limits(database, client, outbox):
    headers, _ = signup(client)
    client.post("/api/verification/email/send", headers=headers)
    # Resending straight away is refused.
    assert client.post("/api/verification/email/send", headers=headers).status_code == 429
    for _ in range(5):
        client.post("/api/verification/email/confirm", json={"code": "999999"}, headers=headers)
    locked = client.post("/api/verification/email/confirm", json={"code": code_in(outbox[0][1])}, headers=headers)
    assert locked.status_code == 429  # even the right code is refused after too many tries

    allow_resend()
    client.post("/api/verification/email/send", headers=headers)
    run("UPDATE contact_verifications SET expires_at = now() - interval '1 minute' WHERE used_at IS NULL")
    expired = client.post("/api/verification/email/confirm", json={"code": code_in(outbox[1][1])}, headers=headers)
    assert expired.status_code == 400 and "expired" in expired.json()["detail"]


def test_changing_email_after_asking_for_a_code_cancels_it(database, client, outbox):
    headers, _ = signup(client, email="first@example.com")
    client.post("/api/verification/email/send", headers=headers)
    code = code_in(outbox[0][1])
    client.patch("/api/me/email", json={"new_email": "second@example.com", "current_password": "bubble-tea-42"}, headers=headers)
    assert client.post("/api/verification/email/confirm", json={"code": code}, headers=headers).status_code == 400
    assert client.get("/api/me", headers=headers).json()["email_verified"] is False


def test_failed_email_send_is_reported_honestly(database, client, monkeypatch):
    monkeypatch.setattr(config, "SMTP_HOST", "smtp.example.com")
    monkeypatch.setattr(config, "SMTP_FROM", "x@example.com")

    def broken(*args):
        raise verification.SendFailed()

    monkeypatch.setattr(verification, "send_email", broken)
    headers, _ = signup(client)
    response = client.post("/api/verification/email/send", headers=headers)
    assert response.status_code == 502 and "couldn't send" in response.json()["detail"]
    assert client.get("/api/verification", headers=headers).json()["email"]["code_sent"] is False


def test_demo_accounts_cant_verify(database, client, outbox):
    from tests.test_ai_and_demo import accept_terms
    body = client.post("/api/auth/demo").json()
    headers = {"Authorization": f"Bearer {body['access_token']}"}
    accept_terms(client, headers)
    assert client.post("/api/verification/email/send", headers=headers).status_code == 403


# ---------- Phone ----------


@pytest.fixture
def twilio(monkeypatch):
    """Pretends Twilio Verify is set up. The 'right' code is 424242."""
    monkeypatch.setattr(config, "TWILIO_ACCOUNT_SID", "AC123")
    monkeypatch.setattr(config, "TWILIO_AUTH_TOKEN", "token")
    monkeypatch.setattr(config, "TWILIO_VERIFY_SERVICE_SID", "VA123")
    texts = []
    monkeypatch.setattr(verification, "twilio_start", lambda phone: texts.append(phone))
    monkeypatch.setattr(verification, "twilio_check", lambda phone, code: code == "424242")
    return texts


def test_phone_verification(database, client, twilio):
    headers, _ = signup(client)
    assert client.post("/api/verification/phone/send", headers=headers).status_code == 400  # no number yet
    client.patch("/api/me/phone", json={"phone": "+14165550123"}, headers=headers)
    assert client.post("/api/verification/phone/send", headers=headers).status_code == 200
    assert twilio == ["+14165550123"]
    assert client.post("/api/verification/phone/confirm", json={"code": "111111"}, headers=headers).status_code == 400
    ok = client.post("/api/verification/phone/confirm", json={"code": "424242"}, headers=headers).json()
    assert ok["phone_verified"] is True and "phone_verified" in ok["badges"]
    # A new number starts unverified again.
    changed = client.patch("/api/me/phone", json={"phone": "+14165550199"}, headers=headers).json()
    assert changed["phone_verified"] is False and "phone_verified" not in changed["badges"]


def test_without_twilio_phone_verification_is_unavailable(database, client):
    headers, _ = signup(client)
    client.patch("/api/me/phone", json={"phone": "+14165550123"}, headers=headers)
    assert client.post("/api/verification/phone/send", headers=headers).status_code == 503
    assert client.get("/api/verification", headers=headers).json()["phone"]["available"] is False


# ---------- Age check ----------


def test_age_check_is_unavailable_without_a_provider(database, client):
    headers, _ = signup(client)
    status = client.get("/api/verification", headers=headers).json()["age"]
    assert status["available"] is False and status["status"] is None
    assert client.post("/api/verification/age/start", json={"consent": True}, headers=headers).status_code == 503


def test_age_check_test_mode_only_in_development_and_never_a_badge(database, client, monkeypatch):
    monkeypatch.setattr(config, "AGE_CHECK_PROVIDER", "mock")
    monkeypatch.setattr(config, "APP_ENV", "production")
    headers, user = make_person(client)
    assert client.post("/api/verification/age/start", json={"consent": True}, headers=headers).status_code == 503

    monkeypatch.setattr(config, "APP_ENV", "development")
    assert client.post("/api/verification/age/start", json={"consent": False}, headers=headers).status_code == 422
    result = client.post("/api/verification/age/start", json={"consent": True}, headers=headers).json()
    assert result["test_mode"] is True and result["user"]["age_check"]["provider"] == "mock"
    assert "age_checked" not in result["user"]["badges"]


# ---------- Moderation ----------


def make_moderator(user_id, role="moderator"):
    run("UPDATE users SET role = %s WHERE id = %s", (role, user_id))


def test_only_moderators_can_open_the_moderation_area(database, client):
    member = make_person(client)
    for path in ("/api/moderation/reports", "/api/moderation/actions", "/api/moderation/privacy-requests"):
        assert client.get(path, headers=member[0]).status_code == 403
    make_moderator(member[1]["id"])
    assert client.get("/api/moderation/reports", headers=member[0]).status_code == 200
    # Privacy requests contain personal details, so they're for admins only.
    assert client.get("/api/moderation/privacy-requests", headers=member[0]).status_code == 403


def test_report_queue_dismiss_remove_and_audit_log(database, client):
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")
    mod = make_person(client, "Mo Derator")
    make_moderator(mod[1]["id"])
    befriend(client, a, b)
    message = client.post(f"/api/messages/{a[1]['id']}", json={"body": "nasty words"}, headers=b[0]).json()
    client.post("/api/reports", json={"target_type": "message", "target_id": message["id"], "reason": "harassment"},
                headers=a[0])
    client.post("/api/reports", json={"target_type": "profile", "target_id": b[1]["id"], "reason": "spam"}, headers=a[0])

    queue = client.get("/api/moderation/reports", headers=mod[0]).json()
    assert [r["target_type"] for r in queue] == ["message", "profile"]
    assert queue[0]["current_content"] == "nasty words" and queue[0]["reporter"]["id"] == a[1]["id"]

    removed = client.post(f"/api/moderation/reports/{queue[0]['id']}/remove-content", json={"note": "abuse"}, headers=mod[0])
    assert removed.json() == {"status": "actioned", "removed": True}
    assert client.get(f"/api/messages/{a[1]['id']}", headers=b[0]).json()["messages"] == []
    assert client.post(f"/api/moderation/reports/{queue[0]['id']}/dismiss", json={}, headers=mod[0]).status_code == 409

    client.post(f"/api/moderation/reports/{queue[1]['id']}/dismiss", json={"note": "not spam"}, headers=mod[0])
    assert client.get("/api/moderation/reports", headers=mod[0]).json() == []
    log = client.get("/api/moderation/actions", headers=mod[0]).json()
    assert [entry["action"] for entry in log] == ["dismiss_report", "remove_content"]
    assert log[0]["moderator_name"] == "Mo Derator"


def test_suspending_and_unsuspending(database, client):
    a = signup(client, "Amira Khan", email="amira@example.com")
    mod = make_person(client, "Mo Derator")
    make_moderator(mod[1]["id"])
    assert client.post(f"/api/moderation/users/{mod[1]['id']}/suspend", json={"reason": "test"}, headers=mod[0]).status_code == 400
    assert client.post(f"/api/moderation/users/{a[1]['id']}/suspend", json={"reason": "Repeated harassment"},
                       headers=mod[0]).status_code == 200
    assert client.get("/api/me", headers=a[0]).status_code == 403
    assert client.post("/api/auth/login", json={"email": "amira@example.com", "password": "bubble-tea-42"}).status_code == 403
    client.post(f"/api/moderation/users/{a[1]['id']}/unsuspend", json={"note": "appeal accepted"}, headers=mod[0])
    assert client.get("/api/me", headers=a[0]).status_code == 200
    # A moderator can't suspend an admin.
    admin = make_person(client, "Ada Min")
    make_moderator(admin[1]["id"], "admin")
    assert client.post(f"/api/moderation/users/{admin[1]['id']}/suspend", json={"reason": "nope"},
                       headers=mod[0]).status_code == 403


def test_admins_handle_privacy_requests(database, client):
    a = make_person(client, "Amira Khan")
    admin = make_person(client, "Ada Min")
    make_moderator(admin[1]["id"], "admin")
    client.post("/api/privacy-requests", json={"kind": "access", "details": "What do you store?"}, headers=a[0])
    open_requests = client.get("/api/moderation/privacy-requests", headers=admin[0]).json()
    assert open_requests[0]["kind"] == "access" and open_requests[0]["contact_email"] == a[1]["email"]
    client.post(f"/api/moderation/privacy-requests/{open_requests[0]['id']}/done", json={}, headers=admin[0])
    assert client.get("/api/privacy-requests", headers=a[0]).json()[0]["status"] == "done"


def test_roles_command(database, capsys):
    from app import roles
    assert roles.main(["set", "nobody@example.com", "moderator"]) == 1
    assert roles.main(["list"]) == 0
    assert "Nobody is a moderator" in capsys.readouterr().out


def test_moderators_can_remove_a_reported_memory(database, client):
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")
    mod = make_person(client, "Mo Derator")
    make_moderator(mod[1]["id"])
    memory = client.post("/api/memories", json={"caption": "rude caption", "audience": "everyone"}, headers=b[0]).json()
    client.post("/api/reports", json={"target_type": "memory", "target_id": memory["id"], "reason": "harassment"}, headers=a[0])
    report = client.get("/api/moderation/reports", headers=mod[0]).json()[0]
    assert report["current_content"] == "rude caption" and report["reported_person"]["id"] == b[1]["id"]
    client.post(f"/api/moderation/reports/{report['id']}/remove-content", json={}, headers=mod[0])
    # Removed for everyone, including its author.
    assert client.get(f"/api/memories/{memory['id']}", headers=a[0]).status_code == 404
    assert client.get(f"/api/memories/{memory['id']}", headers=b[0]).status_code == 404
