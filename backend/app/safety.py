"""Blocking and reporting.

GET    /api/blocks            the people you blocked
POST   /api/blocks            {"user_id": 5} blocks someone
DELETE /api/blocks/{user_id}  unblocks them
POST   /api/reports           {"target_type": "profile", "target_id": 5, "reason": "harassment", "details": "..."}

What a block does (both directions, enforced here on the server):
- You stop seeing each other in Discover, and each other's profiles and memories.
- Friend requests and direct messages between you are refused.
- An existing friendship and any pending friend request between you are removed.
- Notifications caused by the other person are no longer shown or created.
- Invitations (groups, events, screen-time groups, planning) between you are refused.
What a block can't hide: if you are both in the same group or event, you can both still see that
group's member and attendee lists. In a shared group's discussion, each person's posts are hidden
from the other (everyone else still sees both).
The blocked person is not told that you blocked them.

Reports go to the moderators (app/moderation.py). Only moderators see who made a report.
"""

from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, StringConstraints

from app.auth import CurrentUser
from app.db import get_connection
from app.ratelimit import RateLimiter
from app.users import mini_profile

router = APIRouter(prefix="/api")

report_limit = RateLimiter(10, 3600, "You've sent a lot of reports. Try again in an hour.")

REPORT_REASONS = {
    "harassment": "Harassment or bullying",
    "hate": "Hateful or discriminatory content",
    "sexual": "Sexual content or solicitation",
    "spam": "Spam, scam or fake account",
    "impersonation": "Impersonation or false verification",
    "privacy": "Shares private information",
    "minor": "May be under the minimum age",
    "violence": "Threats or violence",
    "other": "Something else",
}


# ---------- Helpers other features use ----------

def is_blocked(cur, a, b):
    """True if either person has blocked the other."""
    cur.execute(
        "SELECT 1 FROM blocks WHERE (blocker_id = %s AND blocked_id = %s) OR (blocker_id = %s AND blocked_id = %s)",
        (a, b, b, a),
    )
    return cur.fetchone() is not None


def blocked_ids(cur, user_id):
    """Everyone this person blocked or was blocked by. Use it to filter lists."""
    cur.execute(
        "SELECT blocked_id AS id FROM blocks WHERE blocker_id = %s UNION SELECT blocker_id FROM blocks WHERE blocked_id = %s",
        (user_id, user_id),
    )
    return {row["id"] for row in cur.fetchall()}


def refuse_if_blocked(cur, a, b, message="You can't interact with this person."):
    if is_blocked(cur, a, b):
        raise HTTPException(status_code=403, detail=message)


# ---------- Blocking ----------

class BlockRequest(BaseModel):
    user_id: int


