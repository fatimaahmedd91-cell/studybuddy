"""The notification bell.

GET  /api/notifications             your newest notifications and how many are unread
POST /api/notifications/{id}/read   mark one as read (only your own)
POST /api/notifications/read-all    mark all of yours as read

Other features call notify(...) when something happens that you should know about.
Each kind of notification belongs to a category that people can switch off in Settings → Notifications.
Nobody is notified about something done by a person they blocked (or who blocked them).
"""

from fastapi import APIRouter, HTTPException

from app.auth import CurrentUser
from app.db import get_connection
from app.users import mini_profile

router = APIRouter(prefix="/api")

# Settings → Notifications. Each category is on unless switched off, except where the default says so.
CATEGORIES = {
    "friends": {"label": "Friend requests and new friends", "default": True},
    "messages": {"label": "New messages", "default": True},
    "groups_events": {"label": "Groups, events and invitations", "default": True},
    "memories": {"label": "Comments and reactions on your memories", "default": True},
    "planning": {"label": "Hangout plans", "default": True},
    "screen_time": {"label": "Screen-time group invitations", "default": True},
    "reminders": {"label": "Reminders (for example, to log yesterday's screen time)", "default": False},
}

# Which category each kind of notification belongs to. Unknown kinds use "groups_events".
KIND_CATEGORY = {
    "friend_request": "friends",
    "friend_accepted": "friends",
    "message": "messages",
    "group_join": "groups_events",
    "group_event": "groups_events",
    "event_rsvp": "groups_events",
    "event_invite": "groups_events",
    "memory_comment": "memories",
    "memory_reaction": "memories",
    "plan_invite": "planning",
    "screen_time_invite": "screen_time",
    "screen_time_joined": "screen_time",
    "reminder": "reminders",
}


def wants(prefs, category):
    """True if someone wants this category of notification (their choice, or the default)."""
    value = (prefs or {}).get(category)
    return CATEGORIES.get(category, {"default": True})["default"] if value is None else bool(value)


def notify(cur, user_id, kind, text, link="", actor_id=None):
    """Adds a notification for user_id, unless they switched that kind off or blocked the actor.

    Nobody is notified about their own actions. Returns True if a notification was added.
    """
    if actor_id == user_id:
        return False
    cur.execute("SELECT notification_prefs FROM users WHERE id = %s", (user_id,))
    row = cur.fetchone()
    if not row or not wants(row["notification_prefs"], KIND_CATEGORY.get(kind, "groups_events")):
        return False
    if actor_id is not None:
        cur.execute(
            "SELECT 1 FROM blocks WHERE (blocker_id = %s AND blocked_id = %s) OR (blocker_id = %s AND blocked_id = %s)",
            (user_id, actor_id, actor_id, user_id),
        )
        if cur.fetchone():
            return False
    cur.execute(
        "INSERT INTO notifications (user_id, kind, text, link, actor_id) VALUES (%s, %s, %s, %s, %s)",
        (user_id, kind, text, link, actor_id),
    )
    return True


@router.get("/notifications")
def list_notifications(me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT n.id, n.kind, n.text, n.link, n.created_at, n.read_at,
                   u.id AS actor_id, u.name, u.avatar_emoji, u.avatar_color, u.photo_id, u.is_demo
            FROM notifications n
            LEFT JOIN users u ON u.id = n.actor_id
            WHERE n.user_id = %(me)s
              AND (n.actor_id IS NULL OR n.actor_id NOT IN (
                  SELECT blocked_id FROM blocks WHERE blocker_id = %(me)s
                  UNION SELECT blocker_id FROM blocks WHERE blocked_id = %(me)s))
            ORDER BY n.id DESC
            LIMIT 50
            """,
            {"me": me["id"]},
        )
        rows = cur.fetchall()
        cur.execute("SELECT count(*) AS n FROM notifications WHERE user_id = %s AND read_at IS NULL", (me["id"],))
        unread = cur.fetchone()["n"]
    items = [
        {
            "id": r["id"],
            "kind": r["kind"],
            "text": r["text"],
            "link": r["link"],
            "created_at": r["created_at"],
            "read": r["read_at"] is not None,
            "actor": mini_profile({**r, "id": r["actor_id"], "photo_id": r["photo_id"]}) if r["actor_id"] else None,
        }
        for r in rows
    ]
    return {"items": items, "unread_count": unread}


@router.post("/notifications/{notification_id}/read")
def mark_read(notification_id: int, me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            "UPDATE notifications SET read_at = coalesce(read_at, now()) WHERE id = %s AND user_id = %s RETURNING id",
            (notification_id, me["id"]),
        )
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Notification not found.")
    return {"read": True}


@router.post("/notifications/read-all")
def mark_all_read(me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("UPDATE notifications SET read_at = now() WHERE user_id = %s AND read_at IS NULL", (me["id"],))
    return {"read": True}

