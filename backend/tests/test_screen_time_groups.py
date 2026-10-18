"""Self-reported screen time, screen-time groups, leaderboards and reminders."""

from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from app import db
from tests.helpers import befriend, make_person

TORONTO = ZoneInfo("America/Toronto")


def today(zone=TORONTO):
    return datetime.now(zone).date()


def run(sql, params=()):
    with db.get_connection() as conn, conn.cursor() as cur:
        cur.execute(sql, params)


def make_group(client, owner, metric="self_reported", target=120, name="Phone-down crew"):
    response = client.post(
        "/api/screen-time/groups",
        json={"name": name, "description": "Less scrolling, more strolling", "metric": metric, "daily_target_minutes": target},
        headers=owner[0],
    )
    assert response.status_code == 201, response.text
    return response.json()


def join(client, group, owner, *people):
    """Invites friends of the owner and accepts for them."""
    for person in people:
        result = client.post(f"/api/screen-time/groups/{group['id']}/invite", json={"user_ids": [person[1]["id"]]},
                             headers=owner[0]).json()
        assert result["invited"] == [person[1]["id"]], result
        accepted = client.post(f"/api/screen-time/groups/{group['id']}/accept", json={"share": True}, headers=person[0])
        assert accepted.status_code == 200, accepted.text


def log(client, person, day, minutes):
    response = client.put(f"/api/screen-time/entries/{day.isoformat()}", json={"minutes": minutes}, headers=person[0])
    assert response.status_code == 200, response.text


# ---------- Self-reported entries ----------


def test_self_reported_entries_are_validated_and_private(database, client):
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")
    yesterday = today() - timedelta(days=1)
    saved = client.put(f"/api/screen-time/entries/{yesterday}", json={"minutes": 95}, headers=a[0]).json()
    assert saved["minutes"] == 95
    # Changing the same day updates it instead of adding a second entry.
    log(client, a, yesterday, 100)

    bad = [
        (today() + timedelta(days=1), 30),      # the future
        (today() - timedelta(days=14), 30),     # more than 14 days back
        (yesterday, 1441),                      # more than 24 hours
        (yesterday, -5),
    ]
    for day, minutes in bad:
        assert client.put(f"/api/screen-time/entries/{day}", json={"minutes": minutes}, headers=a[0]).status_code == 422
    log(client, a, today() - timedelta(days=13), 30)  # the oldest allowed day

    mine = client.get("/api/screen-time/entries", headers=a[0]).json()
    assert mine["source"] == "self_reported" and mine["unit"] == "minutes"
    assert [(e["day"], e["minutes"]) for e in mine["entries"]] == [
        (yesterday.isoformat(), 100), ((today() - timedelta(days=13)).isoformat(), 30)
    ]
    assert client.get("/api/screen-time/entries", headers=b[0]).json()["entries"] == []

    assert client.delete(f"/api/screen-time/entries/{yesterday}", headers=a[0]).status_code == 200
    assert client.delete(f"/api/screen-time/entries/{yesterday}", headers=a[0]).status_code == 404


# ---------- Groups and invitations ----------


def test_creating_a_group_is_validated(database, client):
    a = make_person(client)
    base = {"name": "Crew", "metric": "self_reported", "daily_target_minutes": 120}
    for wrong in ({"daily_target_minutes": 5}, {"daily_target_minutes": 2000}, {"metric": "device"}, {"name": ""},
                  {"extra": 1}):
        assert client.post("/api/screen-time/groups", json={**base, **wrong}, headers=a[0]).status_code == 422
    group = make_group(client, a)
    assert group["metric_label"] == "Self-reported phone screen time"
    assert group["member_count"] == 1 and group["my_status"] == "active" and group["timezone"] == "America/Toronto"


