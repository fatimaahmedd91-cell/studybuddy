"""Planning: shared free times with private schedules kept private, suggestions, meeting area, invitations."""

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import httpx

from app import config, db, planning
from app.ai import GeminiUnavailable
from tests.helpers import befriend, make_person

SECRET = {"title": "Secret therapy appointment", "kind": "other", "location": "123 Private Street",
          "recurrence": "weekly", "weekday": 1, "start_date": "2026-01-01", "start_time": "13:00", "end_time": "14:00"}


def next_tuesday():
    """A Tuesday at least two days away, so 'now' never cuts into the test's slots."""
    today = datetime.now(ZoneInfo("America/Toronto")).date()
    day = today + timedelta(days=2)
    while day.weekday() != 1:
        day += timedelta(days=1)
    return day


def plan(client, headers, *, friends=None, group=None, day=None, duration=60, **extra):
    day = day or next_tuesday()
    body = {"start_date": day.isoformat(), "end_date": day.isoformat(), "duration_minutes": duration, **extra}
    body.update({"friend_ids": friends} if friends else {"group_id": group})
    return client.post("/api/planning/slots", json=body, headers=headers)


def hours(response):
    """Slots as ('HH:MM', 'HH:MM') in Toronto time."""
    zone = ZoneInfo("America/Toronto")
    return [(datetime.fromisoformat(s["start"]).astimezone(zone).strftime("%H:%M"),
             datetime.fromisoformat(s["end"]).astimezone(zone).strftime("%H:%M")) for s in response.json()["slots"]]


def pair(client):
    a = make_person(client, "Amira Khan")  # free Tue afternoon (12:00-17:00)
    b = make_person(client, "Tariq Aziz")  # same
    befriend(client, a, b)
    return a, b


def run(sql, params=()):
    with db.get_connection() as conn, conn.cursor() as cur:
        cur.execute(sql, params)


# ---------- Free slots and permissions ----------


def test_without_permission_only_public_times_are_used_and_nothing_private_leaks(database, client):
    a, b = pair(client)
    client.post("/api/commitments", json=SECRET, headers=b[0])
    response = plan(client, a[0], friends=[b[1]["id"]])
    assert response.status_code == 200
    assert hours(response) == [("12:00", "17:00")]  # B's commitment is NOT used: no permission
    status = response.json()["participants"][0]
    assert status["status"] == "public_only" and status["person"]["id"] == b[1]["id"]
    assert "Secret" not in response.text and "Private Street" not in response.text


def test_with_permission_commitments_and_buffers_are_subtracted(database, client):
    a, b = pair(client)
    client.post("/api/commitments", json=SECRET, headers=b[0])
    assert client.put("/api/planning/consents", json={"scope": "friends"}, headers=b[0]).json()["friends"] is True
    response = plan(client, a[0], friends=[b[1]["id"]])
    # Busy 13:00-14:00 plus a 15-minute buffer each side: 12:00-12:45 is too short for an hour.
    assert hours(response) == [("14:15", "17:00")]
    assert response.json()["participants"][0]["status"] == "included"
    assert "Secret" not in response.text and "Private Street" not in response.text
    assert hours(plan(client, a[0], friends=[b[1]["id"]], duration=30)) == [("12:00", "12:45"), ("14:15", "17:00")]


def test_my_own_commitments_always_count(database, client):
    a, b = pair(client)
    client.post("/api/commitments", json={**SECRET, "start_time": "15:00", "end_time": "16:00"}, headers=a[0])
    client.patch("/api/me/schedule-settings", json={"buffer_minutes": 0}, headers=a[0])
    assert hours(plan(client, a[0], friends=[b[1]["id"]])) == [("12:00", "15:00"), ("16:00", "17:00")]


