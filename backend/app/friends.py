"""Friend requests and friendships.

GET    /api/friends                          your friends, requests you received, requests you sent
POST   /api/friends/requests                 send a request: {"user_id": 5}
POST   /api/friends/requests/{id}/accept     accept a request sent to you
POST   /api/friends/requests/{id}/decline    decline a request sent to you (it is deleted)
DELETE /api/friends/requests/{id}            cancel a request you sent
DELETE /api/friends/{user_id}                remove a friend

Each check happens here on the server, so hiding a button is never the only protection.
"""

import psycopg2
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.auth import CurrentUser
from app.db import get_connection
from app.notifications import notify
from app.ratelimit import RateLimiter
from app.users import USER_COLUMNS, load_user, public_profile

router = APIRouter(prefix="/api")

request_limit = RateLimiter(30, 3600, "You've sent a lot of friend requests. Try again in an hour.")


class FriendRequest(BaseModel):
    user_id: int


def _get_request(cur, request_id):
    cur.execute("SELECT * FROM friendships WHERE id = %s", (request_id,))
    return cur.fetchone()


def _clear_request_notification(cur, request):
    """The "sent you a friend request" notification is done once the request is answered."""
    cur.execute(
        "UPDATE notifications SET read_at = coalesce(read_at, now())"
        " WHERE user_id = %s AND actor_id = %s AND kind = 'friend_request'",
        (request["addressee_id"], request["requester_id"]),
    )


