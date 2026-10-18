"""Memories: share moments (a caption and up to 4 photos) with a chosen audience.

GET    /api/memories                      memories you're allowed to see, newest first, 10 at a time
                                          ?before_id=  the next page   ?author_id=  only one person's
POST   /api/memories                      {"caption": "...", "audience": "friends", "photos": ["data:image/jpeg;base64,..."]}
GET    /api/memories/{id}                 one memory
PATCH  /api/memories/{id}                 {"caption": "...", "audience": "everyone"}   (only the author)
DELETE /api/memories/{id}                 delete it, with its photos and comments (only the author)
POST   /api/memories/{id}/reaction        add your ❤️
DELETE /api/memories/{id}/reaction        take it back
GET    /api/memories/{id}/comments        the comments
POST   /api/memories/{id}/comments        {"body": "..."}
DELETE /api/memories/{id}/comments/{cid}  delete a comment (its writer, or the memory's author)
GET    /api/memory-photos/{uuid}?exp=&sig= a photo, through a short-lived signed link

Who can see a memory (checked here, on the server, for every endpoint including photos):
- The author always sees their own memories.
- "everyone": anyone logged in to Meetkat.  "friends" (the default): the author's friends.
  "only_me": nobody else.
- Never anyone who blocked the author or was blocked by them (app/safety.py).
- Never memories a moderator removed, or memories by a suspended account.

Photos load in <img> tags, which can't send the login token. So photo links are signed with
JWT_SECRET and expire after about an hour. Only people allowed to see the memory ever get a link.
(A link that was already given out keeps working until it expires, even if the audience changes.)

Memories never tag people, guess who is in a photo, or add locations or event attendance.
"""

import base64
import binascii
import hashlib
import hmac
import time
import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app import config
from app.auth import CurrentUser
from app.db import get_connection
from app.friends import are_friends
from app.notifications import notify
from app.profiles import MAX_PHOTO_BYTES, strip_jpeg_metadata
from app.ratelimit import RateLimiter
from app.safety import blocked_ids, is_blocked
from app.security import TokenSecretMissing
from app.users import mini_profile

router = APIRouter(prefix="/api")

MAX_PHOTOS = 4
PAGE_SIZE = 10
PHOTO_LINK_SECONDS = 3600  # how long a photo link works

post_limit = RateLimiter(20, 3600, "You've posted a lot of memories. Try again in an hour.")
comment_limit = RateLimiter(30, 600, "You're commenting very quickly. Wait a few minutes and try again.")
reaction_limit = RateLimiter(120, 600, "Slow down a little and try again.")

Audience = Literal["friends", "everyone", "only_me"]
Caption = Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)]
PhotoData = Annotated[str, StringConstraints(max_length=3_000_000)]


def current_time():
    """The time now, in seconds. (Tests replace this to check that links expire.)"""
    return time.time()


# ---------- Who can see what ----------

def can_view_memory(cur, viewer_id, row):
    """True if this person may see the memory. row needs id, author_id and audience.

    app/safety.py uses this too, so people can only report memories they can see.
    """
    if row.get("removed_at"):
        return False
    if row["author_id"] == viewer_id:
        return True
    if row["audience"] == "only_me" or is_blocked(cur, viewer_id, row["author_id"]):
        return False
    cur.execute("SELECT suspended_at FROM users WHERE id = %s", (row["author_id"],))
    author = cur.fetchone()
    if not author or author["suspended_at"]:
        return False
    if row["audience"] == "everyone":
        return True
    return are_friends(cur, viewer_id, row["author_id"])


# The same rules as can_view_memory, written as SQL so the feed can filter many memories at once.
# Uses %(me)s for the person looking.
VISIBLE_SQL = """
    m.removed_at IS NULL
    AND (
        m.author_id = %(me)s
        OR (
            u.suspended_at IS NULL
            AND m.audience <> 'only_me'
            AND m.author_id NOT IN (
                SELECT blocked_id FROM blocks WHERE blocker_id = %(me)s
                UNION SELECT blocker_id FROM blocks WHERE blocked_id = %(me)s
            )
            AND (
                m.audience = 'everyone'
                OR EXISTS (
                    SELECT 1 FROM friendships f
                    WHERE f.status = 'accepted'
                      AND LEAST(f.requester_id, f.addressee_id) = LEAST(m.author_id, %(me)s)
                      AND GREATEST(f.requester_id, f.addressee_id) = GREATEST(m.author_id, %(me)s)
                )
            )
        )
    )
"""

