"""Checks that a running Meerkat site works from end to end, and prints PASS or FAIL per step.

    python scripts/smoke_test.py                            # the site on your computer (Next.js dev server)
    python scripts/smoke_test.py http://localhost:8000      # just the backend
    python scripts/smoke_test.py https://your-domain.com    # the live site

It makes two throwaway accounts (smoke-<random>@example.com), walks them through the main journey
(profile, discover, friend request, messages, group, event, notifications, match note, screen time),
and deletes both accounts at the end, even if a step fails. If "Try the demo" is switched on it also
makes one demo account; those are hidden from Discover and deleted automatically after 24 hours.
It uses only Python's standard library, so there is nothing to install.
"""

import json
import sys
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000").rstrip("/")
PASSWORD = "smoke-test-password-42"
results = []


def request(method, path, body=None, token=None):
    """Returns (status code, parsed JSON or text). Status is None if the site can't be reached."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            status, raw = res.status, res.read()
    except urllib.error.HTTPError as err:
        status, raw = err.code, err.read()
    except (urllib.error.URLError, TimeoutError) as err:
        return None, f"cannot reach {BASE} ({getattr(err, 'reason', err)})"
    try:
        return status, json.loads(raw)
    except ValueError:
        return status, raw.decode("utf-8", "replace")


def check(name, passed, detail=""):
    results.append(passed)
    print(f"{'PASS' if passed else 'FAIL'}  {name}" + (f"  ({detail})" if detail else ""))
    return passed


def info(name, detail):
    print(f"INFO  {name}  ({detail})")


def detail_of(status, body):
    text = body.get("detail", body) if isinstance(body, dict) else str(body)[:120]
    return f"status {status}: {text}"


def make_account(name, profile):
    """Signs up and fills in a profile. Returns (token, user id) or (None, None)."""
    email = f"smoke-{uuid.uuid4().hex[:10]}@example.com"
    status, body = request(
        "POST", "/api/auth/signup", {"email": email, "password": PASSWORD, "name": name, "accept_terms": True}
    )
    if not check(f"Sign up ({name})", status == 201, "" if status == 201 else detail_of(status, body)):
        return None, None
    token = body["access_token"]
    status, body = request("PATCH", "/api/me", profile, token)
    ok = status == 200 and isinstance(body, dict) and body.get("onboarded")
    check(f"Profile saved and complete ({name})", ok, "" if ok else detail_of(status, body))
    return token, body.get("id") if isinstance(body, dict) else None


PROFILE = {
    "university": "Smoke Test University",
    "hook": "Here to check the site works.",
    "bio": "Automated test account. It deletes itself.",
    "interests": ["Coding", "Board games", "Cafes"],
    "looking_for": ["Study buddy", "Clubs and campus events"],
    "availability": {"Tue": ["afternoon"], "Thu": ["evening"]},
}

print(f"Testing {BASE}\n")

# ---------- The website and the server ----------

status, body = request("GET", "/")
if BASE.endswith(":8000"):
    info("Website", "skipped, this address is just the backend")
else:
    check("Website loads", status == 200 and "Meerkat" in str(body), f"status {status}")

status, health = request("GET", "/api/health")
if not check("Backend is running", isinstance(health, dict) and "database" in health,
             "" if isinstance(health, dict) else str(health)):
    print("\nThe backend isn't answering, so the other checks can't run.")
    sys.exit(1)
check("Database is reachable", health["database"]["ok"], health["database"]["detail"])
info("TimescaleDB", "in use" if health["database"].get("timescaledb") else "not in use (plain PostgreSQL)")
info("Gemini", "set up" if health["gemini"]["ok"] else f"not available: {health['gemini']['detail']}")

# ---------- Accounts and the main journey ----------

token_a = token_b = None
try:
    token_a, id_a = make_account("Smoke Tester A", PROFILE)
    token_b, id_b = make_account("Smoke Tester B", {**PROFILE, "interests": ["Coding", "Hiking"]})
    if not (token_a and token_b):
        raise SystemExit

    status, body = request("GET", "/api/me", token=token_a)
    check("/api/me shows the logged-in account", status == 200 and body.get("id") == id_a, f"status {status}")
    check("/api/me never returns the password", "password" not in json.dumps(body).lower())

    status, body = request("GET", "/api/me")
    check("Pages that need an account refuse visitors who aren't logged in", status == 401, f"status {status}")

    # Discover
    status, body = request("GET", "/api/people?university=Smoke%20Test%20University", token=token_a)
    people = body.get("people", []) if isinstance(body, dict) else []
    b_card = next((p for p in people if p["id"] == id_b), None)
    check("Discover finds the other account", bool(b_card), detail_of(status, body) if status != 200 else "")
    if b_card:
        check("Discover explains the match", b_card["match"]["score"] > 0 and bool(b_card["match"]["reasons"]),
              f"score {b_card['match']['score']}")
        check("Discover hides email and exact availability", "email" not in b_card and "availability" not in b_card)

    # Friends
    status, body = request("POST", "/api/friends/requests", {"user_id": id_a}, token_a)
    check("Can't send a friend request to yourself", status == 400, f"status {status}")
    status, body = request("POST", "/api/friends/requests", {"user_id": id_b}, token_a)
    request_id = body.get("request_id") if isinstance(body, dict) else None
    check("Send a friend request", status == 201 and bool(request_id), "" if status == 201 else detail_of(status, body))
    status, _ = request("POST", "/api/friends/requests", {"user_id": id_b}, token_a)
    check("A second request to the same person is refused", status == 409, f"status {status}")
    status, body = request("GET", "/api/notifications", token=token_b)
    check("The other person gets a notification", status == 200 and body.get("unread_count", 0) >= 1,
          f"status {status}")
    status, body = request("POST", f"/api/friends/requests/{request_id}/accept", token=token_a)
    check("Only the person asked can accept", status == 404, f"status {status}")
    status, body = request("POST", f"/api/friends/requests/{request_id}/accept", token=token_b)
    check("Accept the friend request", status == 200, "" if status == 200 else detail_of(status, body))
    status, body = request("GET", "/api/friends", token=token_a)
    check("Both are now friends", status == 200 and id_b in [f["person"]["id"] for f in body.get("friends", [])])

    # Messages
    status, body = request("POST", f"/api/messages/{id_b}", {"body": "Hi from the smoke test"}, token_a)
    check("Send a message", status == 201, "" if status == 201 else detail_of(status, body))
    status, body = request("GET", f"/api/messages/{id_a}", token=token_b)
    got = isinstance(body, dict) and any(m["body"] == "Hi from the smoke test" for m in body.get("messages", []))
    check("The friend receives the message", got, f"status {status}")

    # Groups
    status, group = request("POST", "/api/groups", {"name": "Smoke test group", "tags": ["Study"]}, token_a)
    group_id = group.get("id") if isinstance(group, dict) else None
    check("Create a group", status == 201 and bool(group_id), "" if status == 201 else detail_of(status, group))
    status, body = request("GET", f"/api/groups/{group_id}/posts", token=token_b)
    check("Group discussion is members-only", status == 403, f"status {status}")
    status, body = request("POST", f"/api/groups/{group_id}/join", token=token_b)
    check("Join the group", status == 200 and body.get("is_member"), "" if status == 200 else detail_of(status, body))
    status, body = request("POST", f"/api/groups/{group_id}/posts", {"body": "Hello group"}, token_b)
    check("Post in the group discussion", status == 201, "" if status == 201 else detail_of(status, body))

    # Events
    starts = (datetime.now(timezone.utc) + timedelta(days=2)).replace(microsecond=0)
    event = {"title": "Smoke test meetup", "starts_at": starts.isoformat(),
             "ends_at": (starts + timedelta(hours=1)).isoformat(), "location": "Library", "group_id": group_id}
    status, body = request("POST", "/api/events", {**event, "starts_at": "2020-01-01T10:00:00+00:00", "ends_at": None},
                           token_a)
    check("An event in the past is refused", status == 422, f"status {status}")
    status, created = request("POST", "/api/events", event, token_a)
    event_id = created.get("id") if isinstance(created, dict) else None
    check("Create an event for the group", status == 201 and bool(event_id),
          "" if status == 201 else detail_of(status, created))
    status, body = request("POST", f"/api/events/{event_id}/rsvp", token=token_b)
    ok = status == 200 and body.get("is_going") and body.get("going_count") == 2
    check("RSVP to the event (count goes up)", ok, "" if ok else detail_of(status, body))
    status, body = request("DELETE", f"/api/events/{event_id}/rsvp", token=token_b)
    ok = status == 200 and not body.get("is_going") and body.get("going_count") == 1
    check("Un-RSVP (count goes down)", ok, "" if ok else detail_of(status, body))

    # Notifications
    status, body = request("POST", "/api/notifications/read-all", token=token_b)
    status, body = request("GET", "/api/notifications", token=token_b)
    check("Mark all notifications as read", status == 200 and body.get("unread_count") == 0, f"status {status}")

    # Match note (Gemini, or the labelled fallback)
    status, body = request("GET", f"/api/people/{id_b}/insight", token=token_a)
    ok = status == 200 and body.get("source") in ("gemini", "fallback") and bool(body.get("explanation"))
    check("Match note is written", ok, "" if ok else detail_of(status, body))
    if ok:
        how = "by Gemini" if body["source"] == "gemini" else f"by the non-AI fallback ({body.get('fallback_reason')})"
        info("Match note", f"written {how}")

    # Screen time
    status, body = request("POST", "/api/screen-time/heartbeat", token=token_a)
    check("Screen time records a heartbeat", status == 200 and body.get("counted") is True, f"status {status}")
    status, body = request("GET", "/api/screen-time?tz=America/Toronto", token=token_a)
    ok = status == 200 and body.get("today_seconds", 0) >= 30 and len(body.get("week", [])) == 7
    check("Screen time shows today and the last 7 days", ok, "" if ok else detail_of(status, body))

    # Logging in again
    status, body = request("GET", "/api/me", token=token_a)
    email_a = body.get("email") if isinstance(body, dict) else ""
    status, body = request("POST", "/api/auth/login", {"email": email_a, "password": PASSWORD})
    check("Log in with the password", status == 200 and bool(body.get("access_token")), f"status {status}")
    status, _ = request("POST", "/api/auth/login", {"email": email_a, "password": "wrong-password"})
    check("A wrong password is refused", status == 401, f"status {status}")

    # Demo mode
    if health.get("demo_mode"):
        status, body = request("POST", "/api/auth/demo")
        ok = status == 201 and body["user"]["is_demo"] and body["user"]["onboarded"]
        check("'Try the demo' makes a ready demo account", ok, "" if ok else detail_of(status, body))
    else:
        info("Demo mode", "switched off on this server")
except SystemExit:
    pass
except Exception as err:  # an answer in an unexpected shape: report it instead of crashing
    check("The server answered in the expected format", False, repr(err))
finally:
    # Clean up: delete both test accounts (their group and event go with them).
    for token, name in ((token_b, "B"), (token_a, "A")):
        if token:
            status, body = request("DELETE", "/api/me", {"confirm": "DELETE"}, token)
            check(f"Delete test account {name}", status == 200, "" if status == 200 else detail_of(status, body))

passed = sum(results)
print(f"\n{passed} of {len(results)} checks passed.")
sys.exit(0 if results and all(results) else 1)
