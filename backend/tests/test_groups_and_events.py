"""Groups (create, join, leave, discussion) and events (create, RSVP, validation, time zones)."""

from datetime import datetime, timedelta, timezone

import pytest

from tests.helpers import make_person

GROUP = {"name": "CSCA08 Study Group", "description": "Weekly problem sets.", "tags": ["Coding", "Study", "Coding"]}


def soon(hours=24):
    return (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat()


def event(**changes):
    return {"title": "Board game night", "starts_at": soon(), "location": "Student Centre", **changes}


def test_create_join_and_leave_a_group(database, client):
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")

    created = client.post("/api/groups", json=GROUP, headers=a[0])
    assert created.status_code == 201
    group = created.json()
    assert group["tags"] == ["Coding", "Study"]
    assert group["is_member"] and group["is_owner"] and group["member_count"] == 1

    joined = client.post(f"/api/groups/{group['id']}/join", headers=b[0]).json()
    assert joined["member_count"] == 2 and joined["is_member"]
    assert [m["name"] for m in joined["members"]] == ["Amira Khan", "Tariq Aziz"]
    assert client.post(f"/api/groups/{group['id']}/join", headers=b[0]).status_code == 409
    assert client.get("/api/notifications", headers=a[0]).json()["items"][0]["kind"] == "group_join"

    left = client.post(f"/api/groups/{group['id']}/leave", headers=b[0]).json()
    assert left["member_count"] == 1 and not left["is_member"]
    assert client.post(f"/api/groups/{group['id']}/leave", headers=b[0]).status_code == 404
    assert client.post("/api/groups/99999/join", headers=b[0]).status_code == 404


def test_group_list_search_and_mine(database, client):
    a = make_person(client, "Amira Khan")
    client.post("/api/groups", json=GROUP, headers=a[0])
    client.post("/api/groups", json={"name": "Hiking Club", "tags": ["Hiking"]}, headers=make_person(client, "B")[0])

    assert [g["name"] for g in client.get("/api/groups?q=hik", headers=a[0]).json()] == ["Hiking Club"]
    assert [g["name"] for g in client.get("/api/groups?tag=coding", headers=a[0]).json()] == ["CSCA08 Study Group"]
    assert [g["name"] for g in client.get("/api/groups?mine=true", headers=a[0]).json()] == ["CSCA08 Study Group"]


@pytest.mark.parametrize("bad", [{"name": "ab"}, {"name": "x" * 61}, {"tags": ["x"] * 7}, {"owner": 5}])
def test_group_validation(database, client, bad):
    a = make_person(client)
    assert client.post("/api/groups", json={**GROUP, **bad}, headers=a[0]).status_code == 422


def test_group_discussion_is_for_members(database, client):
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")
    group_id = client.post("/api/groups", json=GROUP, headers=a[0]).json()["id"]

    assert client.post(f"/api/groups/{group_id}/posts", json={"body": "Hi"}, headers=b[0]).status_code == 403
    assert client.get(f"/api/groups/{group_id}/posts", headers=b[0]).status_code == 403

    assert client.post(f"/api/groups/{group_id}/posts", json={"body": "Welcome!"}, headers=a[0]).status_code == 201
    client.post(f"/api/groups/{group_id}/join", headers=b[0])
    posts = client.get(f"/api/groups/{group_id}/posts", headers=b[0]).json()
    assert [(p["author"]["name"], p["body"], p["mine"]) for p in posts] == [("Amira Khan", "Welcome!", False)]


def test_create_event_and_change_rsvp(database, client):
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")

    created = client.post("/api/events", json=event(), headers=a[0])
    assert created.status_code == 201
    ev = created.json()
    assert ev["going_count"] == 1 and ev["is_going"] and ev["is_organiser"]

    going = client.post(f"/api/events/{ev['id']}/rsvp", headers=b[0]).json()
    assert going["going_count"] == 2 and going["is_going"]
    assert client.post(f"/api/events/{ev['id']}/rsvp", headers=b[0]).status_code == 409
    assert client.get("/api/notifications", headers=a[0]).json()["items"][0]["kind"] == "event_rsvp"

    not_going = client.delete(f"/api/events/{ev['id']}/rsvp", headers=b[0]).json()
    assert not_going["going_count"] == 1 and not not_going["is_going"]
    assert client.delete(f"/api/events/{ev['id']}/rsvp", headers=b[0]).status_code == 404

    listed = client.get("/api/events", headers=b[0]).json()
    assert [(e["title"], e["going_count"]) for e in listed] == [("Board game night", 1)]


def test_event_times_keep_their_time_zone(database, client):
    a = make_person(client)
    toronto_time = (datetime.now(timezone(timedelta(hours=-4))) + timedelta(days=2)).replace(microsecond=0)
    ev = client.post("/api/events", json=event(starts_at=toronto_time.isoformat()), headers=a[0]).json()
    assert datetime.fromisoformat(ev["starts_at"]) == toronto_time


@pytest.mark.parametrize(
    "bad, message",
    [
        ({"starts_at": soon(-2)}, "past"),
        ({"starts_at": soon(24 * 400)}, "one year"),
        ({"ends_at": soon(23)}, "after the start"),
        ({"ends_at": soon(24 + 30)}, "24 hours"),
        ({"location": "", "online_url": ""}, "location or an online link"),
    ],
)
def test_event_validation_explains_the_problem(database, client, bad, message):
    a = make_person(client)
    response = client.post("/api/events", json=event(**bad), headers=a[0])
    assert response.status_code == 422
    assert message in response.json()["detail"]


@pytest.mark.parametrize("bad", [{"starts_at": "2030-01-01T18:00:00"}, {"online_url": "javascript:alert(1)"},
                                 {"title": "ab"}, {"starts_at": "next tuesday"}])
def test_event_input_format_errors(database, client, bad):
    a = make_person(client)
    assert client.post("/api/events", json=event(**bad), headers=a[0]).status_code == 422


def test_group_events_need_membership_and_notify_members(database, client):
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")
    outsider = make_person(client, "Outsider")
    group_id = client.post("/api/groups", json=GROUP, headers=a[0]).json()["id"]
    client.post(f"/api/groups/{group_id}/join", headers=b[0])

    assert client.post("/api/events", json=event(group_id=group_id), headers=outsider[0]).status_code == 403
    assert client.post("/api/events", json=event(group_id=99999), headers=a[0]).status_code == 404

    ev = client.post("/api/events", json=event(group_id=group_id), headers=a[0]).json()
    assert ev["group"]["name"] == "CSCA08 Study Group"
    assert client.get("/api/notifications", headers=b[0]).json()["items"][0]["kind"] == "group_event"
    assert [e["title"] for e in client.get(f"/api/groups/{group_id}", headers=b[0]).json()["events"]] == [
        "Board game night"
    ]
    assert len(client.get(f"/api/events?group_id={group_id}", headers=b[0]).json()) == 1


def test_online_events_and_past_events(database, client):
    a = make_person(client)
    online = client.post("/api/events", json=event(location="", online_url="https://meet.example.com/abc"),
                         headers=a[0])
    assert online.status_code == 201
    assert client.get("/api/events?when=past", headers=a[0]).json() == []
    assert client.get("/api/events/99999", headers=a[0]).status_code == 404
