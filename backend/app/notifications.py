"""The notification bell.

GET  /api/notifications             your newest notifications and how many are unread
POST /api/notifications/{id}/read   mark one as read (only your own)
POST /api/notifications/read-all    mark all of yours as read

Other features call notify(...) when something happens that you should know about.
"""

from fastapi import APIRouter, HTTPException

from app.auth import CurrentUser
from app.db import get_connection
from app.users import mini_profile

router = APIRouter(prefix="/api")


def notify(cur, user_id, kind, text, link="", actor_id=None):
    """Adds a notification for user_id. Nobody is notified about their own actions."""
    if actor_id == user_id:
        return
    cur.execute(
        "INSERT INTO notifications (user_id, kind, text, link, actor_id) VALUES (%s, %s, %s, %s, %s)",
        (user_id, kind, text, link, actor_id),
    )


@router.get("/notifications")
def list_notifications(me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT n.id, n.kind, n.text, n.link, n.created_at, n.read_at,
                   u.id AS actor_id, u.name, u.avatar_emoji, u.avatar_color, u.photo_id, u.is_demo
            FROM notifications n
            LEFT JOIN users u ON u.id = n.actor_id
            WHERE n.user_id = %s
            ORDER BY n.id DESC
            LIMIT 50
            """,
            (me["id"],),
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

