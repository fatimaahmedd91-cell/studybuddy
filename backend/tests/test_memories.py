"""Memories: audiences, blocking, signed photo links, editing, reactions, comments and reports."""

import pytest

from app import db, memories
from tests.helpers import befriend, make_person
from tests.test_profiles import TINY_JPEG, data_url


def post(client, person, caption="A good day", audience="friends", photos=()):
    response = client.post(
        "/api/memories", json={"caption": caption, "audience": audience, "photos": list(photos)}, headers=person[0]
    )
    assert response.status_code == 201, response.text
    return response.json()


def visible_ids(client, person, **params):
    return [m["id"] for m in client.get("/api/memories", params=params, headers=person[0]).json()["memories"]]


def run(sql, params=()):
    with db.get_connection() as conn, conn.cursor() as cur:
        cur.execute(sql, params)


@pytest.fixture
def trio(database, client):
    """Amira (the author), her friend Daniel, and Lena, who isn't friends with either."""
    amira = make_person(client, "Amira Khan")
    daniel = make_person(client, "Daniel Osei")
    lena = make_person(client, "Lena Petrova")
    befriend(client, amira, daniel)
    return amira, daniel, lena


# ---------- Who can see what ----------


def test_audiences_decide_who_sees_a_memory(client, trio):
    amira, daniel, lena = trio
    friends = post(client, amira, "friends only")
    everyone = post(client, amira, "for everyone", audience="everyone")
    only_me = post(client, amira, "just for me", audience="only_me")
    assert friends["audience"] == "friends" and friends["mine"] is True

    assert visible_ids(client, amira) == [only_me["id"], everyone["id"], friends["id"]]
    assert visible_ids(client, daniel) == [everyone["id"], friends["id"]]
    assert visible_ids(client, lena) == [everyone["id"]]

    assert client.get(f"/api/memories/{friends['id']}", headers=lena[0]).status_code == 404
    assert client.get(f"/api/memories/{only_me['id']}", headers=daniel[0]).status_code == 404
    seen = client.get(f"/api/memories/{friends['id']}", headers=daniel[0]).json()
    assert seen["mine"] is False and seen["author"]["name"] == "Amira Khan"


def test_the_default_audience_is_friends(client, trio):
    amira, _, lena = trio
    response = client.post("/api/memories", json={"caption": "no audience given"}, headers=amira[0])
    assert response.json()["audience"] == "friends"
    assert visible_ids(client, lena) == []


def test_blocking_hides_memories_comments_and_reactions_both_ways(client, trio):
    amira, daniel, lena = trio
    memory = post(client, amira, "for everyone", audience="everyone", photos=[data_url(TINY_JPEG)])
    lenas = post(client, lena, "Lena's memory", audience="everyone")
    client.post(f"/api/memories/{lenas['id']}/comments", json={"body": "Nice one from Daniel"}, headers=daniel[0])

    client.post("/api/blocks", json={"user_id": daniel[1]["id"]}, headers=amira[0])

    # Daniel (blocked) can't find Amira's memory, its comments, its reaction button or its photos.
    assert memory["id"] not in visible_ids(client, daniel)
    for method, path in (("GET", ""), ("GET", "/comments"), ("POST", "/reaction"), ("POST", "/comments")):
        response = client.request(method, f"/api/memories/{memory['id']}{path}", json={"body": "hi"}, headers=daniel[0])
        assert response.status_code == 404, path
    # And Amira (the blocker) no longer sees Daniel's comment on Lena's memory.
    comments = client.get(f"/api/memories/{lenas['id']}/comments", headers=amira[0]).json()
    assert comments == []
    assert client.get(f"/api/memories/{lenas['id']}", headers=amira[0]).json()["comment_count"] == 0
    assert len(client.get(f"/api/memories/{lenas['id']}/comments", headers=lena[0]).json()) == 1


def test_memories_of_suspended_accounts_are_hidden(client, trio):
    amira, daniel, _ = trio
    memory = post(client, amira, audience="everyone")
    run("UPDATE users SET suspended_at = now() WHERE id = %s", (amira[1]["id"],))
    assert memory["id"] not in visible_ids(client, daniel)
    assert client.get(f"/api/memories/{memory['id']}", headers=daniel[0]).status_code == 404


# ---------- Photos ----------


