"""Private commitments: only yours, imports that need review, and duplicate handling."""

import base64
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from app import commitments, config, scheduling
from app.ai import GeminiUnavailable
from app.ics import parse_ics
from tests.helpers import make_person

WEEKLY = {"title": "CSCA08 Lecture", "kind": "class", "location": "IC 130", "recurrence": "weekly", "weekday": 1,
          "start_date": "2026-09-08", "end_date": "2026-12-08", "start_time": "13:00", "end_time": "14:00"}


# ---------- The pure schedule maths (app/scheduling.py) ----------

TORONTO = ZoneInfo("America/Toronto")


def at(y, mo, d, h, mi=0, tz=TORONTO):
    return datetime(y, mo, d, h, mi, tzinfo=tz)


def test_interval_helpers():
    a = [(at(2026, 10, 20, 9), at(2026, 10, 20, 12)), (at(2026, 10, 20, 11), at(2026, 10, 20, 13))]
    assert scheduling.merge(a) == [(at(2026, 10, 20, 9), at(2026, 10, 20, 13))]
    free = [(at(2026, 10, 20, 9), at(2026, 10, 20, 17))]
    busy = [(at(2026, 10, 20, 10), at(2026, 10, 20, 11)), (at(2026, 10, 20, 16), at(2026, 10, 20, 18))]
    assert scheduling.subtract(free, busy) == [(at(2026, 10, 20, 9), at(2026, 10, 20, 10)),
                                               (at(2026, 10, 20, 11), at(2026, 10, 20, 16))]
    other = [(at(2026, 10, 20, 15), at(2026, 10, 20, 20))]
    assert scheduling.intersect(free, other) == [(at(2026, 10, 20, 15), at(2026, 10, 20, 17))]


def commitment(**changes):
    base = {"recurrence": "weekly", "weekday": 1, "start_date": date(2026, 9, 1), "end_date": date(2026, 12, 31),
            "start_time": time(13), "end_time": time(14), "timezone": "America/Toronto"}
    return {**base, **changes}


def test_weekly_commitments_respect_their_dates():
    c = commitment(start_date=date(2026, 10, 21), end_date=date(2026, 11, 10))
    found = scheduling.occurrences(c, date(2026, 10, 1), date(2026, 11, 30))
    assert [s.date() for s, _ in found] == [date(2026, 10, 27), date(2026, 11, 3), date(2026, 11, 10)]


def test_overnight_shift_ends_the_next_day():
    c = commitment(recurrence="none", weekday=None, start_date=date(2026, 10, 23), end_date=None,
                   start_time=time(22), end_time=time(6))
    [(start, end)] = scheduling.occurrences(c, date(2026, 10, 23), date(2026, 10, 24))
    assert start == at(2026, 10, 23, 22) and end == at(2026, 10, 24, 6)


def test_daylight_saving_change_is_handled():
    # Clocks go back in Toronto on Nov 1, 2026: 13:00 local is 17:00 UTC before and 18:00 UTC after.
    c = commitment(weekday=5)  # Saturdays
    found = scheduling.occurrences(c, date(2026, 10, 30), date(2026, 11, 8))
    utc_hours = [s.astimezone(timezone.utc).hour for s, _ in found]
    assert utc_hours == [17, 18]


def test_buffer_is_added_around_commitments():
    c = commitment(recurrence="none", weekday=None, start_date=date(2026, 10, 20), end_date=None)
    [(start, end)] = scheduling.busy_intervals([c], date(2026, 10, 20), date(2026, 10, 20), 15)
    assert start == at(2026, 10, 20, 12, 45) and end == at(2026, 10, 20, 14, 15)


