"""Events: list, create, edit, cancel, RSVP.

GET    /api/events              ?when=upcoming (default) or past, ?group_id= to show one group's events
POST   /api/events              create one (you are automatically going)
GET    /api/events/{id}         details and who is going ("is_organiser" says if it's yours)
PATCH  /api/events/{id}         the organiser changes the title, description, time or place
DELETE /api/events/{id}         the organiser cancels it
POST   /api/events/{id}/rsvp    say you're going
DELETE /api/events/{id}/rsvp    say you're no longer going

Only the organiser can edit or cancel an event, and an event that has ended can't be edited.
Edits follow the same rules as creating one. If the time or place changes, or the event is cancelled,
everyone who said they're going hears about it (notify() skips people who blocked the organiser or
switched these notifications off). An event's group can't be changed.

Times: the website sends times with a time zone (ISO 8601, like 2026-10-24T18:00:00-04:00).
The database stores them in UTC, and each person sees them in their own time zone.
"""

from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException
from pydantic import AwareDatetime, BaseModel, ConfigDict, StringConstraints

from app.auth import CurrentUser
from app.db import get_connection
from app.notifications import notify
from app.ratelimit import RateLimiter
from app.users import mini_profile

router = APIRouter(prefix="/api")

create_limit = RateLimiter(10, 3600, "You've created a lot of events. Try again in an hour.")

# An event with no end time counts as running for this long.
DEFAULT_LENGTH = timedelta(hours=2)
MAX_LENGTH = timedelta(hours=24)


def text(max_length, min_length=0):
    return Annotated[str, StringConstraints(strip_whitespace=True, min_length=min_length, max_length=max_length)]


OnlineUrl = Annotated[str, StringConstraints(strip_whitespace=True, max_length=300, pattern=r"^(https?://\S+)?$")]


class EventCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: text(80, 3)
    description: text(1000) = ""
    starts_at: AwareDatetime  # must include a time zone
    ends_at: AwareDatetime | None = None
    location: text(120) = ""
    online_url: OnlineUrl = ""
    group_id: int | None = None


class EventUpdate(BaseModel):
    """Only the fields you send are changed. Send "ends_at": null to remove the end time."""

    model_config = ConfigDict(extra="forbid")
    title: text(80, 3) | None = None
    description: text(1000) | None = None
    starts_at: AwareDatetime | None = None
    ends_at: AwareDatetime | None = None
    location: text(120) | None = None
    online_url: OnlineUrl | None = None


def check_event_rules(starts_at, ends_at, location, online_url, check_start=True):
    """The rules every event follows, for creating and for editing. Raises 422 with a plain message.

    check_start=False skips the "in the future" checks, for an edit that keeps the original start time
    (so an event that has already started can still get a new end time or place).
    """
    now = datetime.now(timezone.utc)
    if check_start:
        if starts_at < now - timedelta(minutes=5):
            raise HTTPException(status_code=422, detail="The start time is in the past. Pick a future time.")
        if starts_at > now + timedelta(days=365):
            raise HTTPException(status_code=422, detail="Events can be planned up to one year ahead.")
    if ends_at is not None:
        if ends_at <= starts_at:
            raise HTTPException(status_code=422, detail="The end time must be after the start time.")
        if ends_at - starts_at > MAX_LENGTH:
            raise HTTPException(status_code=422, detail="Events can last up to 24 hours.")
    if not location and not online_url:
        raise HTTPException(status_code=422, detail="Add a location or an online link.")


EVENT_FIELDS = """
    e.id, e.title, e.description, e.starts_at, e.ends_at, e.location, e.online_url, e.is_demo,
    e.organiser_id, e.group_id, g.name AS group_name,
    o.name AS organiser_name, o.avatar_emoji AS organiser_emoji, o.avatar_color AS organiser_color,
    o.photo_id AS organiser_photo, o.is_demo AS organiser_is_demo,
    (SELECT count(*) FROM event_rsvps r WHERE r.event_id = e.id) AS going_count,
    EXISTS (SELECT 1 FROM event_rsvps r WHERE r.event_id = e.id AND r.user_id = %(me)s) AS is_going,
    coalesce(e.ends_at, e.starts_at + interval '2 hours') < now() AS has_ended
"""
EVENT_FROM = "FROM events e LEFT JOIN groups g ON g.id = e.group_id LEFT JOIN users o ON o.id = e.organiser_id"