def test_photos_are_only_sent_through_signed_links(client, trio):
    amira, daniel, lena = trio
    memory = post(client, amira, photos=[data_url(TINY_JPEG), data_url(TINY_JPEG)])
    assert len(memory["photos"]) == 2
    url = client.get(f"/api/memories/{memory['id']}", headers=daniel[0]).json()["photos"][0]["url"]
    assert url.startswith("/api/memory-photos/") and "sig=" in url and "exp=" in url

    # The friend can load it (no login token needed for <img> tags), without camera/location details.
    photo = client.get(url)
    assert photo.status_code == 200 and photo.headers["content-type"] == "image/jpeg"
    assert photo.headers["cache-control"].startswith("private")
    assert b"GPS" not in photo.content

    # Lena (not a friend) never receives a link.
    assert client.get(f"/api/memories/{memory['id']}", headers=lena[0]).status_code == 404

    # Changing any part of the link breaks it.
    path, query = url.split("?")
    exp, sig = (part.split("=")[1] for part in query.split("&"))
    assert client.get(f"{path}?exp={exp}&sig={'0' * 64}").status_code == 403
    assert client.get(f"{path}?exp={int(exp) + 600}&sig={sig}").status_code == 403
    assert client.get(path).status_code == 403
    other_photo = memory["photos"][1]["url"].split("?")[0]
    assert client.get(f"{other_photo}?exp={exp}&sig={sig}").status_code == 403


def test_photo_links_expire(client, trio, monkeypatch):
    amira, _, _ = trio
    url = post(client, amira, photos=[data_url(TINY_JPEG)])["photos"][0]["url"]
    real_time = memories.current_time()
    monkeypatch.setattr(memories, "current_time", lambda: real_time + 2 * 3600)
    assert client.get(url).status_code == 403


def test_photos_of_removed_memories_stop_working(client, trio):
    amira, daniel, _ = trio
    memory = post(client, amira, photos=[data_url(TINY_JPEG)])
    url = memory["photos"][0]["url"]
    run("UPDATE memories SET removed_at = now() WHERE id = %s", (memory["id"],))
    assert client.get(url).status_code == 404
    assert client.get(f"/api/memories/{memory['id']}", headers=amira[0]).status_code == 404
    assert memory["id"] not in visible_ids(client, daniel)


@pytest.mark.parametrize("photos", [
    ["data:image/png;base64,iVBORw0KGgo="],
    ["data:image/jpeg;base64,not-base64!!"],
    ["data:image/jpeg;base64,AAAA"],  # decodes, but isn't a JPEG
])
def test_uploads_must_be_real_jpegs(client, trio, photos):
    amira, _, _ = trio
    response = client.post("/api/memories", json={"caption": "x", "photos": photos}, headers=amira[0])
    assert response.status_code == 422
    assert visible_ids(client, amira) == []  # nothing half-saved


def test_upload_limits(client, trio, monkeypatch):
    amira, _, _ = trio
    five = [data_url(TINY_JPEG)] * 5
    assert client.post("/api/memories", json={"caption": "x", "photos": five}, headers=amira[0]).status_code == 422
    assert client.post("/api/memories", json={"caption": "   "}, headers=amira[0]).status_code == 422
    assert client.post("/api/memories", json={"caption": "x", "audience": "public"}, headers=amira[0]).status_code == 422
    assert client.post("/api/memories", json={"caption": "x" * 1001}, headers=amira[0]).status_code == 422
    monkeypatch.setattr(memories, "MAX_PHOTO_BYTES", 10)
    big = client.post("/api/memories", json={"photos": [data_url(TINY_JPEG)]}, headers=amira[0])
    assert big.status_code == 413
    # A photo with no caption is fine.
    monkeypatch.setattr(memories, "MAX_PHOTO_BYTES", 2 * 1024 * 1024)
    assert client.post("/api/memories", json={"photos": [data_url(TINY_JPEG)]}, headers=amira[0]).status_code == 201


# ---------- Editing and deleting ----------


def test_only_the_author_can_edit_or_delete(client, trio):
    amira, daniel, _ = trio
    memory = post(client, amira, "original", audience="everyone")
    assert client.patch(f"/api/memories/{memory['id']}", json={"caption": "hacked"}, headers=daniel[0]).status_code == 404
    assert client.delete(f"/api/memories/{memory['id']}", headers=daniel[0]).status_code == 404
    still = client.get(f"/api/memories/{memory['id']}", headers=amira[0]).json()
    assert still["caption"] == "original" and still["edited"] is False

    edited = client.patch(f"/api/memories/{memory['id']}", json={"caption": "better caption"}, headers=amira[0]).json()
    assert edited["caption"] == "better caption" and edited["audience"] == "everyone"
    client.patch(f"/api/memories/{memory['id']}", json={"audience": "only_me"}, headers=amira[0])
    assert client.get(f"/api/memories/{memory['id']}", headers=daniel[0]).status_code == 404

    # Without photos, the caption can't be emptied.
    assert client.patch(f"/api/memories/{memory['id']}", json={"caption": ""}, headers=amira[0]).status_code == 422

    assert client.delete(f"/api/memories/{memory['id']}", headers=amira[0]).json() == {"deleted": True}
    assert client.get(f"/api/memories/{memory['id']}", headers=amira[0]).status_code == 404


def test_edited_flag_appears_after_a_change(client, trio):
    amira, _, _ = trio
    memory = post(client, amira)
    run("UPDATE memories SET created_at = created_at - interval '1 minute', updated_at = updated_at - interval '1 minute'"
        " WHERE id = %s", (memory["id"],))
    edited = client.patch(f"/api/memories/{memory['id']}", json={"caption": "new"}, headers=amira[0]).json()
    assert edited["edited"] is True


