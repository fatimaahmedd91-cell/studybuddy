"""Terms acceptance, suspension, blocking, reporting, notification choices and account settings."""

from app import config, db
from tests.helpers import befriend, make_person, signup


def run(sql, params=()):
    with db.get_connection() as conn, conn.cursor() as cur:
        cur.execute(sql, params)


# ---------- Terms ----------


def test_signup_stores_the_accepted_terms_version(database, client):
    headers, user = signup(client)
    assert user["terms"]["accepted_version"] == config.TERMS_VERSION and user["terms"]["current"]
    assert user["terms"]["accepted_at"]


def test_people_who_havent_accepted_the_current_terms_are_asked_again(database, client, monkeypatch):
    headers, _ = make_person(client)
    monkeypatch.setattr(config, "TERMS_VERSION", "v2")  # the Terms changed materially
    me = client.get("/api/me", headers=headers).json()
    assert me["terms"]["current"] is False and me["terms"]["current_version"] == "v2"
    assert client.get("/api/people", headers=headers).json() == {"detail": "terms_required"}
    # An old version, or not ticking the box, isn't accepted.
    assert client.post("/api/me/accept-terms", json={"accept": True, "version": "old"}, headers=headers).status_code == 409
    assert client.post("/api/me/accept-terms", json={"accept": False, "version": "v2"}, headers=headers).status_code == 422
    accepted = client.post("/api/me/accept-terms", json={"accept": True, "version": "v2"}, headers=headers).json()
    assert accepted["terms"]["current"] is True
    assert client.get("/api/people", headers=headers).status_code == 200


def test_signup_with_an_outdated_terms_version_is_refused(database, client):
    body = {"email": "a@example.com", "password": "long-enough-1", "name": "A", "accept_terms": True,
            "terms_version": "something-old"}
    assert client.post("/api/auth/signup", json=body).status_code == 409


# ---------- Suspension ----------


def test_suspended_accounts_cant_log_in_or_use_the_api(database, client):
    headers, user = signup(client, email="sus@example.com")
    run("UPDATE users SET suspended_at = now() WHERE id = %s", (user["id"],))
    assert client.get("/api/me", headers=headers).status_code == 403
    login = client.post("/api/auth/login", json={"email": "sus@example.com", "password": "bubble-tea-42"})
    assert login.status_code == 403 and "suspended" in login.json()["detail"]


# ---------- Blocking ----------


def test_blocking_hides_people_from_each_other_and_ends_the_friendship(database, client):
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")
    befriend(client, a, b)
    assert client.post("/api/blocks", json={"user_id": b[1]["id"]}, headers=a[0]).status_code == 201

    # Both directions: not in Discover, profiles gone, no friendship, no messages.
    for viewer, other in ((a, b), (b, a)):
        ids = [p["id"] for p in client.get("/api/people", headers=viewer[0]).json()["people"]]
        assert other[1]["id"] not in ids
        assert client.get(f"/api/people/{other[1]['id']}", headers=viewer[0]).status_code == 404
        assert client.get("/api/friends", headers=viewer[0]).json()["friends"] == []
        assert client.post(f"/api/messages/{other[1]['id']}", json={"body": "hi"}, headers=viewer[0]).status_code == 403
        assert client.get(f"/api/people/{other[1]['id']}/insight", headers=viewer[0]).status_code == 404

    # The blocker is told to unblock first; the blocked person just sees "not found".
    assert client.post("/api/friends/requests", json={"user_id": b[1]["id"]}, headers=a[0]).status_code == 409
    assert client.post("/api/friends/requests", json={"user_id": a[1]["id"]}, headers=b[0]).status_code == 404

    assert [x["person"]["id"] for x in client.get("/api/blocks", headers=a[0]).json()] == [b[1]["id"]]
    assert client.delete(f"/api/blocks/{b[1]['id']}", headers=a[0]).status_code == 200
    assert client.get(f"/api/people/{b[1]['id']}", headers=a[0]).status_code == 200
    # Unblocking doesn't bring the old friendship back.
    assert client.get("/api/friends", headers=a[0]).json()["friends"] == []


