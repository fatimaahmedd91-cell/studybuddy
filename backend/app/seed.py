"""Demo data for FriendFinder: fictional students, groups and events, all marked as demo (is_demo).

    python -m app.seed                   add the demo data (skips what's already there)
    python -m app.seed --reset --yes     delete ALL demo data, then add it again

--reset deletes every demo person (with their friendships, messages, posts, RSVPs and
notifications), every demo group and event, and every "Try the demo" account.
Real accounts stay, but their memberships and RSVPs in demo groups and events go too.
On the live server (APP_ENV=production) --reset also needs --allow-production.
"""

import argparse
import secrets
import sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from psycopg2.extras import Json

from app import config
from app import seed_data as data
from app.db import get_connection, run_migrations
from app.security import hash_password

DEMO_DOMAIN = "demo.friendfinder.invalid"
DEMO_TIME_ZONE = ZoneInfo("America/Toronto")


def demo_email(name):
    return name.lower().replace(" ", ".") + "@" + DEMO_DOMAIN


def insert_demo_person(cur, person, email):
    """Adds one fictional person. Their password is random and never shown, so nobody can log in as them."""
    cur.execute(
        """
        INSERT INTO users (email, password_hash, name, pronouns, age, university, hook, bio, interests,
                           looking_for, availability, avatar_emoji, avatar_color, onboarded, is_demo)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE, TRUE)
        RETURNING id
        """,
        (
            email, hash_password(secrets.token_urlsafe(32)), person["name"], person["pronouns"], person["age"],
            person["university"], person["hook"], person["bio"], person["interests"], person["looking_for"],
            Json(person["availability"]), person["avatar_emoji"], person["avatar_color"],
        ),
    )
    return cur.fetchone()["id"]


def demo_people_ids(cur):
    cur.execute("SELECT id, name FROM users WHERE is_demo AND email LIKE %s", (f"%@{DEMO_DOMAIN}",))
    return {row["name"]: row["id"] for row in cur.fetchall()}


def event_times(spec):
    """Start and end for a demo event: N days from today at a fixed Toronto time."""
    start = datetime.now(DEMO_TIME_ZONE).replace(hour=spec["hour"], minute=0, second=0, microsecond=0)
    start += timedelta(days=spec["days_from_now"])
    return start, start + timedelta(hours=spec["hours"])


def refresh_demo_events(cur):
    """Moves demo events that have already ended back into the coming week, so the demo stays useful."""
    for spec in data.DEMO_EVENTS:
        start, end = event_times(spec)
        cur.execute(
            "UPDATE events SET starts_at = %s, ends_at = %s WHERE is_demo AND title = %s AND ends_at < now()",
            (start, end, spec["title"]),
        )


def seed(cur):
    """Adds the demo data if it isn't there yet. Returns a short summary."""
    ids = demo_people_ids(cur)
    if ids:
        refresh_demo_events(cur)
        return {"created": False, "people": len(ids)}

    for person in data.DEMO_PEOPLE:
        ids[person["name"]] = insert_demo_person(cur, person, demo_email(person["name"]))

    for a, b in data.DEMO_FRIENDSHIPS:
        cur.execute(
            "INSERT INTO friendships (requester_id, addressee_id, status, accepted_at) VALUES (%s, %s, 'accepted', now())",
            (ids[a], ids[b]),
        )

    group_ids = {}
    for group in data.DEMO_GROUPS:
        cur.execute(
            "INSERT INTO groups (name, description, tags, created_by, is_demo) VALUES (%s, %s, %s, %s, TRUE) RETURNING id",
            (group["name"], group["description"], group["tags"], ids[group["owner"]]),
        )
        group_id = group_ids[group["name"]] = cur.fetchone()["id"]
        for member in [group["owner"], *group["members"]]:
            cur.execute("INSERT INTO group_members (group_id, user_id) VALUES (%s, %s)", (group_id, ids[member]))
        for author, body in group["posts"]:
            cur.execute(
                "INSERT INTO group_posts (group_id, author_id, body) VALUES (%s, %s, %s)", (group_id, ids[author], body)
            )

    for spec in data.DEMO_EVENTS:
        start, end = event_times(spec)
        cur.execute(
            """
            INSERT INTO events (title, description, starts_at, ends_at, location, online_url, organiser_id, group_id, is_demo)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, TRUE) RETURNING id
            """,
            (
                spec["title"], spec["description"], start, end, spec.get("location", ""), spec.get("online_url", ""),
                ids[spec["organiser"]], group_ids.get(spec["group"]),
            ),
        )
        event_id = cur.fetchone()["id"]
        for person in [spec["organiser"], *spec["going"]]:
            cur.execute("INSERT INTO event_rsvps (event_id, user_id) VALUES (%s, %s)", (event_id, ids[person]))

    return {"created": True, "people": len(ids), "groups": len(group_ids), "events": len(data.DEMO_EVENTS)}


def reset(cur):
    """Deletes all demo data (see the top of this file)."""
    cur.execute("DELETE FROM events WHERE is_demo")
    cur.execute("DELETE FROM groups WHERE is_demo")
    cur.execute("DELETE FROM users WHERE is_demo")


def main(argv=None):
    parser = argparse.ArgumentParser(description="Add or reset FriendFinder demo data.")
    parser.add_argument("--reset", action="store_true", help="delete all demo data first")
    parser.add_argument("--yes", action="store_true", help="confirm --reset")
    parser.add_argument("--allow-production", action="store_true", help="allow --reset when APP_ENV=production")
    args = parser.parse_args(argv)

    if args.reset and not args.yes:
        print("--reset deletes all demo data. Add --yes to confirm.")
        return 1
    if args.reset and config.APP_ENV == "production" and not args.allow_production:
        print("This server is in production (APP_ENV=production). Add --allow-production to reset demo data here.")
        return 1

    run_migrations()
    with get_connection() as conn, conn.cursor() as cur:
        if args.reset:
            reset(cur)
            print("Deleted all demo data.")
        result = seed(cur)
    if result["created"]:
        print(f"Added demo data: {result['people']} people, {result['groups']} groups, {result['events']} events.")
    else:
        print(f"Demo data already there ({result['people']} demo accounts). Refreshed past demo event dates.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
