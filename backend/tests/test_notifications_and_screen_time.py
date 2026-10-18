"""The notification bell, and time in the app."""

from app import db
from tests.helpers import make_person


def test_mark_notifications_read(database, client):
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")
    c = make_person(client, "Lena Petrova")
    for sender in (b, c):
        client.post("/api/friends/requests", json={"user_id": a[1]["id"]}, headers=sender[0])

    notes = client.get("/api/notifications", headers=a[0]).json()
    assert notes["unread_count"] == 2
    first = notes["items"][0]
    assert first["actor"]["name"] == "Lena Petrova" and first["link"] == "/friends"

    assert client.post(f"/api/notifications/{first['id']}/read", headers=a[0]).status_code == 200
    assert client.get("/api/notifications", headers=a[0]).json()["unread_count"] == 1

    # Someone else's notification can't be touched.
    assert client.post(f"/api/notifications/{first['id']}/read", headers=b[0]).status_code == 404

    client.post("/api/notifications/read-all", headers=a[0])
    assert client.get("/api/notifications", headers=a[0]).json()["unread_count"] == 0


def test_heartbeats_count_30_seconds_but_not_twice_at_once(database, client):
    a = make_person(client)
    assert client.post("/api/screen-time/heartbeat", headers=a[0]).json() == {"counted": True}
    # A second tab sending at the same moment is ignored.
    assert client.post("/api/screen-time/heartbeat", headers=a[0]).json() == {"counted": False}

    summary = client.get("/api/screen-time?tz=America/Toronto", headers=a[0]).json()
    assert summary["today_seconds"] == 30
    assert len(summary["week"]) == 7 and summary["week"][-1]["seconds"] == 30
    assert summary["storage"] in ("postgresql", "timescaledb")


def test_older_heartbeats_add_up_by_day(database, client):
    a = make_person(client)
    with db.get_connection() as conn, conn.cursor() as cur:
        for hours_ago in (30, 30.5, 31):  # yesterday-ish
            cur.execute("INSERT INTO app_time (user_id, at, seconds) VALUES (%s, now() - %s * interval '1 hour', 30)",
                        (a[1]["id"], hours_ago))
    client.post("/api/screen-time/heartbeat", headers=a[0])
    week = client.get("/api/screen-time?tz=UTC", headers=a[0]).json()["week"]
    assert sum(day["seconds"] for day in week) == 120


def test_screen_time_goal_and_bad_time_zone(database, client):
    a = make_person(client)
    client.patch("/api/me", json={"daily_goal_minutes": 30}, headers=a[0])
    assert client.get("/api/screen-time?tz=UTC", headers=a[0]).json()["goal_minutes"] == 30
    assert client.get("/api/screen-time?tz=Mars/Base", headers=a[0]).status_code == 422