def test_blocking_yourself_or_nobody(database, client):
    a = make_person(client)
    assert client.post("/api/blocks", json={"user_id": a[1]["id"]}, headers=a[0]).status_code == 400
    assert client.post("/api/blocks", json={"user_id": 99999}, headers=a[0]).status_code == 404
    assert client.delete("/api/blocks/99999", headers=a[0]).status_code == 404


def test_blocked_people_cause_no_notifications_and_their_group_posts_are_hidden(database, client):
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")
    group = client.post("/api/groups", json={"name": "Chess club"}, headers=a[0]).json()
    client.post(f"/api/groups/{group['id']}/join", headers=b[0])
    client.post(f"/api/groups/{group['id']}/posts", json={"body": "hello from Tariq"}, headers=b[0])
    client.post("/api/blocks", json={"user_id": b[1]["id"]}, headers=a[0])

    posts = client.get(f"/api/groups/{group['id']}/posts", headers=a[0]).json()
    assert "hello from Tariq" not in [p["body"] for p in posts]
    texts = [n["text"] for n in client.get("/api/notifications", headers=a[0]).json()["items"]]
    assert not any("Tariq" in t for t in texts)


# ---------- Reporting ----------


def test_reports_are_saved_once_and_only_for_things_you_can_see(database, client):
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")
    c = make_person(client, "Lena Petrova")
    report = {"target_type": "profile", "target_id": b[1]["id"], "reason": "spam", "details": "Sends links"}
    created = client.post("/api/reports", json=report, headers=a[0])
    assert created.status_code == 201 and created.json()["status"] == "open"
    assert client.post("/api/reports", json=report, headers=a[0]).status_code == 409  # no duplicates
    assert client.post("/api/reports", json={**report, "target_id": a[1]["id"]}, headers=a[0]).status_code == 400
    assert client.post("/api/reports", json={**report, "reason": "made-up"}, headers=a[0]).status_code == 422

    # A message between other people can't be reported (or even found) by an outsider.
    befriend(client, a, b)
    message = client.post(f"/api/messages/{b[1]['id']}", json={"body": "hey"}, headers=a[0]).json()
    outsider = {"target_type": "message", "target_id": message["id"], "reason": "harassment"}
    assert client.post("/api/reports", json=outsider, headers=c[0]).status_code == 404
    assert client.post("/api/reports", json=outsider, headers=b[0]).status_code == 201


# ---------- Notification choices ----------


def test_switched_off_notifications_are_not_created(database, client):
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")
    prefs = client.patch("/api/me/notification-prefs", json={"friends": False}, headers=b[0])
    assert prefs.status_code == 200 and prefs.json()["notification_prefs"] == {"friends": False}
    client.post("/api/friends/requests", json={"user_id": b[1]["id"]}, headers=a[0])
    assert client.get("/api/notifications", headers=b[0]).json()["unread_count"] == 0
    # The request itself still arrives; only the notification is skipped.
    assert len(client.get("/api/friends", headers=b[0]).json()["incoming"]) == 1
    assert client.patch("/api/me/notification-prefs", json={"nonsense": True}, headers=b[0]).status_code == 422


# ---------- Account settings ----------


def test_changing_email_needs_the_password_and_resets_verification(database, client):
    headers, user = signup(client, email="old@example.com")
    run("UPDATE users SET email_verified_at = now() WHERE id = %s", (user["id"],))
    assert client.get("/api/me", headers=headers).json()["email_verified"] is True

    wrong = client.patch("/api/me/email", json={"new_email": "new@example.com", "current_password": "nope"}, headers=headers)
    assert wrong.status_code == 403
    changed = client.patch(
        "/api/me/email", json={"new_email": "New@Example.com", "current_password": "bubble-tea-42"}, headers=headers
    ).json()
    assert changed["email"] == "new@example.com" and changed["email_verified"] is False
    signup(client, email="taken@example.com")
    taken = client.patch("/api/me/email", json={"new_email": "taken@example.com", "current_password": "bubble-tea-42"},
                         headers=headers)
    assert taken.status_code == 409


