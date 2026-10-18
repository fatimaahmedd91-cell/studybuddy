"""Groups: list, create, join, leave, and a simple discussion for members.

GET  /api/groups                  all groups (?q= search, ?tag= filter, ?mine=true only yours)
POST /api/groups                  create one: {"name", "description", "tags"}; you join it automatically
GET  /api/groups/{id}             details, members, and upcoming events
POST /api/groups/{id}/join
POST /api/groups/{id}/leave
GET  /api/groups/{id}/posts       the discussion (members only)
POST /api/groups/{id}/posts       write in the discussion (members only): {"body": "..."}
"""

from typing import Annotated

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.auth import CurrentUser
from app.db import get_connection
from app.notifications import notify
from app.ratelimit import RateLimiter
from app.safety import blocked_ids
from app.users import mini_profile

router = APIRouter(prefix="/api")

create_limit = RateLimiter(10, 3600, "You've created a lot of groups. Try again in an hour.")
post_limit = RateLimiter(20, 60, "You're posting very quickly. Wait a minute and try again.")

Tag = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=24)]


class GroupCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=60)]
    description: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] = ""
    tags: list[Tag] = Field(default=[], max_length=6)


class GroupPost(BaseModel):
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]


GROUP_FIELDS = """
    g.id, g.name, g.description, g.tags, g.created_by, g.is_demo, g.created_at,
    (SELECT count(*) FROM group_members m WHERE m.group_id = g.id) AS member_count,
    EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = g.id AND m.user_id = %(me)s) AS is_member,
    (SELECT min(e.starts_at) FROM events e WHERE e.group_id = g.id AND e.starts_at > now()) AS next_event_at
"""


def _group(row, my_id):
    return {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"],
        "tags": row["tags"],
        "member_count": row["member_count"],
        "is_member": row["is_member"],
        "is_owner": row["created_by"] == my_id,
        "is_demo": row["is_demo"],
        "next_event_at": row["next_event_at"],
        "created_at": row["created_at"],
    }


def _load_group(cur, group_id, my_id):
    cur.execute(f"SELECT {GROUP_FIELDS} FROM groups g WHERE g.id = %(id)s", {"me": my_id, "id": group_id})
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="This group could not be found.")
    return row


def _is_member(cur, group_id, user_id):
    cur.execute("SELECT 1 FROM group_members WHERE group_id = %s AND user_id = %s", (group_id, user_id))
    return cur.fetchone() is not None


@router.get("/groups")
def list_groups(me: CurrentUser, q: str = "", tag: str = "", mine: bool = False):
    conditions, params = ["TRUE"], {"me": me["id"]}
    if q.strip():
        conditions.append("(g.name ILIKE %(q)s OR g.description ILIKE %(q)s)")
        params["q"] = f"%{q.strip()[:60]}%"
    if tag.strip():
        conditions.append("EXISTS (SELECT 1 FROM unnest(g.tags) AS t WHERE lower(t) = lower(%(tag)s))")
        params["tag"] = tag.strip()
    if mine:
        conditions.append("EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = g.id AND m.user_id = %(me)s)")
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            f"SELECT {GROUP_FIELDS} FROM groups g WHERE {' AND '.join(conditions)}"
            " ORDER BY is_member DESC, member_count DESC, g.created_at DESC LIMIT 200",
            params,
        )
        rows = cur.fetchall()
    return [_group(row, me["id"]) for row in rows]


@router.post("/groups", status_code=201)
def create_group(body: GroupCreate, me: CurrentUser):
    create_limit.check(me["id"])
    tags = list(dict.fromkeys(body.tags))  # remove repeats, keep order
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO groups (name, description, tags, created_by, is_demo) VALUES (%s, %s, %s, %s, %s) RETURNING id",
            (body.name, body.description, tags, me["id"], me["is_demo"]),  # a demo account's groups are demo too
        )
        group_id = cur.fetchone()["id"]
        cur.execute("INSERT INTO group_members (group_id, user_id) VALUES (%s, %s)", (group_id, me["id"]))
    return get_group(group_id, me)