def test_invites_go_only_to_friends_never_blocked_and_never_twice(database, client):
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")      # friend
    c = make_person(client, "Lena Petrova")    # not a friend
    d = make_person(client, "Daniel Osei")     # friend, then blocked
    befriend(client, a, b)
    befriend(client, a, d)
    client.post("/api/blocks", json={"user_id": a[1]["id"]}, headers=d[0])
    group = make_group(client, a)

    result = client.post(f"/api/screen-time/groups/{group['id']}/invite",
                         json={"user_ids": [b[1]["id"], c[1]["id"], d[1]["id"], a[1]["id"], b[1]["id"]]},
                         headers=a[0]).json()
    assert result["invited"] == [b[1]["id"]]
    reasons = {s["user_id"]: s["reason"] for s in result["skipped"]}
    assert reasons == {c[1]["id"]: "not_friends", d[1]["id"]: "not_friends", a[1]["id"]: "yourself"}

    again = client.post(f"/api/screen-time/groups/{group['id']}/invite", json={"user_ids": [b[1]["id"]]}, headers=a[0]).json()
    assert again["invited"] == [] and again["skipped"] == [{"user_id": b[1]["id"], "reason": "already_invited"}]

    # Only active members can invite; outsiders don't even learn the group exists.
    assert client.post(f"/api/screen-time/groups/{group['id']}/invite", json={"user_ids": [a[1]["id"]]},
                       headers=c[0]).status_code == 404
    notes = client.get("/api/notifications", headers=b[0]).json()["items"]
    assert notes[0]["kind"] == "screen_time_invite" and notes[0]["link"] == f"/screen-time?group={group['id']}"


def test_accepting_needs_explicit_sharing_and_invited_people_see_only_basics(database, client):
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")
    c = make_person(client, "Lena Petrova")
    befriend(client, a, b)
    group = make_group(client, a)
    client.post(f"/api/screen-time/groups/{group['id']}/invite", json={"user_ids": [b[1]["id"]]}, headers=a[0])

    invited_view = client.get(f"/api/screen-time/groups/{group['id']}", headers=b[0]).json()
    assert invited_view["my_status"] == "invited" and "members" not in invited_view
    assert "share your self-reported usage totals" in invited_view["consent_text"]
    assert invited_view["invited_by"]["id"] == a[1]["id"]
    listed = client.get("/api/screen-time/groups", headers=b[0]).json()
    assert listed["groups"] == [] and listed["invitations"][0]["id"] == group["id"]
    assert client.get(f"/api/screen-time/groups/{group['id']}/leaderboard", headers=b[0]).status_code == 404

    for body in ({}, {"share": False}, {"share": "yes"}):
        assert client.post(f"/api/screen-time/groups/{group['id']}/accept", json=body, headers=b[0]).status_code == 422
    joined = client.post(f"/api/screen-time/groups/{group['id']}/accept", json={"share": True}, headers=b[0]).json()
    assert [m["id"] for m in joined["members"]] == [a[1]["id"], b[1]["id"]]
    assert client.post(f"/api/screen-time/groups/{group['id']}/accept", json={"share": True}, headers=b[0]).status_code == 409
    kinds = [n["kind"] for n in client.get("/api/notifications", headers=a[0]).json()["items"]]
    assert "screen_time_joined" in kinds

    # Someone who was never invited gets "not found" for everything.
    for method, path, body in (
        ("GET", "", None), ("GET", "/leaderboard", None), ("POST", "/accept", {"share": True}),
        ("POST", "/decline", None), ("POST", "/leave", None),
    ):
        response = client.request(method, f"/api/screen-time/groups/{group['id']}{path}", json=body, headers=c[0])
        assert response.status_code == 404, path


def test_declining_removes_the_invitation(database, client):
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")
    befriend(client, a, b)
    group = make_group(client, a)
    client.post(f"/api/screen-time/groups/{group['id']}/invite", json={"user_ids": [b[1]["id"]]}, headers=a[0])
    assert client.post(f"/api/screen-time/groups/{group['id']}/decline", headers=b[0]).status_code == 200
    assert client.get("/api/screen-time/groups", headers=b[0]).json()["invitations"] == []
    assert client.get(f"/api/screen-time/groups/{group['id']}", headers=b[0]).status_code == 404


# ---------- Leaderboards ----------