def _event(row, my_id):
    organiser = None
    if row["organiser_id"]:
        organiser = mini_profile({
            "id": row["organiser_id"], "name": row["organiser_name"], "avatar_emoji": row["organiser_emoji"],
            "avatar_color": row["organiser_color"], "photo_id": row["organiser_photo"],
            "is_demo": row["organiser_is_demo"],
        })
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"],
        "starts_at": row["starts_at"],
        "ends_at": row["ends_at"],
        "location": row["location"],
        "online_url": row["online_url"],
        "group": {"id": row["group_id"], "name": row["group_name"]} if row["group_id"] else None,
        "organiser": organiser,
        "is_organiser": row["organiser_id"] == my_id,
        "going_count": row["going_count"],
        "is_going": row["is_going"],
        "has_ended": row["has_ended"],
        "is_demo": row["is_demo"],
    }


def _load_event(cur, event_id, my_id):
    cur.execute(f"SELECT {EVENT_FIELDS} {EVENT_FROM} WHERE e.id = %(id)s", {"me": my_id, "id": event_id})
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="This event could not be found.")
    return row


@router.get("/events")
def list_events(me: CurrentUser, when: Literal["upcoming", "past"] = "upcoming", group_id: int | None = None):
    ended = "coalesce(e.ends_at, e.starts_at + interval '2 hours') < now()"
    conditions = [ended if when == "past" else f"NOT ({ended})"]
    params = {"me": me["id"]}
    if group_id is not None:
        conditions.append("e.group_id = %(group)s")
        params["group"] = group_id
    order = "DESC" if when == "past" else "ASC"
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            f"SELECT {EVENT_FIELDS} {EVENT_FROM} WHERE {' AND '.join(conditions)} ORDER BY e.starts_at {order} LIMIT 200",
            params,
        )
        rows = cur.fetchall()
    return [_event(row, me["id"]) for row in rows]


@router.post("/events", status_code=201)
def create_event(body: EventCreate, me: CurrentUser):
    check_event_rules(body.starts_at, body.ends_at, body.location, body.online_url)

    create_limit.check(me["id"])
    with get_connection() as conn, conn.cursor() as cur:
        group_name = None
        if body.group_id is not None:
            cur.execute("SELECT name FROM groups WHERE id = %s", (body.group_id,))
            group = cur.fetchone()
            if not group:
                raise HTTPException(status_code=404, detail="That group could not be found.")
            cur.execute("SELECT 1 FROM group_members WHERE group_id = %s AND user_id = %s", (body.group_id, me["id"]))
            if not cur.fetchone():
                raise HTTPException(status_code=403, detail="Join the group before adding events to it.")
            group_name = group["name"]
        cur.execute(
            "INSERT INTO events (title, description, starts_at, ends_at, location, online_url, organiser_id, group_id,"
            " is_demo) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
            (body.title, body.description, body.starts_at, body.ends_at, body.location, body.online_url,
             me["id"], body.group_id, me["is_demo"]),  # a demo account's events are demo too
        )
        event_id = cur.fetchone()["id"]
        # The organiser is going to their own event.
        cur.execute("INSERT INTO event_rsvps (event_id, user_id) VALUES (%s, %s)", (event_id, me["id"]))
        if group_name:
            cur.execute("SELECT user_id FROM group_members WHERE group_id = %s", (body.group_id,))
            for member in cur.fetchall():
                notify(cur, member["user_id"], "group_event", f"New event in {group_name}: {body.title}",
                       f"/events?id={event_id}", me["id"])
    return get_event(event_id, me)