@router.get("/groups/{group_id}")
def get_group(group_id: int, me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        group = _group(_load_group(cur, group_id, me["id"]), me["id"])
        cur.execute(
            "SELECT u.id, u.name, u.avatar_emoji, u.avatar_color, u.photo_id, u.is_demo FROM group_members m"
            " JOIN users u ON u.id = m.user_id WHERE m.group_id = %s ORDER BY m.joined_at LIMIT 200",
            (group_id,),
        )
        group["members"] = [mini_profile(row) for row in cur.fetchall()]
        cur.execute(
            "SELECT e.id, e.title, e.starts_at, e.location, e.online_url,"
            " (SELECT count(*) FROM event_rsvps r WHERE r.event_id = e.id) AS going_count"
            " FROM events e WHERE e.group_id = %s AND e.starts_at > now() ORDER BY e.starts_at LIMIT 20",
            (group_id,),
        )
        group["events"] = cur.fetchall()
    return group


@router.post("/groups/{group_id}/join")
def join_group(group_id: int, me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        row = _load_group(cur, group_id, me["id"])
        if row["is_member"]:
            raise HTTPException(status_code=409, detail="You're already in this group.")
        cur.execute("INSERT INTO group_members (group_id, user_id) VALUES (%s, %s)", (group_id, me["id"]))
        if row["created_by"]:
            notify(cur, row["created_by"], "group_join", f"{me['name']} joined your group {row['name']}",
                   f"/groups?id={group_id}", me["id"])
    return get_group(group_id, me)


@router.post("/groups/{group_id}/leave")
def leave_group(group_id: int, me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        _load_group(cur, group_id, me["id"])
        cur.execute("DELETE FROM group_members WHERE group_id = %s AND user_id = %s RETURNING 1", (group_id, me["id"]))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="You're not in this group.")
    return get_group(group_id, me)


@router.get("/groups/{group_id}/posts")
def list_posts(group_id: int, me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        _load_group(cur, group_id, me["id"])
        if not _is_member(cur, group_id, me["id"]):
            raise HTTPException(status_code=403, detail="Join the group to read its discussion.")
        cur.execute(
            """
            SELECT * FROM (
                SELECT p.id, p.body, p.created_at, u.id AS author_id, u.name, u.avatar_emoji, u.avatar_color,
                       u.photo_id, u.is_demo
                FROM group_posts p JOIN users u ON u.id = p.author_id
                WHERE p.group_id = %s ORDER BY p.id DESC LIMIT 100
            ) recent ORDER BY id
            """,
            (group_id,),
        )
        # Posts by someone you blocked (or who blocked you) are hidden from you. See app/safety.py.
        rows = cur.fetchall()
        hidden = blocked_ids(cur, me["id"])
        rows = [row for row in rows if row["author_id"] not in hidden]
    return [
        {
            "id": r["id"],
            "body": r["body"],
            "created_at": r["created_at"],
            "author": mini_profile({**r, "id": r["author_id"]}),
            "mine": r["author_id"] == me["id"],
        }
        for r in rows
    ]


@router.post("/groups/{group_id}/posts", status_code=201)
def create_post(group_id: int, body: GroupPost, me: CurrentUser):
    post_limit.check(me["id"])
    with get_connection() as conn, conn.cursor() as cur:
        _load_group(cur, group_id, me["id"])
        if not _is_member(cur, group_id, me["id"]):
            raise HTTPException(status_code=403, detail="Join the group to write in its discussion.")
        cur.execute(
            "INSERT INTO group_posts (group_id, author_id, body) VALUES (%s, %s, %s) RETURNING id, body, created_at",
            (group_id, me["id"], body.body),
        )
        row = cur.fetchone()
    return {**row, "author": mini_profile(me), "mine": True}
