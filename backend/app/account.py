"""Settings: accepting the Terms, contact details, notification choices, optional features, your data.

POST  /api/me/accept-terms        {"accept": true, "version": "..."} accept the current Terms
PATCH /api/me/email               {"new_email": "...", "current_password": "..."} change your login email
PATCH /api/me/phone               {"phone": "+14165550123"} or {"phone": null} (always private)
PATCH /api/me/notification-prefs  {"messages": false, ...} switch kinds of notifications on or off
PUT   /api/me/consents/{key}      {"granted": true} turn an optional feature on or off
GET   /api/me/export              download a copy of your data (JSON)
POST  /api/privacy-requests       {"kind": "deletion", "details": "..."} ask the team about your data
GET   /api/privacy-requests       your own requests and their status

(Display name, privacy and availability settings are changed with PATCH /api/me in app/profiles.py.)
Changing a verified email or phone number removes its "verified" label until it's checked again.
"""

from datetime import datetime, timezone
from typing import Annotated, Literal

import psycopg2
from fastapi import APIRouter, HTTPException
from psycopg2.extras import Json
from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints

from app import config
from app.auth import CurrentUser
from app.db import get_connection
from app.notifications import CATEGORIES
from app.ratelimit import RateLimiter
from app.security import verify_password
from app.users import USER_COLUMNS, own_profile

router = APIRouter(prefix="/api")

password_check_limit = RateLimiter(10, 600, "Too many attempts. Wait 10 minutes and try again.")
privacy_request_limit = RateLimiter(5, 86400, "You've sent several requests today. We'll reply to those first.")

# Optional features. Each is a separate choice, never bundled into accepting the Terms.
CONSENTS = {
    "ai_features": (
        "Use Google Gemini for match notes and hangout suggestions. Only shared interests, friendship goals, "
        "university and shared free times are sent, never names, photos, messages or contact details."
    ),
    "location_suggestions": (
        "Use the approximate meeting area you choose to suggest a halfway meeting area and nearby places. "
        "Other people never see your starting point."
    ),
}


class AcceptTerms(BaseModel):
    accept: bool
    version: str


@router.post("/me/accept-terms")
def accept_terms(body: AcceptTerms, me: CurrentUser):
    if not body.accept:
        raise HTTPException(status_code=422, detail="Tick the box to accept the Terms, or log out.")
    if body.version != config.TERMS_VERSION:
        raise HTTPException(status_code=409, detail="The Terms have changed. Reload the page and read the new version.")
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            f"""
            UPDATE users SET terms_version = %s, terms_accepted_at = now(), adult_confirmed_at = now()
            WHERE id = %s RETURNING {USER_COLUMNS}
            """,
            (config.TERMS_VERSION, me["id"]),
        )
        return own_profile(cur.fetchone())


class EmailChange(BaseModel):
    new_email: EmailStr
    current_password: str = Field(min_length=1, max_length=128)


@router.patch("/me/email")
def change_email(body: EmailChange, me: CurrentUser):
    if me["is_demo"]:
        raise HTTPException(status_code=403, detail="Demo accounts can't change their email.")
    password_check_limit.check(f"user:{me['id']}")
    new_email = body.new_email.lower()
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT password_hash FROM users WHERE id = %s", (me["id"],))
        if not verify_password(body.current_password, cur.fetchone()["password_hash"]):
            raise HTTPException(status_code=403, detail="That password isn't right.")
        if new_email == me["email"]:
            return own_profile(me)
        try:
            # A new address hasn't been checked yet, so it starts unverified.
            cur.execute(
                f"UPDATE users SET email = %s, email_verified_at = NULL, updated_at = now() WHERE id = %s RETURNING {USER_COLUMNS}",
                (new_email, me["id"]),
            )
        except psycopg2.errors.UniqueViolation:
            raise HTTPException(status_code=409, detail="Another account already uses that email.")
        user = cur.fetchone()
        cur.execute("UPDATE contact_verifications SET used_at = now() WHERE user_id = %s AND channel = 'email' AND used_at IS NULL", (me["id"],))
    return own_profile(user)


Phone = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^\+[1-9][0-9]{7,14}$")]


class PhoneChange(BaseModel):
    model_config = ConfigDict(extra="forbid")
    phone: Phone | None  # international format, like +14165550123; null removes it


@router.patch("/me/phone")
def change_phone(body: PhoneChange, me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        if body.phone == me["phone"]:
            return own_profile(me)
        cur.execute(
            f"UPDATE users SET phone = %s, phone_verified_at = NULL, updated_at = now() WHERE id = %s RETURNING {USER_COLUMNS}",
            (body.phone, me["id"]),
        )
        user = cur.fetchone()
        cur.execute("UPDATE contact_verifications SET used_at = now() WHERE user_id = %s AND channel = 'phone' AND used_at IS NULL", (me["id"],))
    return own_profile(user)


@router.patch("/me/notification-prefs")
def change_notification_prefs(body: dict[str, bool], me: CurrentUser):
    unknown = set(body) - set(CATEGORIES)
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unknown notification type: {', '.join(sorted(unknown))}")
    prefs = {**(me["notification_prefs"] or {}), **body}
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            f"UPDATE users SET notification_prefs = %s WHERE id = %s RETURNING {USER_COLUMNS}",
            (Json(prefs), me["id"]),
        )
        return own_profile(cur.fetchone())


