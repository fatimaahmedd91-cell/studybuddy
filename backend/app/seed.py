"""Demo data for Meetkat: fictional students, groups and events, all marked as demo (is_demo).

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
# "Try the demo" visitors get explorer-<random>@demo.friendfinder.invalid (see app/demo.py).
EXPLORER_EMAILS = f"explorer-%@{DEMO_DOMAIN}"
EXPLORER_LIFETIME_HOURS = 24
DEMO_TIME_ZONE = ZoneInfo("America/Toronto")


def demo_email(name):
    return name.lower().replace(" ", ".") + "@" + DEMO_DOMAIN


def insert_demo_person(cur, person, email):
    """Adds one fictional person. Their password is random and never shown, so nobody can log in as them.

    AI features are on for demo accounts, because everything about them is made up.
    """
    cur.execute(
        """
        INSERT INTO users (email, password_hash, name, pronouns, age, university, hook, bio, interests,
                           looking_for, availability, avatar_emoji, avatar_color, onboarded, is_demo, consents)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE, TRUE,
                '{"ai_features": {"granted": true, "at": "demo"}}'::jsonb)
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
    """The fictional people by name (not the "Try the demo" visitor accounts)."""
    cur.execute(
        "SELECT id, name FROM users WHERE is_demo AND email LIKE %s AND email NOT LIKE %s",
        (f"%@{DEMO_DOMAIN}", EXPLORER_EMAILS),
    )
    return {row["name"]: row["id"] for row in cur.fetchall()}


def remove_old_explorers(cur):
    """Deletes "Try the demo" accounts older than a day, with the groups and events they made."""
    cur.execute(
        "SELECT id FROM users WHERE is_demo AND email LIKE %s AND created_at < now() - make_interval(hours => %s)",
        (EXPLORER_EMAILS, EXPLORER_LIFETIME_HOURS),
    )
    old = [row["id"] for row in cur.fetchall()]
    if old:
        cur.execute("DELETE FROM events WHERE organiser_id = ANY(%s)", (old,))
        cur.execute("DELETE FROM groups WHERE created_by = ANY(%s)", (old,))
        cur.execute("DELETE FROM users WHERE id = ANY(%s)", (old,))
    return len(old)


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


def add_commitments(cur, user_id, entries):
    """Adds weekly private commitments (see DEMO_SCHEDULES), unless this person already has some."""
    cur.execute("SELECT 1 FROM commitments WHERE user_id = %s LIMIT 1", (user_id,))
    if cur.fetchone():
        return
    term_start = datetime.now(DEMO_TIME_ZONE).date() - timedelta(days=28)
    for title, kind, weekday, starts, ends, place in entries:
        cur.execute(
            """
            INSERT INTO commitments (user_id, title, kind, location, recurrence, weekday, start_date, start_time, end_time, timezone)
            VALUES (%s, %s, %s, %s, 'weekly', %s, %s, %s, %s, %s)
            """,
            (user_id, title, kind, place, weekday, term_start, starts, ends, DEMO_TIME_ZONE.key),
        )


def add_demo_plans(cur, ids):
    """Private schedules, planning permissions and meeting areas for the fictional people.

    Only adds what's missing, so it also fills them in on databases seeded before they existed.
    The demo people are made up, so their "consent" to location suggestions is made up too (marked "demo").
    """
    from app.planning import AREA_PRESETS  # imported here: planning imports a lot, and this file is imported early

    for name, entries in data.DEMO_SCHEDULES.items():
        if name in ids:
            add_commitments(cur, ids[name], entries)
    for name in data.DEMO_PLANNING_FRIENDS:
        if name in ids:
            cur.execute(
                "INSERT INTO planning_consents (user_id, scope) SELECT %(id)s, 'friends' WHERE NOT EXISTS"
                " (SELECT 1 FROM planning_consents WHERE user_id = %(id)s AND scope = 'friends')",
                {"id": ids[name]},
            )
    for group_name, names in data.DEMO_PLANNING_GROUPS.items():
        cur.execute("SELECT id FROM groups WHERE is_demo AND name = %s", (group_name,))
        group = cur.fetchone()
        for name in names if group else []:
            if name in ids:
                cur.execute(
                    "INSERT INTO planning_consents (user_id, scope, group_id) SELECT %(id)s, 'group', %(group)s"
                    " WHERE EXISTS (SELECT 1 FROM group_members WHERE group_id = %(group)s AND user_id = %(id)s)"
                    " AND NOT EXISTS (SELECT 1 FROM planning_consents WHERE user_id = %(id)s AND scope = 'group'"
                    " AND group_id = %(group)s)",
                    {"id": ids[name], "group": group["id"]},
                )
    for name, preset in data.DEMO_MEETING_AREAS.items():
        if name in ids:
            label, lat, lng = AREA_PRESETS[preset]
            cur.execute(
                "UPDATE users SET consents = consents || %s WHERE id = %s AND NOT consents ? 'location_suggestions'",
                (Json({"location_suggestions": {"granted": True, "at": "demo"}}), ids[name]),
            )
            cur.execute(
                "INSERT INTO meeting_origins (user_id, label, lat, lng, source) VALUES (%s, %s, %s, %s, 'preset')"
                " ON CONFLICT (user_id) DO NOTHING",
                (ids[name], label, lat, lng),
            )


def seed(cur):
    """Adds the demo data if it isn't there yet. Returns a short summary."""
    ids = demo_people_ids(cur)
    if ids:
        refresh_demo_events(cur)
        add_demo_plans(cur, ids)
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

    add_demo_plans(cur, ids)
    return {"created": True, "people": len(ids), "groups": len(group_ids), "events": len(data.DEMO_EVENTS)}


def reset(cur):
    """Deletes all demo data (see the top of this file)."""
    cur.execute("DELETE FROM events WHERE is_demo")
    cur.execute("DELETE FROM groups WHERE is_demo")
    cur.execute("DELETE FROM users WHERE is_demo")


def main(argv=None):
    parser = argparse.ArgumentParser(description="Add or reset Meetkat demo data.")
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