def test_availability_audience_is_respected(database, client):
    a, b = pair(client)
    client.patch("/api/me", json={"availability_audience": "nobody"}, headers=b[0])
    response = plan(client, a[0], friends=[b[1]["id"]])
    assert response.json()["participants"][0]["status"] == "no_availability"
    assert response.json()["slots"] == [] and response.json()["message"]
    # Allowing the private schedule (without public times) counts them as free 8:00-22:00 apart from commitments.
    client.post("/api/commitments", json=SECRET, headers=b[0])
    client.put("/api/planning/consents", json={"scope": "friends"}, headers=b[0])
    assert hours(plan(client, a[0], friends=[b[1]["id"]])) == [("14:15", "17:00")]


def test_other_time_zones_line_up(database, client):
    a = make_person(client, "Amira Khan", availability={"Tue": ["afternoon", "evening"]})  # 12:00-22:00 Toronto
    b = make_person(client, "Tariq Aziz", timezone="America/Vancouver")                    # 12:00-17:00 Vancouver
    befriend(client, a, b)
    # Vancouver afternoon is 15:00-20:00 in Toronto.
    assert hours(plan(client, a[0], friends=[b[1]["id"]])) == [("15:00", "20:00")]


def test_only_friends_can_be_planned_with(database, client):
    a, b = pair(client)
    c = make_person(client, "Lena Petrova")
    assert plan(client, a[0], friends=[c[1]["id"]]).status_code == 403
    client.post("/api/blocks", json={"user_id": b[1]["id"]}, headers=a[0])
    assert plan(client, a[0], friends=[b[1]["id"]]).status_code == 403
    assert plan(client, c[0], friends=[a[1]["id"]]).status_code == 403


def test_plan_limits(database, client):
    a, b = pair(client)
    day = next_tuesday()
    too_long = {"friend_ids": [b[1]["id"]], "start_date": day.isoformat(),
                "end_date": (day + timedelta(days=14)).isoformat(), "duration_minutes": 60}
    assert client.post("/api/planning/slots", json=too_long, headers=a[0]).status_code == 422
    backwards = {**too_long, "end_date": (day - timedelta(days=1)).isoformat()}
    assert client.post("/api/planning/slots", json=backwards, headers=a[0]).status_code == 422
    past = {**too_long, "start_date": "2020-01-01", "end_date": "2020-01-02"}
    assert client.post("/api/planning/slots", json=past, headers=a[0]).status_code == 422
    both = {**too_long, "end_date": day.isoformat(), "group_id": 1}
    assert client.post("/api/planning/slots", json=both, headers=a[0]).status_code == 422
    assert plan(client, a[0], friends=[b[1]["id"]], duration=5).status_code == 422


def test_group_plans_need_group_permission_given_during_membership(database, client):
    a, b = pair(client)
    c = make_person(client, "Lena Petrova")
    group = client.post("/api/groups", json={"name": "Study crew"}, headers=a[0]).json()
    client.post(f"/api/groups/{group['id']}/join", headers=b[0])
    client.post("/api/commitments", json=SECRET, headers=b[0])
    client.put("/api/planning/consents", json={"scope": "friends"}, headers=b[0])

    # A "friends" permission doesn't cover group plans, and joining a group shares nothing.
    response = plan(client, a[0], group=group["id"])
    assert response.json()["participants"][0]["status"] == "public_only"
    assert hours(response) == [("12:00", "17:00")]

    client.put("/api/planning/consents", json={"scope": "group", "group_id": group["id"]}, headers=b[0])
    assert hours(plan(client, a[0], group=group["id"])) == [("14:15", "17:00")]

    # Leaving and joining again needs a new permission.
    run("UPDATE group_members SET joined_at = now() + interval '1 minute' WHERE group_id = %s AND user_id = %s",
        (group["id"], b[1]["id"]))
    assert plan(client, a[0], group=group["id"]).json()["participants"][0]["status"] == "public_only"
    consents = client.get("/api/planning/consents", headers=b[0]).json()
    assert consents["groups"] == [{"id": group["id"], "name": "Study crew", "allowed": False}]

    # Non-members can't plan with (or allow) the group.
    assert plan(client, c[0], group=group["id"]).status_code == 403
    assert client.put("/api/planning/consents", json={"scope": "group", "group_id": group["id"]},
                      headers=c[0]).status_code == 403
    assert client.delete("/api/planning/consents?scope=friends", headers=b[0]).json()["friends"] is False