def test_shared_slots_keep_long_enough_future_times():
    window = scheduling.window(date(2026, 10, 20), date(2026, 10, 20), "America/Toronto")
    a = [(at(2026, 10, 20, 12), at(2026, 10, 20, 17))]
    b = [(at(2026, 10, 20, 12), at(2026, 10, 20, 12, 30)), (at(2026, 10, 20, 14), at(2026, 10, 20, 22))]
    now = at(2026, 10, 20, 8)
    assert scheduling.shared_slots([a, b], *window, now, 60) == [(at(2026, 10, 20, 14), at(2026, 10, 20, 17))]
    # Already 15:02: the slot starts at the next 5-minute mark.
    assert scheduling.shared_slots([a, b], *window, at(2026, 10, 20, 15, 2), 60) == [
        (at(2026, 10, 20, 15, 5), at(2026, 10, 20, 17))]
    assert scheduling.shared_slots([a, b], *window, at(2026, 10, 20, 16, 30), 60) == []


def test_midpoint_is_rounded():
    assert scheduling.midpoint([(43.6612, -79.3957), (43.7834, -79.1874)]) == (43.72, -79.29)
    assert scheduling.midpoint([(43.6612, -79.3957), (43.7834, -79.1874)], coarse=True) == (43.7, -79.3)


# ---------- Calendar files ----------

ICS = """BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:lecture-1@uni
SUMMARY:CSCA08H3 LEC01
LOCATION:IC 130
DTSTART;TZID=America/Toronto:20260908T130000
DTEND;TZID=America/Toronto:20260908T140000
RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20261208T235959Z
END:VEVENT
BEGIN:VEVENT
UID:shift-1
SUMMARY:Work shift
DTSTART:20261024T020000Z
DURATION:PT8H
END:VEVENT
BEGIN:VEVENT
UID:allday
SUMMARY:Reading week
DTSTART;VALUE=DATE:20261026
END:VEVENT
BEGIN:VEVENT
UID:daily
SUMMARY:Gym
DTSTART:20261020T070000
DTEND:20261020T080000
RRULE:FREQ=DAILY;COUNT=5
END:VEVENT
END:VCALENDAR
"""


def test_ics_parsing_turns_events_into_reviewable_proposals():
    proposals = parse_ics(ICS, "America/Toronto")
    lectures = [p for p in proposals if p["title"] == "CSCA08H3 LEC01"]
    assert [p["weekday"] for p in lectures] == [1, 3]
    assert lectures[0]["kind"] == "class" and lectures[0]["start_time"] == "13:00" and lectures[0]["end_time"] == "14:00"
    assert lectures[0]["end_date"] == "2026-12-08" and lectures[0]["timezone"] == "America/Toronto"
    assert lectures[0]["import_key"] != lectures[1]["import_key"]

    shift = next(p for p in proposals if p["title"] == "Work shift")
    # 02:00 UTC is 22:00 the evening before in Toronto; 8 hours later is 06:00: an overnight shift.
    assert shift["start_date"] == "2026-10-23" and shift["start_time"] == "22:00" and shift["end_time"] == "06:00"
    assert shift["kind"] == "work"

    allday = next(p for p in proposals if p["title"] == "Reading week")
    assert allday["flags"]["uncertain_time"] and "All-day" in allday["warnings"][0]

    gym = next(p for p in proposals if p["title"] == "Gym")
    assert gym["recurrence"] == "none" and gym["flags"]["ambiguous_recurrence"]
    assert any("assumed America/Toronto" in w for w in gym["warnings"])


def test_ics_with_unknown_time_zone_or_no_end_is_flagged():
    text = "BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:Tutorial\nDTSTART;TZID=Mars/Base:20261020T100000\nEND:VEVENT\nEND:VCALENDAR"
    [p] = parse_ics(text, "America/Toronto")
    assert p["flags"]["uncertain_time"] and p["end_time"] == "11:00"
    assert any("Unknown time zone" in w for w in p["warnings"]) and any("No end time" in w for w in p["warnings"])


# ---------- Commitments: private to their owner ----------


