"""The moderators' area. Every endpoint here checks the person's role on the server.

GET  /api/moderation/reports?status=open          the report queue (open, dismissed or actioned)
POST /api/moderation/reports/{id}/dismiss         {"note": "..."} close a report without action
POST /api/moderation/reports/{id}/remove-content  {"note": "..."} remove what was reported
POST /api/moderation/users/{id}/suspend           {"reason": "...", "report_id": 3} block someone from Meerkat
POST /api/moderation/users/{id}/unsuspend         {"note": "..."}
GET  /api/moderation/actions                      the log of every moderator action (never edited)
GET  /api/moderation/privacy-requests             privacy requests (admins only)
POST /api/moderation/privacy-requests/{id}/done   mark one as handled (admins only)

Roles: member (everyone), moderator, admin. Give someone a role from the server with:
    python -m app.roles set someone@example.com moderator
Only moderators see who made a report. Reported people are never told who reported them.
There is no automatic or round-the-clock moderation: reports wait here until a person reviews them.
"""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, StringConstraints

from app.auth import CurrentUser
from app.db import get_connection
from app.safety import REPORT_REASONS
from app.users import mini_profile

router = APIRouter(prefix="/api/moderation")

Note = Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)]


def require_moderator(me: CurrentUser):
    if me["role"] not in ("moderator", "admin"):
        raise HTTPException(status_code=403, detail="Only moderators can see this.")
    return me


def require_admin(me: CurrentUser):
    if me["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can see this.")
    return me


Moderator = Annotated[dict, Depends(require_moderator)]
Admin = Annotated[dict, Depends(require_admin)]


def log_action(cur, moderator_id, action, report_id=None, target_type="", target_id=None, note=""):
    cur.execute(
        """
        INSERT INTO moderation_actions (moderator_id, action, report_id, target_type, target_id, note)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (moderator_id, action, report_id, target_type, target_id, note),
    )


def current_content(cur, target_type, target_id):
    """What the reported item says now (None if it's already gone)."""
    queries = {
        "profile": "SELECT name || ': ' || hook || ' / ' || bio AS text FROM users WHERE id = %s",
        "message": "SELECT body AS text FROM messages WHERE id = %s",
        "group": "SELECT name || ': ' || description AS text FROM groups WHERE id = %s",
        "group_post": "SELECT body AS text FROM group_posts WHERE id = %s",
        "event": "SELECT title || ': ' || description AS text FROM events WHERE id = %s",
        "memory": "SELECT caption AS text FROM memories WHERE id = %s AND removed_at IS NULL",
    }
    if target_type == "memory":
        cur.execute("SELECT to_regclass('memories') AS t")
        if not cur.fetchone()["t"]:
            return None
    cur.execute(queries[target_type], (target_id,))
    row = cur.fetchone()
    return row["text"] if row else None


def load_report(cur, report_id):
    cur.execute("SELECT * FROM reports WHERE id = %s", (report_id,))
    report = cur.fetchone()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found.")
    return report


def person(cur, user_id):
    if user_id is None:
        return None
    cur.execute(
        "SELECT id, name, avatar_emoji, avatar_color, photo_id, is_demo, suspended_at FROM users WHERE id = %s", (user_id,)
    )
    row = cur.fetchone()
    return {**mini_profile(row), "suspended": bool(row["suspended_at"])} if row else None


@router.get("/reports")
def report_queue(me: Moderator, status: Literal["open", "dismissed", "actioned"] = "open"):
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT * FROM reports WHERE status = %s ORDER BY created_at " + ("ASC" if status == "open" else "DESC") + " LIMIT 100",
            (status,),
        )
        reports = cur.fetchall()
        result = []
        for r in reports:
            result.append({
                "id": r["id"],
                "target_type": r["target_type"],
                "target_id": r["target_id"],
                "reason": r["reason"],
                "reason_label": REPORT_REASONS.get(r["reason"], r["reason"]),
                "details": r["details"],
                "snapshot": r["snapshot"],
                "current_content": current_content(cur, r["target_type"], r["target_id"]),
                "reported_person": person(cur, r["target_user_id"]),
                "reporter": person(cur, r["reporter_id"]),
                "status": r["status"],
                "created_at": r["created_at"],
                "handled_at": r["handled_at"],
            })
    return result


class NoteBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    note: Note = ""


@router.post("/reports/{report_id}/dismiss")
def dismiss(report_id: int, body: NoteBody, me: Moderator):
    with get_connection() as conn, conn.cursor() as cur:
        report = load_report(cur, report_id)
        if report["status"] != "open":
            raise HTTPException(status_code=409, detail="This report was already handled.")
        cur.execute("UPDATE reports SET status = 'dismissed', handled_by = %s, handled_at = now() WHERE id = %s",
                    (me["id"], report_id))
        log_action(cur, me["id"], "dismiss_report", report_id, report["target_type"], report["target_id"], body.note)
    return {"status": "dismissed"}


def remove_target(cur, moderator_id, target_type, target_id):
    """Removes the reported item. Returns False if it was already gone."""
    if target_type == "message":
        cur.execute("DELETE FROM messages WHERE id = %s RETURNING 1", (target_id,))
    elif target_type == "group_post":
        cur.execute("DELETE FROM group_posts WHERE id = %s RETURNING 1", (target_id,))
    elif target_type == "event":
        cur.execute("DELETE FROM events WHERE id = %s RETURNING 1", (target_id,))
    elif target_type == "group":
        cur.execute("DELETE FROM groups WHERE id = %s RETURNING 1", (target_id,))
    elif target_type == "memory":
        cur.execute(
            "UPDATE memories SET removed_at = now(), removed_by = %s WHERE id = %s AND removed_at IS NULL RETURNING 1",
            (moderator_id, target_id),
        )
    elif target_type == "profile":
        # A profile itself stays (the account may be suspended separately); its own words and photo go.
        cur.execute(
            "UPDATE users SET hook = '', bio = '', photo_id = NULL, updated_at = now() WHERE id = %s RETURNING 1",
            (target_id,),
        )
        cur.execute("DELETE FROM photos WHERE user_id = %s", (target_id,))
    else:
        return False
    return cur.fetchone() is not None if target_type != "profile" else True


@router.post("/reports/{report_id}/remove-content")
def remove_content(report_id: int, body: NoteBody, me: Moderator):
    with get_connection() as conn, conn.cursor() as cur:
        report = load_report(cur, report_id)
        if report["status"] != "open":
            raise HTTPException(status_code=409, detail="This report was already handled.")
        removed = remove_target(cur, me["id"], report["target_type"], report["target_id"])
        # Close every open report about the same item, since it has been dealt with.
        cur.execute(
            """
            UPDATE reports SET status = 'actioned', handled_by = %s, handled_at = now()
            WHERE target_type = %s AND target_id = %s AND status = 'open'
            """,
            (me["id"], report["target_type"], report["target_id"]),
        )
        log_action(cur, me["id"], "remove_content", report_id, report["target_type"], report["target_id"], body.note)
    return {"status": "actioned", "removed": removed}


class SuspendBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=500)]
    report_id: int | None = None


