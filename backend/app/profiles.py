"""Your own profile, profile photos, account deletion, and the shared option lists.

GET    /api/me          your profile (only ever your own: the id comes from your login token)
PATCH  /api/me          change some profile fields
DELETE /api/me          delete your account and everything linked to it
PUT    /api/me/photo    upload a profile photo (JPEG)
DELETE /api/me/photo    remove it
GET    /api/photos/{id} the photo file itself
GET    /api/options     lists used by the sign-up form (goals, interests, universities, days)
"""

import base64
import binascii
import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Response
from psycopg2.extras import Json
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.auth import CurrentUser
from app.db import get_connection
from app.options import DAYS, FRIENDSHIP_GOALS, MIN_AGE, SLOTS, SUGGESTED_INTERESTS, SUGGESTED_UNIVERSITIES
from app.users import USER_COLUMNS, is_complete, own_profile

router = APIRouter(prefix="/api")


def text(max_length, min_length=0):
    """A string with spaces trimmed from both ends and a length limit."""
    return Annotated[str, StringConstraints(strip_whitespace=True, min_length=min_length, max_length=max_length)]


Goal = Literal[tuple(FRIENDSHIP_GOALS)]
Day = Literal[tuple(DAYS)]
Slot = Literal[tuple(SLOTS)]


class ProfileUpdate(BaseModel):
    """Every field is optional: send only what changed. Unknown fields are refused."""

    model_config = ConfigDict(extra="forbid")

    name: text(60, 1) | None = None
    pronouns: text(30) | None = None
    age: int | None = Field(default=None, ge=MIN_AGE, le=99)
    university: text(80) | None = None
    hook: text(120) | None = None
    bio: text(600) | None = None
    interests: list[text(30, 1)] | None = Field(default=None, max_length=12)
    looking_for: list[Goal] | None = Field(default=None, max_length=len(FRIENDSHIP_GOALS))
    availability: dict[Day, list[Slot]] | None = None
    avatar_emoji: text(8, 1) | None = None
    avatar_color: Annotated[str, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$")] | None = None
    stickers: bool | None = None
    daily_goal_minutes: int | None = Field(default=None, ge=5, le=600)


# These may be cleared by sending null. Everything else needs a value.
NULLABLE = {"age", "daily_goal_minutes"}


def _dedupe(items):
    """Removes repeats, ignoring capitals, and keeps the first spelling."""
    seen, result = set(), []
    for item in items:
        if item.lower() not in seen:
            seen.add(item.lower())
            result.append(item)
    return result


@router.get("/me")
def get_me(me: CurrentUser):
    return own_profile(me)


@router.patch("/me")
def update_me(body: ProfileUpdate, me: CurrentUser):
    changes = body.model_dump(exclude_unset=True)
    for field, value in changes.items():
        if value is None and field not in NULLABLE:
            raise HTTPException(status_code=422, detail=f"{field} cannot be empty.")
    if "interests" in changes:
        changes["interests"] = _dedupe(changes["interests"])
    if "looking_for" in changes:
        changes["looking_for"] = _dedupe(changes["looking_for"])
    if "availability" in changes:
        # Keep days and slots in a fixed order, without repeats or empty days.
        changes["availability"] = {
            day: [slot for slot in SLOTS if slot in changes["availability"].get(day, [])]
            for day in DAYS
            if changes["availability"].get(day)
        }
    if not changes:
        return own_profile(me)

    # Build "name = %s, hook = %s, ..." from the field names. The names come from ProfileUpdate,
    # never from the request text, so this is safe; the values are passed separately.
    assignments = ", ".join(f"{field} = %s" for field in changes)
    # Json(...) stores the timetable dict in the JSONB column.
    values = [Json(v) if isinstance(v, dict) else v for v in changes.values()]
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            f"UPDATE users SET {assignments}, updated_at = now() WHERE id = %s RETURNING {USER_COLUMNS}",
            [*values, me["id"]],
        )
        user = cur.fetchone()
        complete = is_complete(user)
        if complete != user["onboarded"]:
            cur.execute(f"UPDATE users SET onboarded = %s WHERE id = %s RETURNING {USER_COLUMNS}", (complete, me["id"]))
            user = cur.fetchone()
    return own_profile(user)


class DeleteAccount(BaseModel):
    confirm: str


