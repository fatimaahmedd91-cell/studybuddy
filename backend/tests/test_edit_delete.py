"""Editing and cancelling events, editing and deleting groups, and removing group members."""

from datetime import datetime, timedelta, timezone

import pytest

from app.db import get_connection
from tests.helpers import make_person

GROUP = {"name": "CSCA08 Study Group", "description": "Weekly problem sets.", "tags": ["Coding"]}


def soon(hours=24):
    return (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat()


def event(**changes):
    return {"title": "Board game night", "starts_at": soon(), "location": "Student Centre", **changes}


def kinds(client, person):
    return [n["kind"] for n in client.get("/api/notifications", headers=person[0]).json()["items"]]


def going_event(client, organiser, *guests):
    ev = client.post("/api/events", json=event(), headers=organiser[0]).json()
    for guest in guests:
        assert client.post(f"/api/events/{ev['id']}/rsvp", headers=guest[0]).status_code == 200
    return ev


# ---------- Events ----------

def test_organiser_edits_an_event_and_people_going_hear_about_time_changes(database, client):
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")
    ev = going_event(client, a, b)
    assert ev["is_organiser"]

    # A new title or description alone doesn't notify anyone.
    renamed = client.patch(f"/api/events/{ev['id']}", json={"title": "Chess night", "description": "Bring a board"},
                           headers=a[0])
    assert renamed.status_code == 200
    assert renamed.json()["title"] == "Chess night" and renamed.json()["description"] == "Bring a board"
    assert "event_updated" not in kinds(client, b)

    moved = client.patch(f"/api/events/{ev['id']}", json={"starts_at": soon(48), "location": "Library"}, headers=a[0])
    assert moved.status_code == 200 and moved.json()["location"] == "Library"
    assert kinds(client, b)[0] == "event_updated"
    items = client.get("/api/notifications", headers=b[0]).json()["items"]
    assert items[0]["text"] == "Amira Khan changed the time or place of Chess night"
    assert items[0]["link"] == f"/events?id={ev['id']}"
    assert "event_updated" not in kinds(client, a)  # never about your own change

    # The end time can be set and removed again.
    ended = client.patch(f"/api/events/{ev['id']}", json={"ends_at": soon(50)}, headers=a[0]).json()
    assert ended["ends_at"] is not None
    cleared = client.patch(f"/api/events/{ev['id']}", json={"ends_at": None}, headers=a[0]).json()
    assert cleared["ends_at"] is None


def test_only_the_organiser_can_edit_or_cancel(database, client):
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")
    ev = going_event(client, a, b)
    assert client.patch(f"/api/events/{ev['id']}", json={"title": "Mine now"}, headers=b[0]).status_code == 403
    assert client.delete(f"/api/events/{ev['id']}", headers=b[0]).status_code == 403
    assert client.patch("/api/events/99999", json={"title": "Nothing"}, headers=a[0]).status_code == 404
    assert client.delete("/api/events/99999", headers=a[0]).status_code == 404
    assert client.patch(f"/api/events/{ev['id']}", headers=a[0], json={"group_id": 5}).status_code == 422
    assert client.get(f"/api/events/{ev['id']}", headers=a[0]).json()["title"] == "Board game night"


@pytest.mark.parametrize(
    "bad, message",
    [
        ({"starts_at": soon(-2)}, "past"),
        ({"starts_at": soon(24 * 400)}, "one year"),
        ({"ends_at": soon(23)}, "after the start"),
        ({"ends_at": soon(24 + 30)}, "24 hours"),
        ({"location": "", "online_url": ""}, "location or an online link"),
        ({"location": ""}, "location or an online link"),
        ({"title": None}, "can't be empty"),
    ],
)
def test_edits_follow_the_same_rules_as_creating(database, client, bad, message):
    a = make_person(client)
    ev = client.post("/api/events", json=event(), headers=a[0]).json()
    response = client.patch(f"/api/events/{ev['id']}", json=bad, headers=a[0])
    assert response.status_code == 422
    assert message in response.json()["detail"]


@pytest.mark.parametrize("bad", [{"starts_at": "2030-01-01T18:00:00"}, {"online_url": "javascript:alert(1)"},
                                 {"title": "ab"}])
def test_edit_input_format_errors(database, client, bad):
    a = make_person(client)
    ev = client.post("/api/events", json=event(), headers=a[0]).json()
    assert client.patch(f"/api/events/{ev['id']}", json=bad, headers=a[0]).status_code == 422


def test_an_event_that_has_started_keeps_its_start_but_one_that_ended_cant_change(database, client):
    a = make_person(client)
    ev = client.post("/api/events", json=event(), headers=a[0]).json()
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("UPDATE events SET starts_at = now() - interval '30 minutes', ends_at = NULL WHERE id = %s", (ev["id"],))
    # It's running now: the place can still change without moving the start time.
    running = client.patch(f"/api/events/{ev['id']}", json={"location": "Room 2"}, headers=a[0])
    assert running.status_code == 200, running.text

    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("UPDATE events SET starts_at = now() - interval '5 hours' WHERE id = %s", (ev["id"],))
    over = client.patch(f"/api/events/{ev['id']}", json={"title": "Too late"}, headers=a[0])
    assert over.status_code == 409


def test_cancelling_tells_people_going_and_removes_rsvps(database, client):
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")
    quiet = make_person(client, "Quiet Person")
    blocker = make_person(client, "Blocker")
    ev = going_event(client, a, b, quiet, blocker)
    client.patch("/api/me/notification-prefs", json={"groups_events": False}, headers=quiet[0])
    client.post("/api/blocks", json={"user_id": a[1]["id"]}, headers=blocker[0])

    cancelled = client.delete(f"/api/events/{ev['id']}", headers=a[0])
    assert cancelled.status_code == 200 and cancelled.json() == {"cancelled": True, "notified": 1}
    assert kinds(client, b)[0] == "event_cancelled"
    assert "event_cancelled" not in kinds(client, quiet)  # switched these off
    assert "event_cancelled" not in kinds(client, blocker)  # blocked the organiser
    assert client.get(f"/api/events/{ev['id']}", headers=b[0]).status_code == 404
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT count(*) AS n FROM event_rsvps WHERE event_id = %s", (ev["id"],))
        assert cur.fetchone()["n"] == 0


# ---------- Groups ----------

def test_owner_edits_a_group_and_others_cant(database, client):
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")
    group = client.post("/api/groups", json=GROUP, headers=a[0]).json()
    client.post(f"/api/groups/{group['id']}/join", headers=b[0])

    edited = client.patch(f"/api/groups/{group['id']}", json={"name": "CSCA48 Study Group", "tags": ["Study", "Study"]},
                          headers=a[0])
    assert edited.status_code == 200
    assert edited.json()["name"] == "CSCA48 Study Group" and edited.json()["tags"] == ["Study"]
    assert edited.json()["description"] == "Weekly problem sets."  # untouched

    assert client.patch(f"/api/groups/{group['id']}", json={"name": "Taken over"}, headers=b[0]).status_code == 403
    assert client.patch("/api/groups/99999", json={"name": "Nothing here"}, headers=a[0]).status_code == 404


@pytest.mark.parametrize("bad", [{"name": "ab"}, {"name": "x" * 61}, {"tags": ["x"] * 7}, {"name": None},
                                 {"created_by": 5}])
def test_group_edit_validation(database, client, bad):
    a = make_person(client)
    group = client.post("/api/groups", json=GROUP, headers=a[0]).json()
    assert client.patch(f"/api/groups/{group['id']}", json=bad, headers=a[0]).status_code == 422


def test_deleting_a_group_tells_members_and_keeps_its_events(database, client):
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")
    blocker = make_person(client, "Blocker")
    group = client.post("/api/groups", json=GROUP, headers=a[0]).json()
    client.post(f"/api/groups/{group['id']}/join", headers=b[0])
    client.post(f"/api/groups/{group['id']}/join", headers=blocker[0])
    client.post(f"/api/groups/{group['id']}/posts", json={"body": "Hello"}, headers=b[0])
    ev = client.post("/api/events", json=event(group_id=group["id"]), headers=a[0]).json()
    client.post("/api/blocks", json={"user_id": a[1]["id"]}, headers=blocker[0])

    assert client.delete(f"/api/groups/{group['id']}", headers=b[0]).status_code == 403
    deleted = client.delete(f"/api/groups/{group['id']}", headers=a[0])
    assert deleted.status_code == 200 and deleted.json() == {"deleted": True, "notified": 1}
    assert kinds(client, b)[0] == "group_deleted"
    assert "group_deleted" not in kinds(client, blocker)
    assert client.get(f"/api/groups/{group['id']}", headers=a[0]).status_code == 404

    kept = client.get(f"/api/events/{ev['id']}", headers=b[0])
    assert kept.status_code == 200 and kept.json()["group"] is None
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT count(*) AS n FROM group_posts WHERE group_id = %s", (group["id"],))
        assert cur.fetchone()["n"] == 0


def test_owner_removes_a_member(database, client):
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")
    c = make_person(client, "Priya Nair")
    outsider = make_person(client, "Outsider")
    group = client.post("/api/groups", json=GROUP, headers=a[0]).json()
    client.post(f"/api/groups/{group['id']}/join", headers=b[0])
    client.post(f"/api/groups/{group['id']}/join", headers=c[0])
    # B lets this group's plans use their private schedule.
    assert client.put("/api/planning/consents", json={"scope": "group", "group_id": group["id"]},
                      headers=b[0]).status_code == 200

    assert client.delete(f"/api/groups/{group['id']}/members/{a[1]['id']}", headers=a[0]).status_code == 400
    assert client.delete(f"/api/groups/{group['id']}/members/{c[1]['id']}", headers=b[0]).status_code == 403
    assert client.delete(f"/api/groups/{group['id']}/members/{outsider[1]['id']}", headers=a[0]).status_code == 404

    removed = client.delete(f"/api/groups/{group['id']}/members/{b[1]['id']}", headers=a[0])
    assert removed.status_code == 200
    assert [m["name"] for m in removed.json()["members"]] == ["Amira Khan", "Priya Nair"]
    assert "group" not in " ".join(kinds(client, b))  # removing someone doesn't notify them
    assert client.get(f"/api/groups/{group['id']}/posts", headers=b[0]).status_code == 403

    # Their planning permission for this group no longer counts, even if they join again.
    client.post(f"/api/groups/{group['id']}/join", headers=b[0])
    consents = client.get("/api/planning/consents", headers=b[0]).json()
    assert [g["allowed"] for g in consents["groups"] if g["id"] == group["id"]] == [False]


def test_the_owner_can_still_manage_a_group_after_leaving_it(database, client):
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")
    group = client.post("/api/groups", json=GROUP, headers=a[0]).json()
    client.post(f"/api/groups/{group['id']}/join", headers=b[0])
    client.post(f"/api/groups/{group['id']}/leave", headers=a[0])
    assert client.get(f"/api/groups/{group['id']}", headers=a[0]).json()["is_owner"] is True
    assert client.patch(f"/api/groups/{group['id']}", json={"description": "New"}, headers=a[0]).status_code == 200