@router.get("/friends")
def list_friends(me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT f.id AS request_id, f.status, f.requester_id, f.created_at AS requested_at, f.accepted_at,
                   u.{USER_COLUMNS.replace(', ', ', u.')}
            FROM friendships f
            JOIN users u ON u.id = CASE WHEN f.requester_id = %s THEN f.addressee_id ELSE f.requester_id END
            WHERE f.requester_id = %s OR f.addressee_id = %s
            ORDER BY coalesce(f.accepted_at, f.created_at) DESC
            """,
            (me["id"], me["id"], me["id"]),
        )
        rows = cur.fetchall()

    friends, incoming, outgoing = [], [], []
    for row in rows:
        entry = {"request_id": row["request_id"], "person": public_profile(row)}
        if row["status"] == "accepted":
            friends.append({**entry, "since": row["accepted_at"]})
        elif row["requester_id"] == me["id"]:
            outgoing.append({**entry, "sent_at": row["requested_at"]})
        else:
            incoming.append({**entry, "sent_at": row["requested_at"]})
    return {"friends": friends, "incoming": incoming, "outgoing": outgoing}


@router.post("/friends/requests", status_code=201)
def send_request(body: FriendRequest, me: CurrentUser):
    if body.user_id == me["id"]:
        raise HTTPException(status_code=400, detail="You can't send a friend request to yourself.")
    with get_connection() as conn, conn.cursor() as cur:
        other = load_user(cur, body.user_id)
        if not other or not other["onboarded"] or other["suspended_at"]:
            raise HTTPException(status_code=404, detail="This person could not be found.")
        cur.execute("SELECT blocker_id FROM blocks WHERE blocker_id IN (%s, %s) AND blocked_id IN (%s, %s)",
                    (me["id"], other["id"], me["id"], other["id"]))
        block = cur.fetchone()
        if block and block["blocker_id"] == me["id"]:
            raise HTTPException(status_code=409, detail="You blocked this person. Unblock them in Settings first.")
        if block:
            # They blocked you. Answer as if they don't exist, so the block isn't revealed.
            raise HTTPException(status_code=404, detail="This person could not be found.")
        cur.execute(
            "SELECT * FROM friendships WHERE LEAST(requester_id, addressee_id) = LEAST(%s, %s)"
            " AND GREATEST(requester_id, addressee_id) = GREATEST(%s, %s)",
            (me["id"], other["id"], me["id"], other["id"]),
        )
        existing = cur.fetchone()
        if existing and existing["status"] == "accepted":
            raise HTTPException(status_code=409, detail="You're already friends.")
        if existing and existing["requester_id"] == me["id"]:
            raise HTTPException(status_code=409, detail="You already sent a request. Waiting for them to answer.")
        if existing:
            # They already asked you, so sending one back simply accepts theirs.
            cur.execute(
                "UPDATE friendships SET status = 'accepted', accepted_at = now() WHERE id = %s", (existing["id"],)
            )
            _clear_request_notification(cur, existing)
            notify(cur, other["id"], "friend_accepted", f"{me['name']} accepted your friend request",
                   f"/profile?id={me['id']}", me["id"])
            return {"request_id": existing["id"], "status": "friends"}

        request_limit.check(me["id"])
        try:
            cur.execute(
                "INSERT INTO friendships (requester_id, addressee_id, status) VALUES (%s, %s, 'pending') RETURNING id",
                (me["id"], other["id"]),
            )
        except psycopg2.errors.UniqueViolation:
            # Two requests at the same moment; the other one won.
            raise HTTPException(status_code=409, detail="A request between you already exists.")
        request_id = cur.fetchone()["id"]
        notify(cur, other["id"], "friend_request", f"{me['name']} sent you a friend request", "/friends", me["id"])
    return {"request_id": request_id, "status": "outgoing"}


@router.post("/friends/requests/{request_id}/accept")
def accept_request(request_id: int, me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        req = _get_request(cur, request_id)
        # Only the person who received a pending request can accept it.
        if not req or req["addressee_id"] != me["id"] or req["status"] != "pending":
            raise HTTPException(status_code=404, detail="This friend request could not be found.")
        cur.execute("UPDATE friendships SET status = 'accepted', accepted_at = now() WHERE id = %s", (request_id,))
        _clear_request_notification(cur, req)
        notify(cur, req["requester_id"], "friend_accepted", f"{me['name']} accepted your friend request",
               f"/profile?id={me['id']}", me["id"])
    return {"request_id": request_id, "status": "friends"}


@router.post("/friends/requests/{request_id}/decline")
def decline_request(request_id: int, me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        req = _get_request(cur, request_id)
        if not req or req["addressee_id"] != me["id"] or req["status"] != "pending":
            raise HTTPException(status_code=404, detail="This friend request could not be found.")
        # No notification: the sender just sees that the request is gone.
        cur.execute("DELETE FROM friendships WHERE id = %s", (request_id,))
        _clear_request_notification(cur, req)
    return {"request_id": request_id, "status": "none"}


@router.delete("/friends/requests/{request_id}")
def cancel_request(request_id: int, me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        req = _get_request(cur, request_id)
        if not req or req["requester_id"] != me["id"] or req["status"] != "pending":
            raise HTTPException(status_code=404, detail="This friend request could not be found.")
        cur.execute("DELETE FROM friendships WHERE id = %s", (request_id,))
        # Remove the "sent you a request" notification too.
        cur.execute(
            "DELETE FROM notifications WHERE user_id = %s AND actor_id = %s AND kind = 'friend_request'",
            (req["addressee_id"], me["id"]),
        )
    return {"request_id": request_id, "status": "none"}


@router.delete("/friends/{user_id}")
def remove_friend(user_id: int, me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            "DELETE FROM friendships WHERE status = 'accepted' AND LEAST(requester_id, addressee_id) = LEAST(%s, %s)"
            " AND GREATEST(requester_id, addressee_id) = GREATEST(%s, %s) RETURNING id",
            (me["id"], user_id, me["id"], user_id),
        )
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="You're not friends with this person.")
    return {"status": "none"}


def are_friends(cur, a, b):
    cur.execute(
        "SELECT 1 FROM friendships WHERE status = 'accepted' AND LEAST(requester_id, addressee_id) = LEAST(%s, %s)"
        " AND GREATEST(requester_id, addressee_id) = GREATEST(%s, %s)",
        (a, b, a, b),
    )
    return cur.fetchone() is not None
