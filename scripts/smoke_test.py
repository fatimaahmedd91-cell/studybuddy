"""Checks that a running FriendFinder site works from end to end, and prints PASS or FAIL per step.

    python scripts/smoke_test.py                            # the site on your computer
    python scripts/smoke_test.py https://your-domain.com    # the live site

It creates one throwaway account (smoke-<random>@example.com) to test sign up and log in.
It uses only Python's standard library, so there is nothing to install.
"""

import json
import sys
import urllib.error
import urllib.request
import uuid

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000").rstrip("/")
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


def detail_of(body):
    return body.get("detail", body) if isinstance(body, dict) else str(body)[:120]


print(f"Testing {BASE}\n")

# 1. The website itself
status, body = request("GET", "/")
check("Website loads", status == 200 and "FriendFinder" in str(body), f"status {status}")

# 2. Health: backend, database, Gemini
status, body = request("GET", "/api/health")
if isinstance(body, dict) and "database" in body:
    check("Backend is running", True)
    check("Database is reachable", body["database"]["ok"], body["database"]["detail"])
    check("Gemini is reachable", body["gemini"]["ok"], body["gemini"]["detail"])
else:
    check("Backend is running", False, detail_of(body) if status else body)

# 3. Accounts
email = f"smoke-{uuid.uuid4().hex[:8]}@example.com"
password = "smoke-test-password"
status, body = request("POST", "/api/auth/signup", {"email": email, "password": password, "name": "Smoke Test"})
check("Sign up creates an account", status == 201, f"status {status}: {detail_of(body)}" if status != 201 else "")

status, body = request("POST", "/api/auth/login", {"email": email, "password": password})
token = body.get("access_token") if isinstance(body, dict) else None
check("Log in returns a token", status == 200 and bool(token), f"status {status}: {detail_of(body)}" if status != 200 else "")

status, body = request("GET", "/api/me", token=token)
ok = status == 200 and isinstance(body, dict) and body.get("email") == email
check("/api/me shows the logged-in account", ok, f"status {status}" if not ok else "")

status, _ = request("POST", "/api/auth/login", {"email": email, "password": "wrong-password"})
check("Wrong password is refused", status == 401, f"status {status}")

status, _ = request("GET", "/api/me")
check("/api/me without logging in is refused", status == 401, f"status {status}")

# 4. AI insight
facts = {"sharedInterests": ["Coding", "Cafes"], "sharedCourses": ["CSCA48"], "sharedSlots": [{"day": "Tue", "slot": "afternoon"}]}
status, body = request("POST", "/api/insight", facts)
ok = status == 200 and isinstance(body, dict) and bool(body.get("text"))
check("Gemini writes a match insight", ok, f'"{body["text"][:70]}…"' if ok else f"status {status}: {detail_of(body)}")

status, _ = request("POST", "/api/insight", {**facts, "name": "Amira Khan"})
check("Insight refuses personal details like names", status == 422, f"status {status}")

passed = sum(results)
print(f"\n{passed} of {len(results)} checks passed.")
sys.exit(0 if passed == len(results) else 1)
