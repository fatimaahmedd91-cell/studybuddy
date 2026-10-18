"""Small helpers that make test accounts through the real API."""

import itertools

_counter = itertools.count(1)

FULL_PROFILE = {
    "pronouns": "she/her",
    "age": 19,
    "university": "UofT Scarborough",
    "hook": "Will trade flashcards for bubble tea.",
    "bio": "Second-year CS.",
    "interests": ["Coding", "Cafes", "Anime"],
    "looking_for": ["Study buddy"],
    "availability": {"Tue": ["afternoon"], "Thu": ["evening"]},
}


def signup(client, name="Amira Khan", email=None, password="bubble-tea-42"):
    """Creates an account and returns (auth headers, user)."""
    email = email or f"person{next(_counter)}@example.com"
    response = client.post(
        "/api/auth/signup", json={"email": email, "password": password, "name": name, "accept_terms": True}
    )
    assert response.status_code == 201, response.text
    body = response.json()
    return {"Authorization": f"Bearer {body['access_token']}"}, body["user"]


def make_person(client, name="Amira Khan", **profile):
    """Creates an account with a finished profile (so it shows up in Discover). Returns (headers, user)."""
    headers, _ = signup(client, name)
    response = client.patch("/api/me", json={**FULL_PROFILE, **profile}, headers=headers)
    assert response.status_code == 200, response.text
    user = response.json()
    assert user["onboarded"] is True
    return headers, user


def befriend(client, a, b):
    """Makes two people friends. a and b are (headers, user) pairs."""
    sent = client.post("/api/friends/requests", json={"user_id": b[1]["id"]}, headers=a[0])
    assert sent.status_code == 201, sent.text
    accepted = client.post(f"/api/friends/requests/{sent.json()['request_id']}/accept", headers=b[0])
    assert accepted.status_code == 200, accepted.text
