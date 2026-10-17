"""Direct messages: friends only, saved, and marked read."""

from tests.helpers import befriend, make_person


def test_only_friends_can_message(database, client):
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")
    assert client.post(f"/api/messages/{b[1]['id']}", json={"body": "Hi"}, headers=a[0]).status_code == 403
    assert client.get(f"/api/messages/{b[1]['id']}", headers=a[0]).status_code == 403
    assert client.get("/api/messages/99999", headers=a[0]).status_code == 404


def test_messages_are_saved_and_delivered(database, client):
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")
    befriend(client, a, b)

    first = client.post(f"/api/messages/{b[1]['id']}", json={"body": "  Want to study Tuesday?  "}, headers=a[0])
    assert first.status_code == 201 and first.json()["body"] == "Want to study Tuesday?"
    client.post(f"/api/messages/{b[1]['id']}", json={"body": "Library room 2"}, headers=a[0])

    # B has one unread conversation and one "new message" notification (not one per message).
    conversations = client.get("/api/conversations", headers=b[0]).json()
    assert conversations[0]["unread"] == 2
    notes = client.get("/api/notifications", headers=b[0]).json()["items"]
    assert sum(1 for n in notes if n["kind"] == "message") == 1

    thread = client.get(f"/api/messages/{a[1]['id']}", headers=b[0]).json()
    assert [m["body"] for m in thread["messages"]] == ["Want to study Tuesday?", "Library room 2"]
    assert [m["from_me"] for m in thread["messages"]] == [False, False]
    assert client.get("/api/conversations", headers=b[0]).json()[0]["unread"] == 0

    newer = client.get(f"/api/messages/{a[1]['id']}?after_id={first.json()['id']}", headers=b[0]).json()
    assert [m["body"] for m in newer["messages"]] == ["Library room 2"]


def test_empty_or_huge_messages_are_refused(database, client):
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")
    befriend(client, a, b)
    for body in ["   ", "x" * 1001]:
        assert client.post(f"/api/messages/{b[1]['id']}", json={"body": body}, headers=a[0]).status_code == 422


def test_removed_friends_can_no_longer_message(database, client):
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")
    befriend(client, a, b)
    client.delete(f"/api/friends/{b[1]['id']}", headers=a[0])
    assert client.post(f"/api/messages/{b[1]['id']}", json={"body": "Hi"}, headers=a[0]).status_code == 403