MEMORY_FIELDS = """
    m.id, m.author_id, m.caption, m.audience, m.created_at, m.updated_at, m.removed_at,
    u.name, u.avatar_emoji, u.avatar_color, u.photo_id, u.is_demo,
    (SELECT count(*) FROM memory_reactions r WHERE r.memory_id = m.id) AS reaction_count,
    EXISTS (SELECT 1 FROM memory_reactions r WHERE r.memory_id = m.id AND r.user_id = %(me)s) AS reacted_by_me,
    (SELECT count(*) FROM memory_comments c WHERE c.memory_id = m.id AND c.author_id NOT IN (
        SELECT blocked_id FROM blocks WHERE blocker_id = %(me)s
        UNION SELECT blocker_id FROM blocks WHERE blocked_id = %(me)s
    )) AS comment_count
"""


def _load_visible(cur, memory_id, me_id):
    """The memory if this person may see it, or a 404 (we don't reveal that it exists)."""
    cur.execute(
        f"SELECT {MEMORY_FIELDS} FROM memories m JOIN users u ON u.id = m.author_id WHERE m.id = %(id)s",
        {"id": memory_id, "me": me_id},
    )
    row = cur.fetchone()
    if not row or not can_view_memory(cur, me_id, row):
        raise HTTPException(status_code=404, detail="This memory could not be found.")
    return row


# ---------- Signed photo links ----------

def _signature(photo_id, expires):
    if not config.JWT_SECRET:
        raise TokenSecretMissing()
    message = f"{photo_id}:{expires}".encode()
    return hmac.new(config.JWT_SECRET.encode(), message, hashlib.sha256).hexdigest()


def photo_link(photo_id):
    """A link to one photo that works for about an hour.

    The expiry is rounded up to the next 10 minutes, so the same photo keeps the same link for a
    while and browsers can reuse what they already downloaded.
    """
    expires = (int(current_time()) // 600 + 1) * 600 + PHOTO_LINK_SECONDS
    return f"/api/memory-photos/{photo_id}?exp={expires}&sig={_signature(photo_id, expires)}"


def _photo_links(cur, memory_ids):
    """{memory id: [{"url": ...}, ...]} for memories the caller has ALREADY checked are visible."""
    links = {memory_id: [] for memory_id in memory_ids}
    if memory_ids:
        cur.execute(
            "SELECT id, memory_id FROM memory_photos WHERE memory_id = ANY(%s) ORDER BY memory_id, position",
            (list(memory_ids),),
        )
        for row in cur.fetchall():
            links[row["memory_id"]].append({"url": photo_link(row["id"])})
    return links


def _memory(row, photos, me_id):
    """What the website receives for one memory."""
    return {
        "id": row["id"],
        "author": mini_profile({**row, "id": row["author_id"]}),
        "caption": row["caption"],
        "audience": row["audience"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "edited": (row["updated_at"] - row["created_at"]).total_seconds() > 1,
        "photos": photos,
        "reaction_count": row["reaction_count"],
        "reacted_by_me": row["reacted_by_me"],
        "comment_count": row["comment_count"],
        "mine": row["author_id"] == me_id,
    }


@router.get("/memory-photos/{photo_id}")
def memory_photo(photo_id: uuid.UUID, exp: int = 0, sig: str = ""):
    expected = _signature(str(photo_id), exp)
    if not sig or not hmac.compare_digest(sig, expected):
        raise HTTPException(status_code=403, detail="This photo link isn't valid.")
    remaining = exp - int(current_time())
    if remaining <= 0:
        raise HTTPException(status_code=403, detail="This photo link has expired. Reload the page.")
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT p.mime, p.data FROM memory_photos p
            JOIN memories m ON m.id = p.memory_id JOIN users u ON u.id = m.author_id
            WHERE p.id = %s AND m.removed_at IS NULL AND u.suspended_at IS NULL
            """,
            (str(photo_id),),
        )
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Photo not found.")
    return Response(
        content=bytes(row["data"]),
        media_type=row["mime"],
        # "private": only this browser may keep a copy, never a shared cache.
        headers={"Cache-Control": f"private, max-age={min(remaining, PHOTO_LINK_SECONDS)}"},
    )


# ---------- Memories ----------

class NewMemory(BaseModel):
    model_config = ConfigDict(extra="forbid")
    caption: Caption = ""
    audience: Audience = "friends"
    photos: list[PhotoData] = Field(default=[], max_length=MAX_PHOTOS)


class MemoryUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    caption: Caption | None = None
    audience: Audience | None = None


def _decode_photo(data_url):
    """Checks one uploaded photo and returns its bytes without camera/location details."""
    prefix = "data:image/jpeg;base64,"
    if not data_url.startswith(prefix):
        raise HTTPException(status_code=422, detail="Photos must be JPEG images.")
    try:
        data = strip_jpeg_metadata(base64.b64decode(data_url[len(prefix):], validate=True))
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=422, detail="One of the photos is not a valid JPEG image.")
    if len(data) > MAX_PHOTO_BYTES:
        raise HTTPException(status_code=413, detail="Each photo must be 2 MB or smaller.")
    return data


@router.get("/memories")
def list_memories(me: CurrentUser, before_id: int = 0, author_id: int = 0):
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT {MEMORY_FIELDS}
            FROM memories m JOIN users u ON u.id = m.author_id
            WHERE {VISIBLE_SQL}
              AND (%(before)s = 0 OR m.id < %(before)s)
              AND (%(author)s = 0 OR m.author_id = %(author)s)
            ORDER BY m.id DESC
            LIMIT %(limit)s
            """,
            {"me": me["id"], "before": before_id, "author": author_id, "limit": PAGE_SIZE + 1},
        )
        rows = cur.fetchall()
        has_more = len(rows) > PAGE_SIZE
        rows = rows[:PAGE_SIZE]
        photos = _photo_links(cur, [row["id"] for row in rows])
    return {
        "memories": [_memory(row, photos[row["id"]], me["id"]) for row in rows],
        "next_before_id": rows[-1]["id"] if has_more else None,
    }


@router.post("/memories", status_code=201)
def create_memory(body: NewMemory, me: CurrentUser):
    if not body.caption and not body.photos:
        raise HTTPException(status_code=422, detail="Add a caption or at least one photo.")
    photos = [_decode_photo(photo) for photo in body.photos]  # all checked before anything is saved
    post_limit.check(f"user:{me['id']}")
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO memories (author_id, caption, audience) VALUES (%s, %s, %s) RETURNING id",
            (me["id"], body.caption, body.audience),
        )
        memory_id = cur.fetchone()["id"]
        for position, data in enumerate(photos):
            cur.execute(
                "INSERT INTO memory_photos (id, memory_id, data, position) VALUES (%s, %s, %s, %s)",
                (str(uuid.uuid4()), memory_id, data, position),
            )
        row = _load_visible(cur, memory_id, me["id"])
        return _memory(row, _photo_links(cur, [memory_id])[memory_id], me["id"])


