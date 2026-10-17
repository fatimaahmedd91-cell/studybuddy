"""Direct messages between friends.

GET  /api/conversations              your friends, newest conversation first, with unread counts
GET  /api/messages/{friend_id}       messages with one friend (?after_id= to get only newer ones)
POST /api/messages/{friend_id}       send a message: {"body": "Hi!"}

The website checks for new messages every few seconds (polling). It is not instant
"real-time" delivery, but it is simple and reliable.
"""

from typing import Annotated

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, StringConstraints

from app.auth import CurrentUser
from app.db import get_connection
from app.friends import are_friends
from app.notifications import notify
from app.ratelimit import RateLimiter
from app.users import load_user, mini_profile

router = APIRouter(prefix="/api")

message_limit = RateLimiter(20, 60, "You're sending messages very quickly. Wait a minute and try again.")


class NewMessage(BaseModel):
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]


def _message(row, my_id):
    return {
        "id": row["id"],
        "body": row["body"],
        "created_at": row["created_at"],
        "from_me": row["sender_id"] == my_id,
    }


def _require_friend(cur, me, friend_id):
    friend = load_user(cur, friend_id)
    if not friend:
        raise HTTPException(status_code=404, detail="This person could not be found.")
    if not are_friends(cur, me["id"], friend_id):
        raise HTTPException(status_code=403, detail="You can only message people you're friends with.")
    return friend


@router.get("/conversations")
def conversations(me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT u.id, u.name, u.avatar_emoji, u.avatar_color, u.photo_id, u.is_demo,
                   last.body AS last_body, last.created_at AS last_at, last.sender_id AS last_sender,
                   (SELECT count(*) FROM messages m
                     WHERE m.sender_id = u.id AND m.recipient_id = %(me)s AND m.read_at IS NULL) AS unread
            FROM friendships f
            JOIN users u ON u.id = CASE WHEN f.requester_id = %(me)s THEN f.addressee_id ELSE f.requester_id END
            LEFT JOIN LATERAL (
                SELECT body, created_at, sender_id FROM messages m
                WHERE (m.sender_id = %(me)s AND m.recipient_id = u.id) OR (m.sender_id = u.id AND m.recipient_id = %(me)s)
                ORDER BY m.id DESC LIMIT 1
            ) last ON TRUE
            WHERE f.status = 'accepted' AND (f.requester_id = %(me)s OR f.addressee_id = %(me)s)
            ORDER BY last.created_at DESC NULLS LAST, u.name
            """,
            {"me": me["id"]},
        )
        rows = cur.fetchall()
    return [
        {
            "friend": mini_profile(row),
            "last_message": (
                {"body": row["last_body"][:120], "created_at": row["last_at"], "from_me": row["last_sender"] == me["id"]}
                if row["last_body"] is not None
                else None
            ),
            "unread": row["unread"],
        }
        for row in rows
    ]


@router.get("/messages/{friend_id}")
def get_messages(friend_id: int, me: CurrentUser, after_id: int = 0):
    with get_connection() as conn, conn.cursor() as cur:
        friend = _require_friend(cur, me, friend_id)
        cur.execute(
            """
            SELECT * FROM (
                SELECT id, sender_id, body, created_at FROM messages
                WHERE ((sender_id = %(me)s AND recipient_id = %(f)s) OR (sender_id = %(f)s AND recipient_id = %(me)s))
                  AND id > %(after)s
                ORDER BY id DESC LIMIT 200
            ) recent ORDER BY id
            """,
            {"me": me["id"], "f": friend_id, "after": after_id},
        )
        rows = cur.fetchall()
        # Reading the conversation marks their messages to you as read.
        cur.execute(
            "UPDATE messages SET read_at = now() WHERE sender_id = %s AND recipient_id = %s AND read_at IS NULL",
            (friend_id, me["id"]),
        )
        cur.execute(
            "UPDATE notifications SET read_at = now() WHERE user_id = %s AND actor_id = %s AND kind = 'message'"
            " AND read_at IS NULL",
            (me["id"], friend_id),
        )
    return {"friend": mini_profile(friend), "messages": [_message(row, me["id"]) for row in rows]}


@router.post("/messages/{friend_id}", status_code=201)
def send_message(friend_id: int, body: NewMessage, me: CurrentUser):
    message_limit.check(me["id"])
    with get_connection() as conn, conn.cursor() as cur:
        _require_friend(cur, me, friend_id)
        cur.execute(
            "INSERT INTO messages (sender_id, recipient_id, body) VALUES (%s, %s, %s)"
            " RETURNING id, sender_id, body, created_at",
            (me["id"], friend_id, body.body),
        )
        row = cur.fetchone()
        # One unread "new message" notification per sender is enough.
        cur.execute(
            "SELECT 1 FROM notifications WHERE user_id = %s AND actor_id = %s AND kind = 'message' AND read_at IS NULL",
            (friend_id, me["id"]),
        )
        if not cur.fetchone():
            notify(cur, friend_id, "message", f"New message from {me['name']}", f"/messages?with={me['id']}", me["id"])
    return _message(row, me["id"])