def test_commitments_are_only_visible_to_their_owner(database, client):
    a = make_person(client, "Amira Khan")
    b = make_person(client, "Tariq Aziz")
    created = client.post("/api/commitments", json=WEEKLY, headers=a[0])
    assert created.status_code == 201
    body = created.json()
    assert body["timezone"] == "America/Toronto" and body["source"] == "manual" and body["overnight"] is False

    mine = client.get("/api/commitments", headers=a[0]).json()
    assert [c["title"] for c in mine["commitments"]] == ["CSCA08 Lecture"] and mine["buffer_minutes"] == 15
    assert client.get("/api/commitments", headers=b[0]).json()["commitments"] == []
    assert client.patch(f"/api/commitments/{body['id']}", json={"title": "Mine now"}, headers=b[0]).status_code == 404
    assert client.delete(f"/api/commitments/{body['id']}", headers=b[0]).status_code == 404
    # And nothing about it appears on the owner's public profile.
    profile = client.get(f"/api/people/{a[1]['id']}", headers=b[0]).text
    assert "CSCA08" not in profile and "IC 130" not in profile

    edited = client.patch(f"/api/commitments/{body['id']}", json={"end_time": "15:30"}, headers=a[0]).json()
    assert edited["end_time"] == "15:30"
    assert client.delete(f"/api/commitments/{body['id']}", headers=a[0]).status_code == 200


def test_commitment_rules(database, client):
    a = make_person(client)
    bad = [
        {**WEEKLY, "end_time": "13:00"},                    # same start and end
        {**WEEKLY, "weekday": None},                        # weekly without a day
        {**WEEKLY, "end_date": "2026-09-01"},               # ends before it starts
        {**WEEKLY, "timezone": "Mars/Base"},                # unknown zone
        {**WEEKLY, "kind": "party"},                        # unknown kind
        {**WEEKLY, "secret": True},                         # unknown field
    ]
    for body in bad:
        assert client.post("/api/commitments", json=body, headers=a[0]).status_code == 422, body
    once = client.post("/api/commitments", json={**WEEKLY, "recurrence": "none", "start_time": "22:00",
                                                 "end_time": "06:00"}, headers=a[0]).json()
    assert once["weekday"] is None and once["end_date"] is None and once["overnight"] is True


def test_buffer_setting(database, client):
    a = make_person(client)
    assert client.patch("/api/me/schedule-settings", json={"buffer_minutes": 30}, headers=a[0]).json() == {"buffer_minutes": 30}
    assert client.patch("/api/me/schedule-settings", json={"buffer_minutes": 500}, headers=a[0]).status_code == 422


# ---------- Imports: proposals first, saving only after review ----------


def test_ics_import_proposes_but_never_saves(database, client):
    a = make_person(client)
    response = client.post("/api/commitments/import/ics", json={"text": ICS}, headers=a[0])
    assert response.status_code == 200 and response.json()["count"] == 5
    assert client.get("/api/commitments", headers=a[0]).json()["commitments"] == []
    assert client.post("/api/commitments/import/ics", json={"text": "hello"}, headers=a[0]).status_code == 422


PNG = "data:image/png;base64," + base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"0" * 100).decode()


def fake_extraction(calls):
    def extract(data, mime):
        calls.append((len(data), mime))
        return commitments.ExtractionOut(entries=[
            commitments.ExtractedEntry(title="MATA31 Tutorial", kind="class", weekday=2, start_time="9:00",
                                       end_time="10:00", recurrence="weekly", location="SW 128"),
            commitments.ExtractedEntry(title="Shift", kind="work", weekday=None, start_time=None, end_time="17:00",
                                       recurrence="unknown", uncertain_time=True, notes="Blurry"),
        ])
    return extract


def test_ai_import_needs_consent_a_key_and_a_real_file(database, client, monkeypatch):
    a = make_person(client)
    assert client.post("/api/commitments/import/ai", json={"file": PNG, "consent": False}, headers=a[0]).status_code == 422
    no_key = client.post("/api/commitments/import/ai", json={"file": PNG, "consent": True}, headers=a[0])
    assert no_key.status_code == 503 and "manually" in no_key.json()["detail"]
    fake = "data:image/png;base64," + base64.b64encode(b"not a png").decode()
    assert client.post("/api/commitments/import/ai", json={"file": fake, "consent": True}, headers=a[0]).status_code == 422
    gif = "data:image/gif;base64," + base64.b64encode(b"GIF89a").decode()
    assert client.post("/api/commitments/import/ai", json={"file": gif, "consent": True}, headers=a[0]).status_code == 422