@router.get("/memories/{memory_id}")
def get_memory(memory_id: int, me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        row = _load_visible(cur, memory_id, me["id"])
        return _memory(row, _photo_links(cur, [memory_id])[memory_id], me["id"])


def _load_own(cur, memory_id, me_id):
    """The memory if it's yours. Anyone else gets 404, as if it didn't exist."""
    row = _load_visible(cur, memory_id, me_id)
    if row["author_id"] != me_id:
        raise HTTPException(status_code=404, detail="This memory could not be found.")
    return row


@router.patch("/memories/{memory_id}")
def update_memory(memory_id: int, body: MemoryUpdate, me: CurrentUser):
    changes = body.model_dump(exclude_unset=True, exclude_none=True)
    with get_connection() as conn, conn.cursor() as cur:
        _load_own(cur, memory_id, me["id"])
        if "caption" in changes and not changes["caption"]:
            cur.execute("SELECT count(*) AS n FROM memory_photos WHERE memory_id = %s", (memory_id,))
            if cur.fetchone()["n"] == 0:
                raise HTTPException(status_code=422, detail="A memory without photos needs a caption.")
        if changes:
            # The names come from MemoryUpdate, never from the request text, so this is safe.
            assignments = ", ".join(f"{field} = %s" for field in changes)
            cur.execute(
                f"UPDATE memories SET {assignments}, updated_at = now() WHERE id = %s",
                [*changes.values(), memory_id],
            )
        row = _load_visible(cur, memory_id, me["id"])
        return _memory(row, _photo_links(cur, [memory_id])[memory_id], me["id"])


@router.delete("/memories/{memory_id}")
def delete_memory(memory_id: int, me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        _load_own(cur, memory_id, me["id"])
        # Photos, reactions and comments go with it (ON DELETE CASCADE).
        cur.execute("DELETE FROM memories WHERE id = %s", (memory_id,))
    return {"deleted": True}


# ---------- Reactions ----------

def _reaction_state(cur, memory_id, me_id):
    cur.execute(
        "SELECT count(*) AS n, bool_or(user_id = %s) AS mine FROM memory_reactions WHERE memory_id = %s",
        (me_id, memory_id),
    )
    row = cur.fetchone()
    return {"reaction_count": row["n"], "reacted_by_me": bool(row["mine"])}


@router.post("/memories/{memory_id}/reaction")
def add_reaction(memory_id: int, me: CurrentUser):
    reaction_limit.check(f"user:{me['id']}")
    with get_connection() as conn, conn.cursor() as cur:
        row = _load_visible(cur, memory_id, me["id"])
        cur.execute(
            "INSERT INTO memory_reactions (memory_id, user_id) VALUES (%s, %s) ON CONFLICT DO NOTHING RETURNING 1",
            (memory_id, me["id"]),
        )
        added = cur.fetchone() is not None
        link = f"/memories?id={memory_id}"
        if added and row["author_id"] != me["id"]:
            # Only the first ❤️ from each person notifies the author, so toggling doesn't spam them.
            cur.execute(
                "SELECT 1 FROM notifications WHERE user_id = %s AND actor_id = %s AND kind = 'memory_reaction' AND link = %s",
                (row["author_id"], me["id"], link),
            )
            if not cur.fetchone():
                notify(cur, row["author_id"], "memory_reaction", f"{me['name']} reacted ❤️ to your memory", link, me["id"])
        return _reaction_state(cur, memory_id, me["id"])


@router.delete("/memories/{memory_id}/reaction")
def remove_reaction(memory_id: int, me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        _load_visible(cur, memory_id, me["id"])
        cur.execute("DELETE FROM memory_reactions WHERE memory_id = %s AND user_id = %s", (memory_id, me["id"]))
        return _reaction_state(cur, memory_id, me["id"])


# ---------- Comments ----------

class NewComment(BaseModel):
    model_config = ConfigDict(extra="forbid")
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]


def _comment(row, memory_author_id, me_id):
    return {
        "id": row["id"],
        "body": row["body"],
        "created_at": row["created_at"],
        "author": mini_profile({**row, "id": row["author_id"]}),
        "mine": row["author_id"] == me_id,
        # You can delete your own comments, and any comment on your own memory.
        "can_delete": row["author_id"] == me_id or memory_author_id == me_id,
    }


@router.get("/memories/{memory_id}/comments")
def list_comments(memory_id: int, me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        memory = _load_visible(cur, memory_id, me["id"])
        cur.execute(
            """
            SELECT c.id, c.body, c.created_at, c.author_id, u.name, u.avatar_emoji, u.avatar_color, u.photo_id, u.is_demo
            FROM memory_comments c JOIN users u ON u.id = c.author_id
            WHERE c.memory_id = %s ORDER BY c.id LIMIT 200
            """,
            (memory_id,),
        )
        rows = cur.fetchall()
        hidden = blocked_ids(cur, me["id"])
    return [_comment(row, memory["author_id"], me["id"]) for row in rows if row["author_id"] not in hidden]


@router.post("/memories/{memory_id}/comments", status_code=201)
def add_comment(memory_id: int, body: NewComment, me: CurrentUser):
    comment_limit.check(f"user:{me['id']}")
    with get_connection() as conn, conn.cursor() as cur:
        memory = _load_visible(cur, memory_id, me["id"])
        cur.execute(
            """
            INSERT INTO memory_comments (memory_id, author_id, body) VALUES (%s, %s, %s)
            RETURNING id, body, created_at, author_id
            """,
            (memory_id, me["id"], body.body),
        )
        row = cur.fetchone()
        notify(cur, memory["author_id"], "memory_comment", f"{me['name']} commented on your memory",
               f"/memories?id={memory_id}", me["id"])
    return _comment({**row, **{k: me[k] for k in ("name", "avatar_emoji", "avatar_color", "photo_id", "is_demo")}},
                    memory["author_id"], me["id"])


@router.delete("/memories/{memory_id}/comments/{comment_id}")
def delete_comment(memory_id: int, comment_id: int, me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        memory = _load_visible(cur, memory_id, me["id"])
        cur.execute(
            "SELECT author_id FROM memory_comments WHERE id = %s AND memory_id = %s", (comment_id, memory_id)
        )
        comment = cur.fetchone()
        if not comment or me["id"] not in (comment["author_id"], memory["author_id"]):
            raise HTTPException(status_code=404, detail="This comment could not be found.")
        cur.execute("DELETE FROM memory_comments WHERE id = %s", (comment_id,))
    return {"deleted": True}