@router.get("/blocks")
def list_blocks(me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT u.id, u.name, u.avatar_emoji, u.avatar_color, u.photo_id, u.is_demo, b.created_at
            FROM blocks b JOIN users u ON u.id = b.blocked_id
            WHERE b.blocker_id = %s ORDER BY b.created_at DESC
            """,
            (me["id"],),
        )
        return [{"person": mini_profile(row), "blocked_at": row["created_at"]} for row in cur.fetchall()]


@router.post("/blocks", status_code=201)
def block(body: BlockRequest, me: CurrentUser):
    if body.user_id == me["id"]:
        raise HTTPException(status_code=400, detail="You can't block yourself.")
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT id FROM users WHERE id = %s", (body.user_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="This person could not be found.")
        cur.execute(
            "INSERT INTO blocks (blocker_id, blocked_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            (me["id"], body.user_id),
        )
        # End any friendship or pending request between the two people.
        cur.execute(
            "DELETE FROM friendships WHERE LEAST(requester_id, addressee_id) = LEAST(%s, %s)"
            " AND GREATEST(requester_id, addressee_id) = GREATEST(%s, %s)",
            (me["id"], body.user_id, me["id"], body.user_id),
        )
        # Clear notifications between them (for example a pending friend request).
        cur.execute(
            "DELETE FROM notifications WHERE (user_id = %s AND actor_id = %s) OR (user_id = %s AND actor_id = %s)",
            (me["id"], body.user_id, body.user_id, me["id"]),
        )
    return {"blocked": True}


@router.delete("/blocks/{user_id}")
def unblock(user_id: int, me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM blocks WHERE blocker_id = %s AND blocked_id = %s RETURNING 1", (me["id"], user_id))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="You haven't blocked this person.")
    # Unblocking does not bring back the old friendship: send a new request if you want one.
    return {"blocked": False}


# ---------- Reporting ----------

class ReportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    target_type: Literal["profile", "message", "memory", "group", "event", "group_post"]
    target_id: int
    reason: Literal[tuple(REPORT_REASONS)]  # type: ignore[valid-type]
    details: Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)] = ""


def find_report_target(cur, me, target_type, target_id):
    """Checks the reporter can actually see the item. Returns (owner user id, short snapshot text)."""
    if target_type == "profile":
        cur.execute("SELECT id, name, hook, bio FROM users WHERE id = %s", (target_id,))
        row = cur.fetchone()
        return (row["id"], f"{row['name']}: {row['hook']} / {row['bio']}"[:1000]) if row else None
    if target_type == "message":
        cur.execute(
            "SELECT sender_id, body FROM messages WHERE id = %s AND (sender_id = %s OR recipient_id = %s)",
            (target_id, me["id"], me["id"]),
        )
        row = cur.fetchone()
        return (row["sender_id"], row["body"]) if row else None
    if target_type == "group":
        cur.execute("SELECT created_by, name, description FROM groups WHERE id = %s", (target_id,))
        row = cur.fetchone()
        return (row["created_by"], f"{row['name']}: {row['description']}"[:1000]) if row else None
    if target_type == "group_post":
        cur.execute(
            "SELECT p.author_id, p.body FROM group_posts p JOIN group_members m ON m.group_id = p.group_id"
            " WHERE p.id = %s AND m.user_id = %s",
            (target_id, me["id"]),
        )
        row = cur.fetchone()
        return (row["author_id"], row["body"]) if row else None
    if target_type == "event":
        cur.execute("SELECT organiser_id, title, description FROM events WHERE id = %s", (target_id,))
        row = cur.fetchone()
        return (row["organiser_id"], f"{row['title']}: {row['description']}"[:1000]) if row else None
    if target_type == "memory":
        # Memories are optional (app/memories.py). Only report memories the reporter is allowed to see.
        try:
            from app.memories import can_view_memory
        except ImportError:
            return None
        cur.execute("SELECT id, author_id, caption, audience FROM memories WHERE id = %s AND removed_at IS NULL", (target_id,))
        row = cur.fetchone()
        if row and can_view_memory(cur, me["id"], row):
            return (row["author_id"], row["caption"])
        return None
    return None


@router.post("/reports", status_code=201)
def create_report(body: ReportRequest, me: CurrentUser):
    report_limit.check(f"user:{me['id']}")
    with get_connection() as conn, conn.cursor() as cur:
        found = find_report_target(cur, me, body.target_type, body.target_id)
        if not found:
            raise HTTPException(status_code=404, detail="We couldn't find that, or you can't see it.")
        owner_id, snapshot = found
        if owner_id == me["id"]:
            raise HTTPException(status_code=400, detail="You can't report your own content.")
        cur.execute(
            "SELECT 1 FROM reports WHERE reporter_id = %s AND target_type = %s AND target_id = %s AND status = 'open'",
            (me["id"], body.target_type, body.target_id),
        )
        if cur.fetchone():
            raise HTTPException(status_code=409, detail="You've already reported this. Moderators will look at it.")
        cur.execute(
            """
            INSERT INTO reports (reporter_id, target_type, target_id, target_user_id, reason, details, snapshot)
            VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id
            """,
            (me["id"], body.target_type, body.target_id, owner_id, body.reason, body.details, snapshot or ""),
        )
        report_id = cur.fetchone()["id"]
    # Honest confirmation: it is saved for moderators, with no promise of when it is reviewed.
    return {"id": report_id, "status": "open"}


@router.get("/reports/reasons")
def report_reasons():
    return [{"value": key, "label": label} for key, label in REPORT_REASONS.items()]