def test_ai_import_flags_uncertain_entries_and_saves_nothing(database, client, monkeypatch):
    calls = []
    monkeypatch.setattr(config, "GEMINI_API_KEY", "fake-key")
    monkeypatch.setattr(commitments, "extract_with_gemini", fake_extraction(calls))
    a = make_person(client)
    response = client.post("/api/commitments/import/ai", json={"file": PNG, "consent": True}, headers=a[0])
    assert response.status_code == 200, response.text
    tutorial, shift = response.json()["proposals"]
    assert tutorial["start_time"] == "09:00" and tutorial["weekday"] == 2 and tutorial["flags"]["missing_dates"]
    assert shift["start_time"] is None and shift["flags"]["uncertain_time"] and shift["flags"]["ambiguous_recurrence"]
    assert any("Blurry" in w for w in shift["warnings"])
    assert calls == [(108, "image/png")]
    assert client.get("/api/commitments", headers=a[0]).json()["commitments"] == []


def test_unusable_ai_answers_are_reported(database, client, monkeypatch):
    def broken(data, mime):
        raise GeminiUnavailable("invalid_response")

    monkeypatch.setattr(config, "GEMINI_API_KEY", "fake-key")
    monkeypatch.setattr(commitments, "extract_with_gemini", broken)
    a = make_person(client)
    assert client.post("/api/commitments/import/ai", json={"file": PNG, "consent": True}, headers=a[0]).status_code == 502


def test_bulk_save_skips_duplicates(database, client):
    a = make_person(client)
    proposals = client.post("/api/commitments/import/ics", json={"text": ICS}, headers=a[0]).json()["proposals"]
    entries = [{k: v for k, v in p.items() if k not in ("warnings", "flags", "source")} for p in proposals]
    first = client.post("/api/commitments/bulk", json={"entries": entries, "source": "ics"}, headers=a[0]).json()
    assert first["saved"] == 5 and first["skipped_duplicates"] == 0
    again = client.post("/api/commitments/bulk", json={"entries": entries, "source": "ics"}, headers=a[0]).json()
    assert again["saved"] == 0 and again["skipped_duplicates"] == 5

    # Same details typed again by hand, and the same entry twice in one list, are duplicates too.
    manual = {**WEEKLY, "title": "Physics"}
    client.post("/api/commitments", json=manual, headers=a[0])
    dupes = client.post("/api/commitments/bulk", json={"entries": [manual, manual], "source": "manual"}, headers=a[0]).json()
    assert dupes["saved"] == 0 and dupes["skipped_duplicates"] == 2
    saved = client.get("/api/commitments", headers=a[0]).json()["commitments"]
    assert {c["source"] for c in saved} == {"ics", "manual"} and len(saved) == 6


def test_bulk_save_refuses_incomplete_entries(database, client):
    a = make_person(client)
    incomplete = {**WEEKLY, "start_time": None}
    assert client.post("/api/commitments/bulk", json={"entries": [incomplete], "source": "ai"}, headers=a[0]).status_code == 422


def test_commitments_are_in_the_data_export(database, client):
    a = make_person(client)
    client.post("/api/commitments", json=WEEKLY, headers=a[0])
    export = client.get("/api/me/export", headers=a[0]).json()
    assert export["commitments"][0]["title"] == "CSCA08 Lecture"


def test_planning_permissions_and_meeting_area_are_in_the_data_export(database, client):
    a = make_person(client)
    client.put("/api/planning/consents", json={"scope": "friends"}, headers=a[0])
    client.put("/api/me/consents/location_suggestions", json={"granted": True}, headers=a[0])
    client.put("/api/me/meeting-origin", json={"preset": "union"}, headers=a[0])
    export = client.get("/api/me/export", headers=a[0]).json()
    assert export["planning_permissions"][0]["scope"] == "friends"
    assert export["meeting_area"][0]["label"] == "Union Station"
    assert export["buffer_minutes"] == [{"buffer_minutes": 15}]