# ---------- Suggestions ----------


def chosen_slots(response):
    return [{"start": s["start"], "end": s["end"]} for s in response.json()["slots"]]


def suggest(client, headers, friend_id, slots, refresh=False):
    day = next_tuesday().isoformat()
    body = {"friend_ids": [friend_id], "start_date": day, "end_date": day, "duration_minutes": 60,
            "slots": slots, "refresh": refresh}
    return client.post("/api/planning/suggest", json=body, headers=headers)


def allow_ai(client, *people):
    for headers, _ in people:
        client.put("/api/me/consents/ai_features", json={"granted": True}, headers=headers)


def fake_plan(calls, slot_id="S1"):
    def ask(facts):
        calls.append(facts)
        return planning.PlanOut(summary="Tuesday afternoon gives you the most time together.",
                                ranked_slot_ids=[slot_id], activities=[planning.PlanActivity(
                                    title="Code at a cafe", reason="You both like coding and cafes.")],
                                plan_slot_id=slot_id, plan="Code at a cafe on Tuesday afternoon.")
    return ask


def test_suggestions_fall_back_without_ai_consent_or_key(database, client):
    a, b = pair(client)
    slots = chosen_slots(plan(client, a[0], friends=[b[1]["id"]]))
    off = suggest(client, a[0], b[1]["id"], slots).json()
    assert off["source"] == "fallback" and off["fallback_reason"] == "ai_off" and off["plan"]["slot"]["id"] == "S1"
    allow_ai(client, a, b)
    no_key = suggest(client, a[0], b[1]["id"], slots).json()
    assert no_key["source"] == "fallback" and no_key["fallback_reason"] == "not_configured"
    assert no_key["activities"] and no_key["summary"]


def test_gemini_suggestions_are_cached_and_only_see_shared_facts(database, client, monkeypatch):
    calls = []
    monkeypatch.setattr(planning, "ask_gemini_plan", fake_plan(calls))
    a, b = pair(client)
    client.post("/api/commitments", json=SECRET, headers=b[0])
    client.put("/api/planning/consents", json={"scope": "friends"}, headers=b[0])
    allow_ai(client, a, b)
    slots = chosen_slots(plan(client, a[0], friends=[b[1]["id"]]))

    first = suggest(client, a[0], b[1]["id"], slots).json()
    assert first["source"] == "gemini" and first["cached"] is False and first["ranked_slots"][0]["id"] == "S1"
    second = suggest(client, a[0], b[1]["id"], slots).json()
    assert second["cached"] is True and len(calls) == 1 and second["generated_at"] == first["generated_at"]
    refreshed = suggest(client, a[0], b[1]["id"], slots, refresh=True).json()
    assert refreshed["cached"] is False and len(calls) == 2

    sent = str(calls[0])
    assert set(calls[0]) == {"group_size", "shared_interests", "shared_friendship_goals", "slots"}
    for private in ("Amira", "Tariq", "Secret", "Private Street", "@example.com", "UofT"):
        assert private not in sent
    assert calls[0]["shared_interests"] == ["Anime", "Cafes", "Coding"]


def test_gemini_cant_invent_slots(database, client, monkeypatch):
    monkeypatch.setattr(planning, "ask_gemini_plan", fake_plan([], slot_id="S99"))
    a, b = pair(client)
    allow_ai(client, a, b)
    slots = chosen_slots(plan(client, a[0], friends=[b[1]["id"]]))
    result = suggest(client, a[0], b[1]["id"], slots).json()
    assert result["source"] == "fallback" and result["fallback_reason"] == "invalid_response"