# ---------- Pages ----------


def test_the_feed_comes_in_pages_of_ten(client, trio):
    amira, daniel, _ = trio
    made = [post(client, amira, f"memory {i}")["id"] for i in range(12)]
    post(client, daniel, "Daniel's")
    first = client.get("/api/memories", params={"author_id": amira[1]["id"]}, headers=daniel[0]).json()
    assert [m["id"] for m in first["memories"]] == list(reversed(made))[:10]
    assert first["next_before_id"] == made[2]
    second = client.get("/api/memories", params={"author_id": amira[1]["id"], "before_id": first["next_before_id"]},
                        headers=daniel[0]).json()
    assert [m["id"] for m in second["memories"]] == [made[1], made[0]]
    assert second["next_before_id"] is None


# ---------- Reactions and comments ----------


def test_reactions_toggle_and_notify_only_once(client, trio):
    amira, daniel, _ = trio
    memory = post(client, amira)
    first = client.post(f"/api/memories/{memory['id']}/reaction", headers=daniel[0]).json()
    assert first == {"reaction_count": 1, "reacted_by_me": True}
    assert client.post(f"/api/memories/{memory['id']}/reaction", headers=daniel[0]).json()["reaction_count"] == 1
    assert client.delete(f"/api/memories/{memory['id']}/reaction", headers=daniel[0]).json() == {
        "reaction_count": 0, "reacted_by_me": False}
    client.post(f"/api/memories/{memory['id']}/reaction", headers=daniel[0])
    client.post(f"/api/memories/{memory['id']}/reaction", headers=amira[0])  # your own ❤️ notifies nobody

    kinds = [n["kind"] for n in client.get("/api/notifications", headers=amira[0]).json()["items"]]
    assert kinds.count("memory_reaction") == 1
    seen = client.get(f"/api/memories/{memory['id']}", headers=daniel[0]).json()
    assert seen["reaction_count"] == 2 and seen["reacted_by_me"] is True


def test_comments_and_who_can_delete_them(client, trio):
    amira, daniel, lena = trio
    friends_only = post(client, amira)
    assert client.post(f"/api/memories/{friends_only['id']}/comments", json={"body": "hi"}, headers=lena[0]).status_code == 404

    public = post(client, amira, audience="everyone")
    by_daniel = client.post(f"/api/memories/{public['id']}/comments", json={"body": "Love this"}, headers=daniel[0])
    assert by_daniel.status_code == 201 and by_daniel.json()["mine"] is True
    by_lena = client.post(f"/api/memories/{public['id']}/comments", json={"body": "Same!"}, headers=lena[0]).json()
    assert client.post(f"/api/memories/{public['id']}/comments", json={"body": "  "}, headers=lena[0]).status_code == 422

    texts = [n["text"] for n in client.get("/api/notifications", headers=amira[0]).json()["items"]]
    assert "Daniel Osei commented on your memory" in texts

    listed = client.get(f"/api/memories/{public['id']}/comments", headers=lena[0]).json()
    assert [(c["body"], c["can_delete"]) for c in listed] == [("Love this", False), ("Same!", True)]
    # Lena can't delete Daniel's comment; Amira (the memory's author) can delete Lena's.
    daniel_comment = by_daniel.json()["id"]
    assert client.delete(f"/api/memories/{public['id']}/comments/{daniel_comment}", headers=lena[0]).status_code == 404
    assert client.delete(f"/api/memories/{public['id']}/comments/{by_lena['id']}", headers=amira[0]).status_code == 200
    assert client.delete(f"/api/memories/{public['id']}/comments/{daniel_comment}", headers=daniel[0]).status_code == 200
    assert client.get(f"/api/memories/{public['id']}", headers=amira[0]).json()["comment_count"] == 0


# ---------- Reports and account deletion ----------


def test_only_visible_memories_can_be_reported(client, trio):
    amira, daniel, lena = trio
    memory = post(client, amira)
    report = {"target_type": "memory", "target_id": memory["id"], "reason": "spam"}
    assert client.post("/api/reports", json=report, headers=daniel[0]).status_code == 201
    assert client.post("/api/reports", json=report, headers=lena[0]).status_code == 404
    assert client.post("/api/reports", json=report, headers=amira[0]).status_code == 400  # your own


def test_deleting_an_account_deletes_its_memories(client, trio):
    amira, daniel, _ = trio
    memory = post(client, amira, photos=[data_url(TINY_JPEG)])
    client.post(f"/api/memories/{memory['id']}/comments", json={"body": "hi"}, headers=daniel[0])
    assert client.request("DELETE", "/api/me", json={"confirm": "DELETE"}, headers=amira[0]).status_code == 200
    with db.get_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT (SELECT count(*) FROM memories) + (SELECT count(*) FROM memory_photos)"
                    " + (SELECT count(*) FROM memory_comments) AS n")
        assert cur.fetchone()["n"] == 0
