"""Self-reported screen time, screen-time groups, and leaderboards.

Three different measurements, never mixed up or ranked against each other:
  1. Time in Meetkat: how long you actively used this app (app/screen_time.py, "in_app").
  2. Self-reported: daily phone/device screen time that you type in yourself ("self_reported").
  3. Device-wide screen time from a real integration: NOT available. A website can't read your
     phone's screen time, so Meetkat never claims to.

Your own self-reported entries:
GET    /api/screen-time/entries?days=14   your entries for the last N days
PUT    /api/screen-time/entries/{day}     {"minutes": 95}  add or change one day (today or up to 13 days back)
DELETE /api/screen-time/entries/{day}     remove one day

Groups (each uses ONE measurement for everyone, and ONE target per person, per day):
GET  /api/screen-time/groups                      your groups and the invitations waiting for you
POST /api/screen-time/groups                      {"name", "description", "metric", "daily_target_minutes"}
GET  /api/screen-time/groups/{id}                 members see everything; invited people see the basics
POST /api/screen-time/groups/{id}/invite          {"user_ids": [5, 7]}  members invite their friends
POST /api/screen-time/groups/{id}/accept          {"share": true}  join and agree to share your totals
POST /api/screen-time/groups/{id}/decline         say no to an invitation
POST /api/screen-time/groups/{id}/leave           stop sharing
GET  /api/screen-time/groups/{id}/leaderboard?day=2026-10-17   who recorded the most screen time that day

Privacy rules (all checked here, on the server):
- Only active members see a group's members and numbers. Everyone else gets "not found".
- You can only invite people you're friends with, and never someone you blocked or who blocked you.
- Joining needs an explicit "share": true, after reading what will be shared.
- When you leave, the group stops seeing ALL your numbers, including earlier days.
- Someone you blocked (or who blocked you) is hidden from your view of the member list and leaderboard.
- A missing entry is shown as "No entry", never counted as zero.
- When the last active member leaves (or deletes their account), the group is deleted.
"""

from datetime import date, datetime, time, timedelta
from typing import Annotated, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.auth import CurrentUser
from app.db import get_connection
from app.friends import are_friends
from app.notifications import notify, wants
from app.ratelimit import RateLimiter
from app.safety import blocked_ids, is_blocked
from app.users import mini_profile

router = APIRouter(prefix="/api")

create_limit = RateLimiter(10, 3600, "You've created a lot of screen-time groups. Try again in an hour.")
invite_limit = RateLimiter(30, 3600, "You've sent a lot of invitations. Try again in an hour.")

# How far back you can log self-reported screen time (today counts as one of the days).
ENTRY_WINDOW_DAYS = 14
# How far back a leaderboard can look.
LEADERBOARD_MAX_DAYS_BACK = 90

METRIC_LABELS = {
    "self_reported": "Self-reported phone screen time",
    "in_app": "Time in Meetkat (only this app)",
}
METRIC_SHORT = {"self_reported": "self-reported", "in_app": "in-app"}


def consent_text(metric):
    """The words people agree to before joining. Shown in the app, and returned by the API."""
    return (
        f"Joining this group will share your {METRIC_SHORT[metric]} usage totals with its members and include "
        "those totals in its leaderboard. This does not measure all device activity unless a separately "
        "identified integration supports it."
    )


def text(max_length, min_length=0):
    """A string with spaces trimmed from both ends and a length limit."""
    return Annotated[str, StringConstraints(strip_whitespace=True, min_length=min_length, max_length=max_length)]


def zone_of(name):
    """A time zone, or UTC if the name isn't valid."""
    try:
        return ZoneInfo(name or "UTC")
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("UTC")


def local_today(zone_name):
    return datetime.now(zone_of(zone_name)).date()


# ---------- Your self-reported entries ----------


class EntryIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    minutes: int = Field(ge=0, le=1440)  # 1440 minutes = 24 hours


def _check_entry_day(me, day):
    today = local_today(me["timezone"])  # "today" in the time zone from your settings
    if day > today:
        raise HTTPException(status_code=422, detail="You can't log screen time for a day that hasn't happened yet.")
    if day < today - timedelta(days=ENTRY_WINDOW_DAYS - 1):
        raise HTTPException(status_code=422, detail=f"You can only log the last {ENTRY_WINDOW_DAYS} days.")


@router.get("/screen-time/entries")
def list_entries(me: CurrentUser, days: int = ENTRY_WINDOW_DAYS):
    days = max(1, min(days, 60))
    first_day = local_today(me["timezone"]) - timedelta(days=days - 1)
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT day, minutes, updated_at FROM screen_time_entries WHERE user_id = %s AND day >= %s ORDER BY day DESC",
            (me["id"], first_day),
        )
        entries = cur.fetchall()
    return {"entries": entries, "source": "self_reported", "unit": "minutes", "window_days": ENTRY_WINDOW_DAYS}