def test_slot_ids_in_gemini_text_become_real_times():
    facts = {"slots": [{"id": "S1", "when": "Tue, Oct 20, 12:00 PM – 5:00 PM", "minutes": 300},
                       {"id": "S2", "when": "Sat, Oct 24, 12:00 PM – 5:00 PM", "minutes": 300}]}
    out = planning.PlanOut(summary="S2 is the longest window, and S1 works too.", ranked_slot_ids=["S2", "S1"],
                           activities=[planning.PlanActivity(title="Code at a cafe", reason="You both like coding.")],
                           plan_slot_id="S2", plan="Meet during slot S2 for coding.")
    checked = planning.check_plan(out, facts)
    assert checked.plan == "Meet during Sat, Oct 24, 12:00 PM – 5:00 PM for coding."
    assert "S1" not in checked.summary and "S2" not in checked.summary
    assert checked.ranked_slot_ids == ["S2", "S1"] and checked.plan_slot_id == "S2"


def test_gemini_problems_fall_back(database, client, monkeypatch):
    def broken(facts):
        raise GeminiUnavailable("timeout")

    monkeypatch.setattr(planning, "ask_gemini_plan", broken)
    a, b = pair(client)
    allow_ai(client, a, b)
    slots = chosen_slots(plan(client, a[0], friends=[b[1]["id"]]))
    assert suggest(client, a[0], b[1]["id"], slots).json()["fallback_reason"] == "timeout"


def test_made_up_slots_are_refused(database, client):
    a, b = pair(client)
    day = next_tuesday()
    fake = [{"start": f"{day}T03:00:00-04:00", "end": f"{day}T04:00:00-04:00"}]
    assert suggest(client, a[0], b[1]["id"], fake).status_code == 409


# ---------- Meeting area ----------


def allow_location(client, person):
    client.put("/api/me/consents/location_suggestions", json={"granted": True}, headers=person[0])


def test_meeting_origin_needs_consent_is_rounded_and_private(database, client):
    a, b = pair(client)
    assert client.put("/api/me/meeting-origin", json={"preset": "utsc"}, headers=a[0]).status_code == 403
    allow_location(client, a)
    saved = client.put("/api/me/meeting-origin", json={"lat": 43.661234, "lng": -79.395678}, headers=a[0]).json()
    assert saved["origin"]["lat"] == 43.66 and saved["origin"]["lng"] == -79.4 and saved["origin"]["source"] == "device"
    assert client.put("/api/me/meeting-origin", json={"preset": "nowhere"}, headers=a[0]).status_code == 422
    assert client.get("/api/me/meeting-origin", headers=b[0]).json()["origin"] is None  # B only sees their own
    # Turning location suggestions off deletes the saved area.
    client.put("/api/me/consents/location_suggestions", json={"granted": False}, headers=a[0])
    assert client.get("/api/me/meeting-origin", headers=a[0]).json()["origin"] is None


def area(client, headers, friend_id, **extra):
    return client.post("/api/planning/area", json={"friend_ids": [friend_id], **extra}, headers=headers)


def test_halfway_point_needs_two_areas_and_hides_each_persons_area(database, client):
    a, b = pair(client)
    allow_location(client, a)
    client.put("/api/me/meeting-origin", json={"preset": "uoft_st_george"}, headers=a[0])
    one = area(client, a[0], b[1]["id"]).json()
    assert one["midpoint"] is None and one["used_count"] == 1 and one["notice"]

    allow_location(client, b)
    client.put("/api/me/meeting-origin", json={"preset": "utsc"}, headers=b[0])
    two = area(client, a[0], b[1]["id"])
    body = two.json()
    # The exact middle is (43.72, -79.295). With two people it's rounded to about 5 km, so A can't work back to B's area.
    assert body["midpoint"]["lat"] == 43.7 and body["midpoint"]["lng"] == -79.3
    assert "about 5 km" in body["midpoint"]["label"]
    assert "not based on travel time" in body["midpoint"]["label"]
    # Without a Maps key: plain, clearly labelled search links, and nobody's own area.
    assert body["source"] == "links" and body["venues"] == []
    assert all("not checked by Meerkat" in link["note"] for link in body["links"])
    assert "-79.19" not in two.text and "UofT Scarborough (UTSC)" not in two.text