def test_phone_is_private_validated_and_resets_verification(database, client):
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")
    assert client.patch("/api/me/phone", json={"phone": "416-555"}, headers=a[0]).status_code == 422
    saved = client.patch("/api/me/phone", json={"phone": "+14165550123"}, headers=a[0]).json()
    assert saved["phone"] == "+14165550123" and saved["phone_verified"] is False
    seen_by_b = client.get(f"/api/people/{a[1]['id']}", headers=b[0]).json()
    assert "phone" not in seen_by_b and "email" not in seen_by_b
    assert client.patch("/api/me/phone", json={"phone": None}, headers=a[0]).json()["phone"] is None


def test_badges_only_come_from_real_checks(database, client):
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")
    # The client can't set verification through the profile form.
    assert client.patch("/api/me", json={"email_verified": True}, headers=a[0]).status_code == 422
    assert client.get(f"/api/people/{a[1]['id']}", headers=b[0]).json()["badges"] == []
    run("UPDATE users SET email_verified_at = now(), age_check_status = 'passed', age_check_provider = 'mock' WHERE id = %s",
        (a[1]["id"],))
    # A test-mode age check never shows as "Age checked".
    assert client.get(f"/api/people/{a[1]['id']}", headers=b[0]).json()["badges"] == ["email_verified"]


def test_availability_audience_controls_who_sees_shared_free_times(database, client):
    a = make_person(client, "Amira Khan", availability={"Tue": ["afternoon"]})
    b = make_person(client, "Tariq Aziz", availability={"Tue": ["afternoon"]})
    overlap = lambda: client.get(f"/api/people/{a[1]['id']}", headers=b[0]).json()["match"]["overlap"]  # noqa: E731
    assert overlap() == [{"day": "Tue", "slot": "afternoon"}]
    client.patch("/api/me", json={"availability_audience": "friends"}, headers=a[0])
    assert overlap() == []
    befriend(client, a, b)
    assert overlap() == [{"day": "Tue", "slot": "afternoon"}]
    client.patch("/api/me", json={"availability_audience": "nobody"}, headers=a[0])
    assert overlap() == []


def test_hidden_from_discover_but_profile_still_opens(database, client):
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")
    client.patch("/api/me", json={"discoverable": False}, headers=a[0])
    assert a[1]["id"] not in [p["id"] for p in client.get("/api/people", headers=b[0]).json()["people"]]
    assert client.get(f"/api/people/{a[1]['id']}", headers=b[0]).status_code == 200


def test_bad_time_zone_is_refused(database, client):
    a = make_person(client)
    assert client.patch("/api/me", json={"timezone": "Mars/Base"}, headers=a[0]).status_code == 422
    assert client.patch("/api/me", json={"timezone": "America/Vancouver"}, headers=a[0]).json()["timezone"] == "America/Vancouver"


def test_consents_are_separate_and_reversible(database, client):
    a = make_person(client)
    assert client.get("/api/me", headers=a[0]).json()["consents"] == {}
    on = client.put("/api/me/consents/location_suggestions", json={"granted": True}, headers=a[0]).json()
    assert on["consents"] == {"location_suggestions": True}
    off = client.put("/api/me/consents/location_suggestions", json={"granted": False}, headers=a[0]).json()
    assert off["consents"] == {"location_suggestions": False}
    assert client.put("/api/me/consents/everything", json={"granted": True}, headers=a[0]).status_code == 404


def test_export_and_privacy_requests(database, client):
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")
    befriend(client, a, b)
    client.post(f"/api/messages/{b[1]['id']}", json={"body": "hello"}, headers=a[0])
    data = client.get("/api/me/export", headers=a[0]).json()
    assert data["profile"]["email"] == a[1]["email"] and data["messages"][0]["body"] == "hello"
    request = client.post("/api/privacy-requests", json={"kind": "deletion", "details": "Please delete me"}, headers=a[0])
    assert request.status_code == 201
    assert client.get("/api/privacy-requests", headers=a[0]).json()[0]["kind"] == "deletion"
    assert client.get("/api/privacy-requests", headers=b[0]).json() == []