@router.put("/screen-time/entries/{day}")
def save_entry(day: date, body: EntryIn, me: CurrentUser):
    _check_entry_day(me, day)
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO screen_time_entries (user_id, day, minutes) VALUES (%s, %s, %s)
            ON CONFLICT (user_id, day) DO UPDATE SET minutes = EXCLUDED.minutes, updated_at = now()
            RETURNING day, minutes, updated_at
            """,
            (me["id"], day, body.minutes),
        )
        return cur.fetchone()


@router.delete("/screen-time/entries/{day}")
def delete_entry(day: date, me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM screen_time_entries WHERE user_id = %s AND day = %s RETURNING day", (me["id"], day))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="There's no entry for that day.")
    return {"deleted": True}


# ---------- Groups ----------


class GroupIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: text(60, 1)
    description: text(300) = ""
    metric: Literal["self_reported", "in_app"]
    daily_target_minutes: int = Field(ge=10, le=1440)


class InviteIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user_ids: list[int] = Field(min_length=1, max_length=20)


class AcceptIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    # Must be exactly true: the person read the consent text and chose to share.
    share: Literal[True]


def _summary(row):
    """What the group list shows about a group."""
    return {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"],
        "metric": row["metric"],
        "metric_label": METRIC_LABELS[row["metric"]],
        "daily_target_minutes": row["daily_target_minutes"],
        "timezone": row["timezone"],
        "member_count": row["member_count"],
        "my_status": row["my_status"],
        "created_at": row["created_at"],
    }


GROUP_SELECT = """
    SELECT g.*, m.status AS my_status, m.invited_by, m.invited_at,
           (SELECT count(*) FROM st_members x WHERE x.group_id = g.id AND x.status = 'active') AS member_count
    FROM st_groups g
    JOIN st_members m ON m.group_id = g.id AND m.user_id = %(me)s
"""


def _load_group(cur, group_id, me, statuses=("active",)):
    """The group, if you have one of these statuses in it. Otherwise "not found" (no hints)."""
    cur.execute(GROUP_SELECT + " WHERE g.id = %(group)s", {"me": me["id"], "group": group_id})
    row = cur.fetchone()
    if not row or row["my_status"] not in statuses:
        raise HTTPException(status_code=404, detail="This screen-time group could not be found.")
    return row


def _inviter(cur, user_id):
    if user_id is None:
        return None
    cur.execute("SELECT id, name, avatar_emoji, avatar_color, photo_id, is_demo FROM users WHERE id = %s", (user_id,))
    row = cur.fetchone()
    return mini_profile(row) if row else None


def _members(cur, group_id, status, hidden):
    cur.execute(
        """
        SELECT u.id, u.name, u.avatar_emoji, u.avatar_color, u.photo_id, u.is_demo, m.joined_at, m.invited_at
        FROM st_members m JOIN users u ON u.id = m.user_id
        WHERE m.group_id = %s AND m.status = %s ORDER BY m.joined_at NULLS LAST, m.invited_at, u.name
        """,
        (group_id, status),
    )
    return [mini_profile(row) for row in cur.fetchall() if row["id"] not in hidden]


@router.get("/screen-time/groups")
def list_groups(me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        maybe_send_reminder(cur, me)
        cur.execute(
            GROUP_SELECT + " WHERE m.status IN ('active', 'invited') ORDER BY g.created_at DESC",
            {"me": me["id"]},
        )
        rows = cur.fetchall()
        hidden = blocked_ids(cur, me["id"])
        groups, invitations = [], []
        for row in rows:
            if row["my_status"] == "active":
                groups.append(_summary(row))
            elif row["invited_by"] not in hidden:
                invitations.append({
                    **_summary(row),
                    "invited_by": _inviter(cur, row["invited_by"]),
                    "invited_at": row["invited_at"],
                    "consent_text": consent_text(row["metric"]),
                })
    return {"groups": groups, "invitations": invitations}


@router.post("/screen-time/groups", status_code=201)
def create_group(body: GroupIn, me: CurrentUser):
    create_limit.check(me["id"])
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO st_groups (name, description, metric, daily_target_minutes, timezone, created_by)
            VALUES (%s, %s, %s, %s, %s, %s) RETURNING id
            """,
            (body.name, body.description, body.metric, body.daily_target_minutes, me["timezone"] or "UTC", me["id"]),
        )
        group_id = cur.fetchone()["id"]
        # The creator chose the measurement, so they are an active member straight away.
        cur.execute(
            "INSERT INTO st_members (group_id, user_id, status, joined_at) VALUES (%s, %s, 'active', now())",
            (group_id, me["id"]),
        )
    return get_group(group_id, me)