@router.get("/events/{event_id}")
def get_event(event_id: int, me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        event = _event(_load_event(cur, event_id, me["id"]), me["id"])
        cur.execute(
            "SELECT u.id, u.name, u.avatar_emoji, u.avatar_color, u.photo_id, u.is_demo FROM event_rsvps r"
            " JOIN users u ON u.id = r.user_id WHERE r.event_id = %s ORDER BY r.created_at LIMIT 200",
            (event_id,),
        )
        event["attendees"] = [mini_profile(row) for row in cur.fetchall()]
    return event


def _organisers_event(cur, event_id, me):
    """The event, if it exists and you organise it (404 / 403 otherwise)."""
    row = _load_event(cur, event_id, me["id"])
    if row["organiser_id"] != me["id"]:
        raise HTTPException(status_code=403, detail="Only the organiser can change this event.")
    return row


def _notify_going(cur, event_id, me, kind, text, link):
    """Tells everyone who said they're going (except the organiser). Returns how many were told."""
    cur.execute("SELECT user_id FROM event_rsvps WHERE event_id = %s", (event_id,))
    return sum(notify(cur, row["user_id"], kind, text, link, me["id"]) for row in cur.fetchall())


@router.patch("/events/{event_id}")
def update_event(event_id: int, body: EventUpdate, me: CurrentUser):
    changes = body.model_dump(exclude_unset=True)
    for field in ("title", "description", "starts_at", "location", "online_url"):
        if field in changes and changes[field] is None:
            raise HTTPException(status_code=422, detail=f"{field.replace('_', ' ').capitalize()} can't be empty.")
    with get_connection() as conn, conn.cursor() as cur:
        old = _organisers_event(cur, event_id, me)
        if old["has_ended"]:
            raise HTTPException(status_code=409, detail="This event has already ended, so it can't be changed.")
        new = {field: changes.get(field, old[field])
               for field in ("title", "description", "starts_at", "ends_at", "location", "online_url")}
        start_changed = "starts_at" in changes and changes["starts_at"] != old["starts_at"]
        check_event_rules(new["starts_at"], new["ends_at"], new["location"], new["online_url"], check_start=start_changed)
        cur.execute(
            "UPDATE events SET title = %s, description = %s, starts_at = %s, ends_at = %s, location = %s, online_url = %s"
            " WHERE id = %s",
            (new["title"], new["description"], new["starts_at"], new["ends_at"], new["location"], new["online_url"],
             event_id),
        )
        moved = any(new[f] != old[f] for f in ("starts_at", "ends_at", "location", "online_url"))
        if moved:
            _notify_going(cur, event_id, me, "event_updated",
                          f"{me['name']} changed the time or place of {new['title']}", f"/events?id={event_id}")
    return get_event(event_id, me)


@router.delete("/events/{event_id}")
def cancel_event(event_id: int, me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        row = _organisers_event(cur, event_id, me)
        told = 0
        if not row["has_ended"]:  # nobody needs to hear that a finished event was removed
            told = _notify_going(cur, event_id, me, "event_cancelled", f"{row['title']} was cancelled", "/events")
        cur.execute("DELETE FROM events WHERE id = %s", (event_id,))  # RSVPs go with it
    return {"cancelled": True, "notified": told}


@router.post("/events/{event_id}/rsvp")
def rsvp(event_id: int, me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        row = _load_event(cur, event_id, me["id"])
        if row["has_ended"]:
            raise HTTPException(status_code=400, detail="This event has already ended.")
        if row["is_going"]:
            raise HTTPException(status_code=409, detail="You're already going.")
        cur.execute("INSERT INTO event_rsvps (event_id, user_id) VALUES (%s, %s)", (event_id, me["id"]))
        if row["organiser_id"]:
            notify(cur, row["organiser_id"], "event_rsvp", f"{me['name']} is going to {row['title']}",
                   f"/events?id={event_id}", me["id"])
    return get_event(event_id, me)


@router.delete("/events/{event_id}/rsvp")
def cancel_rsvp(event_id: int, me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        row = _load_event(cur, event_id, me["id"])
        if row["has_ended"]:
            raise HTTPException(status_code=400, detail="This event has already ended.")
        cur.execute("DELETE FROM event_rsvps WHERE event_id = %s AND user_id = %s RETURNING 1", (event_id, me["id"]))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="You weren't going to this event.")
    return get_event(event_id, me)
