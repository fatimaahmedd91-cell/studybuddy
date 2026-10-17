"""Discover, match scores, and the whole friend request journey."""

from app import auth

from tests.helpers import befriend, make_person, signup


def test_discover_lists_other_people_best_match_first(database, client):
    me = make_person(client, "Amira Khan")
    make_person(client, "Close Match")  # same profile as Amira
    make_person(client, "Far Match", interests=["Opera"], looking_for=["Gaming"], university="York University",
                availability={"Sun": ["morning"]})
    signup(client, "Not Finished")  # no profile yet, so hidden

    people = client.get("/api/people", headers=me[0]).json()["people"]

    assert [p["name"] for p in people] == ["Close Match", "Far Match"]
    assert people[0]["match"]["score"] > people[1]["match"]["score"]
    assert "You both like Coding, Cafes and Anime" in people[0]["match"]["reasons"]
    assert all("email" not in p for p in people)


def test_match_score_follows_the_rules(database, client):
    me = make_person(client, "A", interests=["Chess"], looking_for=["Gaming"], university="UTSC",
                     availability={"Mon": ["morning", "evening"]})
    other = make_person(client, "B", interests=["chess", "Art"], looking_for=["Gaming", "Study buddy"],
                        university="utsc", availability={"Mon": ["morning"]})
    match = client.get(f"/api/people/{other[1]['id']}", headers=me[0]).json()["match"]
    # 1 interest (10) + 1 goal (10) + same university (15) + 1 shared slot (5)
    assert match["score"] == 40
    assert match["shared_interests"] == ["chess"]
    assert match["overlap"] == [{"day": "Mon", "slot": "morning"}]


def test_discover_filters(database, client):
    me = make_person(client, "Amira Khan")
    make_person(client, "York Gamer", university="York University", interests=["Gaming"], looking_for=["Gaming"],
                availability={"Sun": ["evening"]})
    make_person(client, "UTSC Coder")

    def names(query):
        return [p["name"] for p in client.get(f"/api/people?{query}", headers=me[0]).json()["people"]]

    assert names("university=york university") == ["York Gamer"]
    assert names("interest=gaming") == ["York Gamer"]
    assert names("goal=Study buddy") == ["UTSC Coder"]
    assert names("free_together=true") == ["UTSC Coder"]
    assert names("q=coder") == ["UTSC Coder"]


def test_unknown_people_are_404(database, client):
    me = make_person(client)
    hidden = signup(client, "Not Finished")
    assert client.get("/api/people/99999", headers=me[0]).status_code == 404
    assert client.get(f"/api/people/{hidden[1]['id']}", headers=me[0]).status_code == 404


def test_full_friend_request_journey(database, client):
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")

    sent = client.post("/api/friends/requests", json={"user_id": b[1]["id"]}, headers=a[0])
    assert sent.status_code == 201
    request_id = sent.json()["request_id"]

    # Both sides see the pending request.
    assert client.get(f"/api/people/{b[1]['id']}", headers=a[0]).json()["relationship"]["status"] == "outgoing"
    assert client.get(f"/api/people/{a[1]['id']}", headers=b[0]).json()["relationship"]["status"] == "incoming"
    assert client.get("/api/friends", headers=b[0]).json()["incoming"][0]["person"]["name"] == "Amira Khan"

    # B got a notification.
    notes = client.get("/api/notifications", headers=b[0]).json()
    assert notes["unread_count"] == 1 and notes["items"][0]["kind"] == "friend_request"

    assert client.post(f"/api/friends/requests/{request_id}/accept", headers=b[0]).status_code == 200
    assert client.get("/api/notifications", headers=b[0]).json()["unread_count"] == 0

    # Now both are friends, and A was notified.
    assert client.get("/api/friends", headers=a[0]).json()["friends"][0]["person"]["name"] == "Tariq Aziz"
    assert client.get("/api/friends", headers=b[0]).json()["friends"][0]["person"]["name"] == "Amira Khan"
    assert client.get("/api/notifications", headers=a[0]).json()["items"][0]["kind"] == "friend_accepted"


def test_no_duplicate_requests_and_no_request_to_yourself(database, client):
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")
    assert client.post("/api/friends/requests", json={"user_id": a[1]["id"]}, headers=a[0]).status_code == 400
    assert client.post("/api/friends/requests", json={"user_id": b[1]["id"]}, headers=a[0]).status_code == 201
    assert client.post("/api/friends/requests", json={"user_id": b[1]["id"]}, headers=a[0]).status_code == 409
    assert client.post("/api/friends/requests", json={"user_id": 99999}, headers=a[0]).status_code == 404


def test_requesting_someone_who_already_asked_you_accepts_it(database, client):
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")
    client.post("/api/friends/requests", json={"user_id": b[1]["id"]}, headers=a[0])
    response = client.post("/api/friends/requests", json={"user_id": a[1]["id"]}, headers=b[0])
    assert response.json()["status"] == "friends"
    assert client.post("/api/friends/requests", json={"user_id": a[1]["id"]}, headers=b[0]).status_code == 409


def test_only_the_receiver_can_accept_or_decline(database, client):
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")
    stranger = make_person(client, "Stranger")
    request_id = client.post("/api/friends/requests", json={"user_id": b[1]["id"]}, headers=a[0]).json()["request_id"]

    for who in (a, stranger):
        assert client.post(f"/api/friends/requests/{request_id}/accept", headers=who[0]).status_code == 404
        assert client.post(f"/api/friends/requests/{request_id}/decline", headers=who[0]).status_code == 404
    # Only the sender can cancel.
    assert client.delete(f"/api/friends/requests/{request_id}", headers=b[0]).status_code == 404


def test_decline_and_cancel_remove_the_request(database, client):
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")
    first = client.post("/api/friends/requests", json={"user_id": b[1]["id"]}, headers=a[0]).json()["request_id"]
    assert client.post(f"/api/friends/requests/{first}/decline", headers=b[0]).status_code == 200
    assert client.get("/api/friends", headers=a[0]).json()["outgoing"] == []

    second = client.post("/api/friends/requests", json={"user_id": b[1]["id"]}, headers=a[0]).json()["request_id"]
    assert client.delete(f"/api/friends/requests/{second}", headers=a[0]).status_code == 200
    assert client.get("/api/friends", headers=b[0]).json()["incoming"] == []
    # Answered and cancelled requests leave nothing unread in the bell.
    assert client.get("/api/notifications", headers=b[0]).json()["unread_count"] == 0


def test_removing_a_friend(database, client):
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")
    befriend(client, a, b)
    assert client.delete(f"/api/friends/{a[1]['id']}", headers=b[0]).status_code == 200
    assert client.get("/api/friends", headers=a[0]).json()["friends"] == []
    assert client.delete(f"/api/friends/{a[1]['id']}", headers=b[0]).status_code == 404


def test_friend_requests_are_rate_limited(database, client, monkeypatch):
    monkeypatch.setattr(auth.signup_limit, "limit", 1000)  # this test needs many accounts
    a = make_person(client, "Amira Khan")
    others = [make_person(client, f"Person {i}") for i in range(31)]
    codes = [client.post("/api/friends/requests", json={"user_id": o[1]["id"]}, headers=a[0]).status_code
             for o in others]
    assert codes[:30] == [201] * 30 and codes[30] == 429