@router.get("/screen-time/groups/{group_id}")
def get_group(group_id: int, me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        row = _load_group(cur, group_id, me, statuses=("active", "invited"))
        result = {**_summary(row), "consent_text": consent_text(row["metric"])}
        if row["my_status"] == "invited":
            # Invited people see only the basics, so they can decide.
            return {**result, "invited_by": _inviter(cur, row["invited_by"]), "invited_at": row["invited_at"]}
        hidden = blocked_ids(cur, me["id"])
        return {
            **result,
            "members": _members(cur, group_id, "active", hidden),
            "invited": _members(cur, group_id, "invited", hidden),
            "created_by_me": row["created_by"] == me["id"],
        }


@router.post("/screen-time/groups/{group_id}/invite")
def invite(group_id: int, body: InviteIn, me: CurrentUser):
    invite_limit.check(me["id"])
    invited, skipped = [], []
    with get_connection() as conn, conn.cursor() as cur:
        group = _load_group(cur, group_id, me)
        for user_id in dict.fromkeys(body.user_ids):  # in order, without repeats
            if user_id == me["id"]:
                skipped.append({"user_id": user_id, "reason": "yourself"})
                continue
            # Friends only, never across a block (blocking also ends the friendship).
            if not are_friends(cur, me["id"], user_id) or is_blocked(cur, me["id"], user_id):
                skipped.append({"user_id": user_id, "reason": "not_friends"})
                continue
            cur.execute("SELECT status FROM st_members WHERE group_id = %s AND user_id = %s", (group_id, user_id))
            existing = cur.fetchone()
            if existing and existing["status"] == "active":
                skipped.append({"user_id": user_id, "reason": "already_member"})
                continue
            if existing and existing["status"] == "invited":
                skipped.append({"user_id": user_id, "reason": "already_invited"})
                continue
            if existing:
                # They declined or left before; a new invitation starts fresh.
                cur.execute(
                    """
                    UPDATE st_members SET status = 'invited', invited_by = %s, invited_at = now(), joined_at = NULL, left_at = NULL
                    WHERE group_id = %s AND user_id = %s
                    """,
                    (me["id"], group_id, user_id),
                )
            else:
                cur.execute(
                    "INSERT INTO st_members (group_id, user_id, status, invited_by, invited_at) VALUES (%s, %s, 'invited', %s, now())",
                    (group_id, user_id, me["id"]),
                )
            notify(cur, user_id, "screen_time_invite",
                   f"{me['name']} invited you to the screen-time group {group['name']}",
                   f"/screen-time?group={group_id}", me["id"])
            invited.append(user_id)
    return {"invited": invited, "skipped": skipped}


@router.post("/screen-time/groups/{group_id}/accept")
def accept(group_id: int, body: AcceptIn, me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        group = _load_group(cur, group_id, me, statuses=("invited", "active"))
        if group["my_status"] == "active":
            raise HTTPException(status_code=409, detail="You're already in this group.")
        cur.execute(
            "UPDATE st_members SET status = 'active', joined_at = now(), left_at = NULL WHERE group_id = %s AND user_id = %s",
            (group_id, me["id"]),
        )
        cur.execute(
            "SELECT user_id FROM st_members WHERE group_id = %s AND status = 'active' AND user_id <> %s",
            (group_id, me["id"]),
        )
        for member in cur.fetchall():
            notify(cur, member["user_id"], "screen_time_joined", f"{me['name']} joined {group['name']}",
                   f"/screen-time?group={group_id}", me["id"])
    return get_group(group_id, me)


@router.post("/screen-time/groups/{group_id}/decline")
def decline(group_id: int, me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        _load_group(cur, group_id, me, statuses=("invited",))
        cur.execute(
            "UPDATE st_members SET status = 'declined' WHERE group_id = %s AND user_id = %s", (group_id, me["id"])
        )
    return {"declined": True}


@router.post("/screen-time/groups/{group_id}/leave")
def leave(group_id: int, me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        _load_group(cur, group_id, me)
        # From now on the group sees none of your numbers, including earlier days.
        # If you were the last active member, the database deletes the group (see migration 006).
        cur.execute(
            "UPDATE st_members SET status = 'left', left_at = now() WHERE group_id = %s AND user_id = %s",
            (group_id, me["id"]),
        )
    return {"left": True}


# ---------- Leaderboard ----------


@router.get("/screen-time/groups/{group_id}/leaderboard")
def leaderboard(group_id: int, me: CurrentUser, day: date | None = None):
    with get_connection() as conn, conn.cursor() as cur:
        group = _load_group(cur, group_id, me)
        zone = zone_of(group["timezone"])
        today = datetime.now(zone).date()
        day = day or today - timedelta(days=1)  # yesterday, in the group's time zone
        if day > today:
            raise HTTPException(status_code=422, detail="That day hasn't happened yet.")
        if day < today - timedelta(days=LEADERBOARD_MAX_DAYS_BACK):
            raise HTTPException(status_code=422, detail=f"Leaderboards go back {LEADERBOARD_MAX_DAYS_BACK} days.")

        hidden = blocked_ids(cur, me["id"])
        cur.execute(
            """
            SELECT u.id, u.name, u.avatar_emoji, u.avatar_color, u.photo_id, u.is_demo
            FROM st_members m JOIN users u ON u.id = m.user_id
            WHERE m.group_id = %s AND m.status = 'active'
            """,
            (group_id,),
        )
        members = [row for row in cur.fetchall() if row["id"] not in hidden]
        member_ids = [row["id"] for row in members]

        # Only ACTIVE members' numbers are read, so people who left disappear completely.
        if group["metric"] == "self_reported":
            cur.execute(
                "SELECT user_id, minutes, updated_at FROM screen_time_entries WHERE day = %s AND user_id = ANY(%s)",
                (day, member_ids),
            )
            data = {row["user_id"]: (row["minutes"], row["updated_at"]) for row in cur.fetchall()}
            updated_at = max((value[1] for value in data.values()), default=None)
        else:
            # The day starts and ends at midnight in the group's time zone.
            start = datetime.combine(day, time(), zone)
            end = datetime.combine(day + timedelta(days=1), time(), zone)
            cur.execute(
                """
                SELECT user_id, sum(seconds) AS seconds, max(at) AS last_at FROM app_time
                WHERE user_id = ANY(%s) AND at >= %s AND at < %s GROUP BY user_id
                """,
                (member_ids, start, end),
            )
            data = {row["user_id"]: (round(row["seconds"] / 60), row["last_at"]) for row in cur.fetchall()}
            updated_at = datetime.now(zone)  # worked out live, just now

    target = group["daily_target_minutes"]
    with_data = sorted((m for m in members if m["id"] in data), key=lambda m: (-data[m["id"]][0], m["name"].lower()))
    ranked, previous, rank = [], None, 0
    for position, member in enumerate(with_data, start=1):
        minutes, member_updated = data[member["id"]]
        if minutes != previous:  # equal minutes share a place: 1, 1, 3
            rank, previous = position, minutes
        ranked.append({
            "rank": rank,
            "person": mini_profile(member),
            "is_me": member["id"] == me["id"],
            "minutes": minutes,
            "difference_minutes": minutes - target,  # positive = over the target
            "over_target": minutes > target,
            "updated_at": member_updated,
        })
    no_entry = [
        {"person": mini_profile(m), "is_me": m["id"] == me["id"]} for m in members if m["id"] not in data
    ]
    return {
        "group_id": group_id,
        "group_name": group["name"],
        "day": day,
        "timezone": group["timezone"],
        "metric": group["metric"],
        "metric_label": METRIC_LABELS[group["metric"]],
        "unit": "minutes",
        "target_minutes": target,
        "ranked": ranked,
        "no_entry": no_entry,
        "updated_at": updated_at,
    }


# ---------- Reminders ----------


def maybe_send_reminder(cur, user):
    """At most one reminder a day to log yesterday's self-reported screen time.

    Only for people who switched reminders on (Settings → Notifications; off by default), are an
    active member of a self-reported group, and haven't logged yesterday yet. Returns True if sent.
    """
    if not wants(user["notification_prefs"], "reminders"):
        return False
    zone = zone_of(user["timezone"])
    today = datetime.now(zone).date()
    yesterday = today - timedelta(days=1)
    cur.execute(
        """
        SELECT 1 FROM st_members m JOIN st_groups g ON g.id = m.group_id
        WHERE m.user_id = %s AND m.status = 'active' AND g.metric = 'self_reported' LIMIT 1
        """,
        (user["id"],),
    )
    if not cur.fetchone():
        return False
    cur.execute("SELECT 1 FROM screen_time_entries WHERE user_id = %s AND day = %s", (user["id"], yesterday))
    if cur.fetchone():
        return False
    cur.execute(
        "SELECT 1 FROM notifications WHERE user_id = %s AND kind = 'reminder' AND created_at >= %s",
        (user["id"], datetime.combine(today, time(), zone)),
    )
    if cur.fetchone():
        return False  # already reminded today
    return notify(
        cur, user["id"], "reminder",
        f"Your screen-time group is waiting: log yesterday's screen time ({yesterday:%a %b} {yesterday.day}).",
        "/screen-time",
    )