def test_places_results_are_passed_through_without_invented_details(database, client, monkeypatch):
    seen = []

    def fake_search(query, lat, lng, budget):
        seen.append((query, lat, lng, budget))
        return [
            {"displayName": {"text": "Snakes & Lattes"}, "formattedAddress": "45 Carlton St", "priceLevel": "PRICE_LEVEL_MODERATE",
             "googleMapsUri": "https://maps.google.com/?cid=1", "location": {"latitude": 43.66, "longitude": -79.38}},
            {"formattedAddress": "no name, skipped"},
        ]

    monkeypatch.setattr(config, "GOOGLE_MAPS_API_KEY", "fake-maps-key")
    monkeypatch.setattr(planning, "search_places", fake_search)
    a, b = pair(client)
    for person, preset in ((a, "union"), (b, "yonge_eglinton")):
        allow_location(client, person)
        client.put("/api/me/meeting-origin", json={"preset": preset}, headers=person[0])
    body = area(client, a[0], b[1]["id"], activity="board game cafe", budget="moderate").json()
    assert body["source"] == "google_places" and len(body["venues"]) == 1
    venue = body["venues"][0]
    assert venue["name"] == "Snakes & Lattes" and venue["open_now"] is None and venue["price_level"] == "PRICE_LEVEL_MODERATE"
    assert seen == [("board game cafe", 43.7, -79.4, "moderate")]  # the two-person halfway point, rounded to about 5 km


def test_places_errors_fall_back_to_links(database, client, monkeypatch):
    def failing(query, lat, lng, budget):
        raise httpx.ConnectError("no network")

    monkeypatch.setattr(config, "GOOGLE_MAPS_API_KEY", "fake-maps-key")
    monkeypatch.setattr(planning, "search_places", failing)
    a, b = pair(client)
    for person in (a, b):
        allow_location(client, person)
        client.put("/api/me/meeting-origin", json={"preset": "union"}, headers=person[0])
    body = area(client, a[0], b[1]["id"]).json()
    assert body["source"] == "links" and body["links"] and "didn't work" in body["notice"]


def test_presets_list(client):
    presets = client.get("/api/planning/area-presets").json()
    assert {"key": "utsc", "label": "UofT Scarborough (UTSC)", "lat": 43.78, "lng": -79.19} in presets


# ---------- Creating the event ----------


def test_create_event_from_a_slot_invites_friends_only(database, client):
    a, b = pair(client)
    c = make_person(client, "Lena Petrova")
    slot = plan(client, a[0], friends=[b[1]["id"]]).json()["slots"][0]
    event = {"title": "Coding at a cafe", "starts_at": slot["start"], "ends_at": slot["end"], "location": "Library cafe"}
    assert client.post("/api/planning/create-event", json={**event, "invitee_ids": [c[1]["id"]]}, headers=a[0]).status_code == 403
    created = client.post("/api/planning/create-event", json={**event, "invitee_ids": [b[1]["id"]]}, headers=a[0])
    assert created.status_code == 201
    body = created.json()
    assert body["invited"] == 1 and body["event"]["is_organiser"] and body["event"]["going_count"] == 1
    notes = client.get("/api/notifications", headers=b[0]).json()["items"]
    assert notes[0]["kind"] == "plan_invite" and notes[0]["link"] == f"/events?id={body['event']['id']}"
    # The usual event rules still apply.
    past = {**event, "starts_at": "2020-01-01T10:00:00+00:00", "ends_at": None, "invitee_ids": []}
    assert client.post("/api/planning/create-event", json=past, headers=a[0]).status_code == 422