class ConsentChange(BaseModel):
    granted: bool


@router.put("/me/consents/{key}")
def change_consent(key: str, body: ConsentChange, me: CurrentUser):
    if key not in CONSENTS:
        raise HTTPException(status_code=404, detail="Unknown setting.")
    consents = dict(me["consents"] or {})
    consents[key] = {"granted": body.granted, "at": datetime.now(timezone.utc).isoformat()}
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(f"UPDATE users SET consents = %s WHERE id = %s RETURNING {USER_COLUMNS}", (Json(consents), me["id"]))
        user = cur.fetchone()
        if key == "location_suggestions" and not body.granted:
            # Turning location off also forgets the saved meeting area (app/planning.py), if that feature exists.
            cur.execute("SELECT to_regclass('meeting_origins') AS t")
            if cur.fetchone()["t"]:
                cur.execute("DELETE FROM meeting_origins WHERE user_id = %s", (me["id"],))
    return own_profile(user)


@router.get("/me/consents")
def list_consents(me: CurrentUser):
    return [
        {"key": key, "description": description, "granted": bool(((me["consents"] or {}).get(key) or {}).get("granted"))}
        for key, description in CONSENTS.items()
    ]


# ---------- Your data ----------

# (name in the download, SQL with %(me)s). Features add their own tables here.
# Tables that don't exist yet are skipped.
EXPORT_QUERIES = [
    ("friendships", "friendships", "SELECT * FROM friendships WHERE requester_id = %(me)s OR addressee_id = %(me)s"),
    ("messages", "messages", "SELECT * FROM messages WHERE sender_id = %(me)s OR recipient_id = %(me)s ORDER BY id"),
    ("groups_joined", "group_members", "SELECT group_id, joined_at FROM group_members WHERE user_id = %(me)s"),
    ("group_posts", "group_posts", "SELECT id, group_id, body, created_at FROM group_posts WHERE author_id = %(me)s"),
    ("events_organised", "events", "SELECT id, title, starts_at, ends_at, location FROM events WHERE organiser_id = %(me)s"),
    ("event_rsvps", "event_rsvps", "SELECT event_id, created_at FROM event_rsvps WHERE user_id = %(me)s"),
    ("notifications", "notifications", "SELECT kind, text, created_at, read_at FROM notifications WHERE user_id = %(me)s"),
    ("in_app_time", "app_time", "SELECT at, seconds FROM app_time WHERE user_id = %(me)s ORDER BY at"),
    ("blocks", "blocks", "SELECT blocked_id, created_at FROM blocks WHERE blocker_id = %(me)s"),
    ("reports_made", "reports", "SELECT target_type, target_id, reason, details, status, created_at FROM reports WHERE reporter_id = %(me)s"),
    ("privacy_requests", "privacy_requests", "SELECT kind, details, status, created_at FROM privacy_requests WHERE user_id = %(me)s"),
    ("memories", "memories", "SELECT id, caption, audience, created_at, updated_at FROM memories WHERE author_id = %(me)s"),
    ("commitments", "commitments", "SELECT * FROM commitments WHERE user_id = %(me)s"),
    ("screen_time_entries", "screen_time_entries", "SELECT * FROM screen_time_entries WHERE user_id = %(me)s"),
    ("screen_time_groups", "st_members", "SELECT group_id, status, joined_at, left_at FROM st_members WHERE user_id = %(me)s"),
    ("memory_comments", "memory_comments", "SELECT memory_id, body, created_at FROM memory_comments WHERE author_id = %(me)s"),
    ("planning_permissions", "planning_consents", "SELECT scope, group_id, created_at FROM planning_consents WHERE user_id = %(me)s"),
    ("meeting_area", "meeting_origins", "SELECT label, lat, lng, source, updated_at FROM meeting_origins WHERE user_id = %(me)s"),
    ("buffer_minutes", "users", "SELECT buffer_minutes FROM users WHERE id = %(me)s"),
]


@router.get("/me/export")
def export_my_data(me: CurrentUser):
    """Everything Meerkat stores about you (photo files are listed, not included)."""
    data = {"profile": own_profile(me)}
    with get_connection() as conn, conn.cursor() as cur:
        for name, table, sql in EXPORT_QUERIES:
            cur.execute("SELECT to_regclass(%s) AS t", (table,))
            if cur.fetchone()["t"]:
                cur.execute(sql, {"me": me["id"]})
                data[name] = cur.fetchall()
    return data


class PrivacyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["access", "correction", "deletion", "withdraw_consent", "other"]
    details: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)] = ""


@router.post("/privacy-requests", status_code=201)
def create_privacy_request(body: PrivacyRequest, me: CurrentUser):
    privacy_request_limit.check(f"user:{me['id']}")
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO privacy_requests (user_id, kind, details, contact_email) VALUES (%s, %s, %s, %s) RETURNING id, status, created_at",
            (me["id"], body.kind, body.details, me["email"]),
        )
        return cur.fetchone()


@router.get("/privacy-requests")
def my_privacy_requests(me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT id, kind, details, status, created_at, handled_at FROM privacy_requests WHERE user_id = %s ORDER BY id DESC",
            (me["id"],),
        )
        return cur.fetchall()