def test_leaderboard_ranks_highest_first_and_missing_entries_are_not_zero(database, client):
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")
    c = make_person(client, "Lena Petrova")
    d = make_person(client, "Daniel Osei")
    for person in (b, c, d):
        befriend(client, a, person)
    group = make_group(client, a, target=120)
    join(client, group, a, b, c, d)
    yesterday = today() - timedelta(days=1)
    log(client, a, yesterday, 90)
    log(client, b, yesterday, 200)
    log(client, d, yesterday, 200)
    log(client, c, yesterday - timedelta(days=1), 500)  # a different day doesn't count

    board = client.get(f"/api/screen-time/groups/{group['id']}/leaderboard", headers=a[0]).json()
    assert board["day"] == yesterday.isoformat() and board["unit"] == "minutes" and board["target_minutes"] == 120
    assert board["metric"] == "self_reported" and board["updated_at"]
    assert [(r["rank"], r["person"]["name"], r["minutes"]) for r in board["ranked"]] == [
        (1, "Daniel Osei", 200), (1, "Tariq Aziz", 200), (3, "Amira Khan", 90)
    ]
    assert board["ranked"][0]["over_target"] is True and board["ranked"][0]["difference_minutes"] == 80
    assert board["ranked"][2]["over_target"] is False and board["ranked"][2]["difference_minutes"] == -30
    assert board["ranked"][2]["is_me"] is True
    # Lena has no entry for that day: listed separately, not ranked as 0.
    assert [x["person"]["name"] for x in board["no_entry"]] == ["Lena Petrova"]

    assert client.get(f"/api/screen-time/groups/{group['id']}/leaderboard?day={today() + timedelta(days=1)}",
                      headers=a[0]).status_code == 422


def test_leaving_hides_all_your_numbers_and_the_last_member_deletes_the_group(database, client):
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")
    befriend(client, a, b)
    group = make_group(client, a)
    join(client, group, a, b)
    yesterday = today() - timedelta(days=1)
    log(client, b, yesterday, 300)
    assert client.post(f"/api/screen-time/groups/{group['id']}/leave", headers=b[0]).json() == {"left": True}

    board = client.get(f"/api/screen-time/groups/{group['id']}/leaderboard?day={yesterday}", headers=a[0]).json()
    names = [r["person"]["name"] for r in board["ranked"]] + [x["person"]["name"] for x in board["no_entry"]]
    assert "Tariq Aziz" not in names
    assert client.get(f"/api/screen-time/groups/{group['id']}", headers=b[0]).status_code == 404

    client.post(f"/api/screen-time/groups/{group['id']}/leave", headers=a[0])
    with db.get_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT count(*) AS n FROM st_groups")
        assert cur.fetchone()["n"] == 0


def test_deleting_your_account_leaves_no_empty_group_behind(database, client):
    a = make_person(client, "Amira Khan")
    make_group(client, a)
    assert client.request("DELETE", "/api/me", json={"confirm": "DELETE"}, headers=a[0]).status_code == 200
    with db.get_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT count(*) AS n FROM st_groups")
        assert cur.fetchone()["n"] == 0


def test_metrics_are_never_mixed(database, client):
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")
    befriend(client, a, b)
    in_app = make_group(client, a, metric="in_app", name="Meerkat minutes")
    self_reported = make_group(client, a, metric="self_reported", name="Phone time")
    join(client, in_app, a, b)
    join(client, self_reported, a, b)
    yesterday = today() - timedelta(days=1)
    log(client, a, yesterday, 300)  # a self-reported number
    noon = datetime.combine(yesterday, time(12), TORONTO)
    for minute in range(3):  # 3 heartbeats of 60 seconds in Meerkat yesterday
        run("INSERT INTO app_time (user_id, at, seconds) VALUES (%s, %s, 60)", (a[1]["id"], noon + timedelta(minutes=minute)))

    in_app_board = client.get(f"/api/screen-time/groups/{in_app['id']}/leaderboard", headers=a[0]).json()
    assert in_app_board["metric_label"] == "Time in Meerkat (only this app)"
    assert [(r["person"]["name"], r["minutes"]) for r in in_app_board["ranked"]] == [("Amira Khan", 3)]
    assert [x["person"]["name"] for x in in_app_board["no_entry"]] == ["Tariq Aziz"]

    self_board = client.get(f"/api/screen-time/groups/{self_reported['id']}/leaderboard", headers=a[0]).json()
    assert [(r["person"]["name"], r["minutes"]) for r in self_board["ranked"]] == [("Amira Khan", 300)]