@router.delete("/me")
def delete_me(body: DeleteAccount, me: CurrentUser):
    if body.confirm != "DELETE":
        raise HTTPException(status_code=422, detail='Type DELETE to confirm.')
    with get_connection() as conn, conn.cursor() as cur:
        # Friendships, messages, memberships, RSVPs, photos and notifications go with it (ON DELETE CASCADE).
        cur.execute("DELETE FROM users WHERE id = %s", (me["id"],))
    return {"deleted": True}


# ---------- Photos ----------

MAX_PHOTO_BYTES = 2 * 1024 * 1024


class PhotoUpload(BaseModel):
    # A data URL like "data:image/jpeg;base64,...". The website converts any photo to JPEG first.
    image: str = Field(max_length=3_000_000)


def strip_jpeg_metadata(data):
    """Removes EXIF (camera details, GPS location), XMP and comment blocks from a JPEG.

    A JPEG is a list of blocks ("segments"). We copy every block except the metadata ones,
    then copy the image data that starts at the "start of scan" block unchanged.
    Raises ValueError if the bytes are not a valid JPEG.
    """
    if data[:2] != b"\xff\xd8":
        raise ValueError("not a JPEG")
    out = bytearray(b"\xff\xd8")
    i = 2
    while i + 4 <= len(data):
        if data[i] != 0xFF:
            raise ValueError("broken JPEG")
        marker = data[i + 1]
        if marker == 0xDA:  # start of scan: the rest is the picture itself
            out += data[i:]
            return bytes(out)
        length = int.from_bytes(data[i + 2 : i + 4], "big")
        if length < 2:
            raise ValueError("broken JPEG")
        segment = data[i : i + 2 + length]
        # APP1 = EXIF/XMP, APP13 = Photoshop info, COM = comment. Everything else is kept.
        if marker not in (0xE1, 0xED, 0xFE):
            out += segment
        i += 2 + length
    raise ValueError("broken JPEG")


@router.put("/me/photo")
def upload_photo(body: PhotoUpload, me: CurrentUser):
    prefix = "data:image/jpeg;base64,"
    if not body.image.startswith(prefix):
        raise HTTPException(status_code=422, detail="Photos must be JPEG images.")
    try:
        data = base64.b64decode(body.image[len(prefix) :], validate=True)
        data = strip_jpeg_metadata(data)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=422, detail="That file is not a valid JPEG image.")
    if len(data) > MAX_PHOTO_BYTES:
        raise HTTPException(status_code=413, detail="Photos must be 2 MB or smaller.")

    photo_id = uuid.uuid4()
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM photos WHERE user_id = %s", (me["id"],))
        cur.execute(
            "INSERT INTO photos (id, user_id, mime, data) VALUES (%s, %s, 'image/jpeg', %s)",
            (str(photo_id), me["id"], data),
        )
        cur.execute(
            f"UPDATE users SET photo_id = %s, updated_at = now() WHERE id = %s RETURNING {USER_COLUMNS}",
            (str(photo_id), me["id"]),
        )
        user = cur.fetchone()
    return own_profile(user)


@router.delete("/me/photo")
def delete_photo(me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM photos WHERE user_id = %s", (me["id"],))
        cur.execute(
            f"UPDATE users SET photo_id = NULL, updated_at = now() WHERE id = %s RETURNING {USER_COLUMNS}", (me["id"],)
        )
        user = cur.fetchone()
    return own_profile(user)


@router.get("/photos/{photo_id}")
def get_photo(photo_id: uuid.UUID):
    # Photos load in <img> tags, which cannot send a login token. The id is a long random value,
    # so a photo can only be found through a profile that shows it.
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT mime, data FROM photos WHERE id = %s", (str(photo_id),))
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Photo not found.")
    return Response(
        content=bytes(row["data"]),
        media_type=row["mime"],
        # A new upload gets a new id, so the browser may keep this one for a day.
        headers={"Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff"},
    )


@router.get("/options")
def options():
    return {
        "friendship_goals": FRIENDSHIP_GOALS,
        "suggested_interests": SUGGESTED_INTERESTS,
        "suggested_universities": SUGGESTED_UNIVERSITIES,
        "days": DAYS,
        "slots": SLOTS,
        "min_age": MIN_AGE,
    }