@router.post("/users/{user_id}/suspend")
def suspend(user_id: int, body: SuspendBody, me: Moderator):
    if user_id == me["id"]:
        raise HTTPException(status_code=400, detail="You can't suspend yourself.")
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT role FROM users WHERE id = %s", (user_id,))
        target = cur.fetchone()
        if not target:
            raise HTTPException(status_code=404, detail="Person not found.")
        if target["role"] == "admin" and me["role"] != "admin":
            raise HTTPException(status_code=403, detail="Only an admin can suspend an admin.")
        cur.execute("UPDATE users SET suspended_at = now(), suspended_reason = %s WHERE id = %s", (body.reason, user_id))
        if body.report_id:
            cur.execute(
                "UPDATE reports SET status = 'actioned', handled_by = %s, handled_at = now() WHERE id = %s AND status = 'open'",
                (me["id"], body.report_id),
            )
        log_action(cur, me["id"], "suspend_user", body.report_id, "profile", user_id, body.reason)
    return {"suspended": True}


@router.post("/users/{user_id}/unsuspend")
def unsuspend(user_id: int, body: NoteBody, me: Moderator):
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("UPDATE users SET suspended_at = NULL, suspended_reason = '' WHERE id = %s RETURNING 1", (user_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Person not found.")
        log_action(cur, me["id"], "unsuspend_user", None, "profile", user_id, body.note)
    return {"suspended": False}


@router.get("/actions")
def action_log(me: Moderator):
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT a.id, a.action, a.report_id, a.target_type, a.target_id, a.note, a.created_at,
                   u.name AS moderator_name
            FROM moderation_actions a LEFT JOIN users u ON u.id = a.moderator_id
            ORDER BY a.id DESC LIMIT 100
            """
        )
        return cur.fetchall()


@router.get("/privacy-requests")
def privacy_requests(me: Admin, status: Literal["open", "done"] = "open"):
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT r.id, r.kind, r.details, r.contact_email, r.status, r.created_at, r.handled_at, r.user_id,
                   u.name AS user_name
            FROM privacy_requests r LEFT JOIN users u ON u.id = r.user_id
            WHERE r.status = %s ORDER BY r.created_at
            """,
            (status,),
        )
        return cur.fetchall()


@router.post("/privacy-requests/{request_id}/done")
def privacy_request_done(request_id: int, body: NoteBody, me: Admin):
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            "UPDATE privacy_requests SET status = 'done', handled_at = now() WHERE id = %s AND status = 'open' RETURNING 1",
            (request_id,),
        )
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="No open request with that number.")
        log_action(cur, me["id"], "privacy_request_done", None, "privacy_request", request_id, body.note)
    return {"status": "done"}