def test_in_app_days_follow_the_groups_time_zone(database, client):
    a = make_person(client, "Amira Khan")
    client.patch("/api/me", json={"timezone": "Asia/Tokyo"}, headers=a[0])
    group = make_group(client, a, metric="in_app")
    assert group["timezone"] == "Asia/Tokyo"
    tokyo = ZoneInfo("Asia/Tokyo")
    day = today(tokyo) - timedelta(days=1)
    inside = [datetime.combine(day, time(0, 30), tokyo), datetime.combine(day, time(23, 30), tokyo)]
    outside = [datetime.combine(day - timedelta(days=1), time(23, 30), tokyo),
               datetime.combine(day + timedelta(days=1), time(0, 30), tokyo)]
    for at in inside + outside:
        run("INSERT INTO app_time (user_id, at, seconds) VALUES (%s, %s, 60)", (a[1]["id"], at))
    board = client.get(f"/api/screen-time/groups/{group['id']}/leaderboard?day={day}", headers=a[0]).json()
    assert board["timezone"] == "Asia/Tokyo" and board["ranked"][0]["minutes"] == 2


def test_blocked_members_are_hidden_from_each_others_view(database, client):
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")
    befriend(client, a, b)
    group = make_group(client, a)
    join(client, group, a, b)
    yesterday = today() - timedelta(days=1)
    log(client, b, yesterday, 100)
    client.post("/api/blocks", json={"user_id": b[1]["id"]}, headers=a[0])
    for viewer, other in ((a, b), (b, a)):
        board = client.get(f"/api/screen-time/groups/{group['id']}/leaderboard", headers=viewer[0]).json()
        names = [r["person"]["name"] for r in board["ranked"]] + [x["person"]["name"] for x in board["no_entry"]]
        assert other[1]["name"] not in names
        members = client.get(f"/api/screen-time/groups/{group['id']}", headers=viewer[0]).json()["members"]
        assert other[1]["id"] not in [m["id"] for m in members]


# ---------- Reminders ----------


def reminders(client, person):
    return [n for n in client.get("/api/notifications", headers=person[0]).json()["items"] if n["kind"] == "reminder"]


def test_reminders_are_sent_once_a_day_and_only_if_switched_on(database, client):
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")
    befriend(client, a, b)
    group = make_group(client, a)
    join(client, group, a, b)

    client.get("/api/screen-time/groups", headers=b[0])
    assert reminders(client, b) == []  # reminders are off by default

    client.patch("/api/me/notification-prefs", json={"reminders": True}, headers=b[0])
    client.get("/api/screen-time/groups", headers=b[0])
    client.get("/api/screen-time/groups", headers=b[0])
    assert len(reminders(client, b)) == 1 and reminders(client, b)[0]["link"] == "/screen-time"

    # Already logged yesterday: no reminder.
    client.patch("/api/me/notification-prefs", json={"reminders": True}, headers=a[0])
    log(client, a, today() - timedelta(days=1), 60)
    client.get("/api/screen-time/groups", headers=a[0])
    assert reminders(client, a) == []

    # Not in a self-reported group: no reminder, even with reminders on.
    c = make_person(client, "Lena Petrova")
    client.patch("/api/me/notification-prefs", json={"reminders": True}, headers=c[0])
    client.get("/api/screen-time/groups", headers=c[0])
    assert reminders(client, c) == []


def test_the_first_heartbeat_of_a_visit_can_send_the_reminder(database, client):
    a = make_person(client, "Amira Khan")
    client.patch("/api/me/notification-prefs", json={"reminders": True}, headers=a[0])
    make_group(client, a)
    assert client.post("/api/screen-time/heartbeat", headers=a[0]).json() == {"counted": True}
    assert len(reminders(client, a)) == 1
