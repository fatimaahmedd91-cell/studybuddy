"""Your PRIVATE schedule: classes, work shifts and other commitments.

GET    /api/commitments                  your commitments, buffer time and time zone
POST   /api/commitments                  add one
PATCH  /api/commitments/{id}             change one of yours
DELETE /api/commitments/{id}             delete one of yours
PATCH  /api/me/schedule-settings         {"buffer_minutes": 15}  travel/buffer time around commitments
POST   /api/commitments/import/ics       {"text": "BEGIN:VCALENDAR..."}  read a calendar file -> proposals
POST   /api/commitments/import/ai        {"file": "data:image/png;base64,...", "consent": true}
                                         read a timetable image or PDF with Gemini -> proposals
POST   /api/commitments/bulk             {"entries": [...], "source": "ics"}  save reviewed proposals

Privacy rules (enforced here, not just in the website):
- Only the owner can list, change or delete a commitment. Every query filters by your own user id,
  so someone else's commitment id simply isn't found (404).
- No endpoint anywhere returns someone else's commitments, titles or locations. Plans (app/planning.py)
  only use them to work out free time, and only when the owner allowed it.
- Imports never save anything by themselves. They return proposals with warnings; the person reviews and
  edits them, then sends the ones they want to /bulk.
- An uploaded timetable file is only kept in memory while Gemini reads it. It is never stored or logged.
"""

import base64
import binascii
import hashlib
import logging
import re
from datetime import date, datetime, time
from typing import Annotated, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, ValidationError

from app import config, prompts
from app.ai import GeminiUnavailable
from app.auth import CurrentUser
from app.db import get_connection
from app.ics import parse_ics
from app.ratelimit import RateLimiter

router = APIRouter(prefix="/api")
log = logging.getLogger("friendfinder")

MAX_COMMITMENTS = 200
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
# The first bytes of each allowed file type, so a renamed file can't pretend to be an image.
FILE_SIGNATURES = {"image/png": b"\x89PNG\r\n\x1a\n", "image/jpeg": b"\xff\xd8\xff", "application/pdf": b"%PDF-"}

ics_limit = RateLimiter(20, 3600, "You've imported a lot of calendar files. Try again in an hour.")
ai_limit = RateLimiter(10, 3600, "You've sent a lot of timetables to Gemini. Try again in an hour.")

COLUMNS = ("id, title, kind, location, recurrence, weekday, start_date, end_date, start_time, end_time, timezone, "
           "source, import_key, created_at, updated_at")


def text(max_length, min_length=0):
    return Annotated[str, StringConstraints(strip_whitespace=True, min_length=min_length, max_length=max_length)]


class CommitmentIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: text(80, 1)
    kind: Literal["class", "work", "other"] = "other"
    location: text(120) = ""
    recurrence: Literal["none", "weekly"] = "none"
    weekday: int | None = Field(default=None, ge=0, le=6)  # 0 = Monday
    start_date: date
    end_date: date | None = None
    start_time: time
    end_time: time  # at or before start_time = ends the next day
    timezone: text(64, 1) | None = None  # empty = your own time zone


class CommitmentPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: text(80, 1) | None = None
    kind: Literal["class", "work", "other"] | None = None
    location: text(120) | None = None
    recurrence: Literal["none", "weekly"] | None = None
    weekday: int | None = Field(default=None, ge=0, le=6)
    start_date: date | None = None
    end_date: date | None = None
    start_time: time | None = None
    end_time: time | None = None
    timezone: text(64, 1) | None = None


def check_commitment(values, user_timezone):
    """Fills in defaults and checks the rules. Raises 422 with a plain message if something is wrong."""
    values = dict(values)
    values["timezone"] = values.get("timezone") or user_timezone
    try:
        ZoneInfo(values["timezone"])
    except (ZoneInfoNotFoundError, ValueError):
        raise HTTPException(status_code=422, detail="That time zone isn't recognised.")
    if values["start_time"] == values["end_time"]:
        raise HTTPException(status_code=422, detail="The start and end time can't be the same.")
    if not date(2000, 1, 1) <= values["start_date"] <= date(2100, 1, 1):
        raise HTTPException(status_code=422, detail="That date doesn't look right.")
    if values["recurrence"] == "none":
        # A one-time commitment happens on its start date only.
        values["weekday"] = None
        values["end_date"] = None
    else:
        if values.get("weekday") is None:
            raise HTTPException(status_code=422, detail="Pick the day of the week it repeats on.")
        if values.get("end_date") and values["end_date"] < values["start_date"]:
            raise HTTPException(status_code=422, detail="The last date must be on or after the first date.")
    for field in ("start_time", "end_time"):
        values[field] = values[field].replace(second=0, microsecond=0, tzinfo=None)
    return values


def public_commitment(row):
    """How YOU see your own commitment. (Nobody else ever sees one.)"""
    return {
        "id": row["id"],
        "title": row["title"],
        "kind": row["kind"],
        "location": row["location"],
        "recurrence": row["recurrence"],
        "weekday": row["weekday"],
        "start_date": row["start_date"].isoformat(),
        "end_date": row["end_date"].isoformat() if row["end_date"] else None,
        "start_time": row["start_time"].strftime("%H:%M"),
        "end_time": row["end_time"].strftime("%H:%M"),
        "overnight": row["end_time"] <= row["start_time"],
        "timezone": row["timezone"],
        "source": row["source"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _insert(cur, user_id, values, source, import_key=None):
    cur.execute(
        f"""
        INSERT INTO commitments (user_id, title, kind, location, recurrence, weekday, start_date, end_date,
                                 start_time, end_time, timezone, source, import_key)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING {COLUMNS}
        """,
        (user_id, values["title"], values["kind"], values["location"], values["recurrence"], values["weekday"],
         values["start_date"], values["end_date"], values["start_time"], values["end_time"], values["timezone"],
         source, import_key),
    )
    return cur.fetchone()


def _count(cur, user_id):
    cur.execute("SELECT count(*) AS n FROM commitments WHERE user_id = %s", (user_id,))
    return cur.fetchone()["n"]


@router.get("/commitments")
def list_commitments(me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            f"SELECT {COLUMNS} FROM commitments WHERE user_id = %s ORDER BY recurrence DESC, weekday, start_date, start_time",
            (me["id"],),
        )
        rows = cur.fetchall()
        cur.execute("SELECT buffer_minutes FROM users WHERE id = %s", (me["id"],))
        buffer_minutes = cur.fetchone()["buffer_minutes"]
    return {
        "commitments": [public_commitment(r) for r in rows],
        "buffer_minutes": buffer_minutes,
        "timezone": me["timezone"],
    }


@router.post("/commitments", status_code=201)
def create_commitment(body: CommitmentIn, me: CurrentUser):
    values = check_commitment(body.model_dump(), me["timezone"])
    with get_connection() as conn, conn.cursor() as cur:
        if _count(cur, me["id"]) >= MAX_COMMITMENTS:
            raise HTTPException(status_code=422, detail=f"You can save up to {MAX_COMMITMENTS} commitments.")
        return public_commitment(_insert(cur, me["id"], values, "manual"))


@router.patch("/commitments/{commitment_id}")
def update_commitment(commitment_id: int, body: CommitmentPatch, me: CurrentUser):
    changes = body.model_dump(exclude_unset=True)
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(f"SELECT {COLUMNS} FROM commitments WHERE id = %s AND user_id = %s", (commitment_id, me["id"]))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="This commitment could not be found.")
        for field in ("title", "kind", "location", "recurrence", "start_date", "start_time", "end_time", "timezone"):
            if field in changes and changes[field] is None:
                raise HTTPException(status_code=422, detail=f"{field.replace('_', ' ')} can't be empty.")
        values = check_commitment({**row, **changes}, me["timezone"])
        cur.execute(
            f"""
            UPDATE commitments SET title = %s, kind = %s, location = %s, recurrence = %s, weekday = %s,
                   start_date = %s, end_date = %s, start_time = %s, end_time = %s, timezone = %s, updated_at = now()
            WHERE id = %s AND user_id = %s RETURNING {COLUMNS}
            """,
            (values["title"], values["kind"], values["location"], values["recurrence"], values["weekday"],
             values["start_date"], values["end_date"], values["start_time"], values["end_time"], values["timezone"],
             commitment_id, me["id"]),
        )
        return public_commitment(cur.fetchone())


@router.delete("/commitments/{commitment_id}")
def delete_commitment(commitment_id: int, me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM commitments WHERE id = %s AND user_id = %s RETURNING 1", (commitment_id, me["id"]))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="This commitment could not be found.")
    return {"deleted": True}


class ScheduleSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")
    buffer_minutes: int = Field(ge=0, le=120)


@router.patch("/me/schedule-settings")
def update_schedule_settings(body: ScheduleSettings, me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("UPDATE users SET buffer_minutes = %s WHERE id = %s RETURNING buffer_minutes", (body.buffer_minutes, me["id"]))
        return {"buffer_minutes": cur.fetchone()["buffer_minutes"]}


# ---------- Importing (proposals only: nothing is saved until /bulk) ----------

class IcsImport(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1, max_length=1_000_000)


@router.post("/commitments/import/ics")
def import_ics(body: IcsImport, me: CurrentUser):
    ics_limit.check(me["id"])
    try:
        proposals = parse_ics(body.text, me["timezone"])
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error) if "calendar" in str(error) else "We couldn't read this calendar file.")
    if not proposals:
        raise HTTPException(status_code=422, detail="We didn't find any events in this file.")
    return {"proposals": proposals, "count": len(proposals)}


class AiImport(BaseModel):
    model_config = ConfigDict(extra="forbid")
    file: str = Field(max_length=7_100_000)  # a data: URL, up to 5 MB once decoded
    consent: bool


class ExtractedEntry(BaseModel):
    """One commitment as Gemini read it. Anything unclear is flagged, never silently trusted."""

    title: str = Field(min_length=1, max_length=120)
    kind: Literal["class", "work", "other"] = "other"
    weekday: int | None = Field(default=None, ge=0, le=6)
    start_time: str | None = None
    end_time: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    recurrence: Literal["weekly", "none", "unknown"] = "unknown"
    location: str = Field(default="", max_length=200)
    uncertain_time: bool = False
    missing_dates: bool = False
    ambiguous_recurrence: bool = False
    notes: str = Field(default="", max_length=300)


class ExtractionOut(BaseModel):
    entries: list[ExtractedEntry] = Field(default=[], max_length=80)


def decode_upload(data_url):
    """Checks the type and size of an uploaded file. Returns (bytes, mime type) or raises 422."""
    match = re.fullmatch(r"data:(image/png|image/jpeg|application/pdf);base64,(.+)", data_url, flags=re.S)
    if not match:
        raise HTTPException(status_code=422, detail="Upload a PNG or JPEG image, or a PDF.")
    mime, encoded = match.groups()
    try:
        data = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=422, detail="The file couldn't be read. Try again.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=422, detail="The file is too big. The limit is 5 MB.")
    if not data.startswith(FILE_SIGNATURES[mime]):
        raise HTTPException(status_code=422, detail="The file isn't really a PNG, JPEG or PDF.")
    return data, mime


def extract_with_gemini(data, mime):
    """Sends the file to Gemini and returns a checked ExtractionOut. Kept separate so tests can replace it.

    The file is passed straight to Gemini from memory. It is never written to disk or logged.
    """
    if not config.GEMINI_API_KEY:
        raise GeminiUnavailable("not_configured")
    from google import genai
    from google.genai import errors, types

    try:
        client = genai.Client(
            api_key=config.GEMINI_API_KEY,
            http_options=types.HttpOptions(timeout=max(config.GEMINI_TIMEOUT_SECONDS, 30) * 1000),
        )
        response = client.models.generate_content(
            model=config.GEMINI_MODEL,
            contents=[types.Part.from_bytes(data=data, mime_type=mime), "List the commitments in this file."],
            config=types.GenerateContentConfig(
                system_instruction=prompts.SCHEDULE_EXTRACT_SYSTEM,
                response_mime_type="application/json",
                response_schema=ExtractionOut,
                temperature=0.1,
            ),
        )
        return ExtractionOut.model_validate_json(response.text or "")
    except errors.APIError as error:
        log.warning("Gemini refused the timetable request: %s %s", error.code, error.status)
        raise GeminiUnavailable("quota" if error.code == 429 else "error")
    except httpx.TimeoutException:
        raise GeminiUnavailable("timeout")
    except (ValidationError, ValueError):
        raise GeminiUnavailable("invalid_response")
    except Exception as error:
        log.warning("Gemini timetable call failed: %s", type(error).__name__)
        raise GeminiUnavailable("error")


def _clock(value):
    """'14:30' -> '14:30', anything unreadable -> None."""
    if value and re.fullmatch(r"([01]?\d|2[0-3]):[0-5]\d", value.strip()):
        hours, minutes = value.strip().split(":")
        return f"{int(hours):02d}:{minutes}"
    return None


def _day(value):
    try:
        return date.fromisoformat(value.strip()).isoformat() if value else None
    except ValueError:
        return None


def proposals_from_extraction(result, user_timezone):
    """Turns Gemini's reading into proposals for the review screen, with warnings for anything unsure."""
    proposals = []
    for entry in result.entries:
        flags = {
            "uncertain_time": entry.uncertain_time,
            "missing_dates": entry.missing_dates,
            "ambiguous_recurrence": entry.ambiguous_recurrence or entry.recurrence == "unknown",
        }
        warnings = []
        start_time, end_time = _clock(entry.start_time), _clock(entry.end_time)
        if not start_time or not end_time:
            flags["uncertain_time"] = True
            warnings.append("The time wasn't clear. Fill it in before saving.")
        elif entry.uncertain_time:
            warnings.append("The time was hard to read. Check it.")
        recurrence = entry.recurrence
        if recurrence == "unknown":
            recurrence = "weekly" if entry.weekday is not None else "none"
            warnings.append("We weren't sure whether this repeats. Check it.")
        weekday = entry.weekday if recurrence == "weekly" else None
        if recurrence == "weekly" and weekday is None:
            flags["ambiguous_recurrence"] = True
            warnings.append("The day of the week wasn't clear. Pick one.")
        start_date, end_date = _day(entry.start_date), _day(entry.end_date)
        if not start_date:
            flags["missing_dates"] = True
            if recurrence == "weekly":
                start_date = datetime.now(ZoneInfo(user_timezone)).date().isoformat()
                warnings.append("No start date in the file: it starts today. Change it if term starts later.")
            else:
                warnings.append("No date in the file. Add one before saving.")
        if recurrence == "weekly" and not end_date:
            flags["missing_dates"] = True
            warnings.append("No end date: it repeats until you remove it. Add the end of term if you know it.")
        if entry.notes:
            warnings.append(f"Gemini's note: {entry.notes}")
        title = entry.title.strip()[:80]
        raw_key = f"{title}|{weekday}|{start_time}|{end_time}|{start_date}|{end_date}"
        proposals.append({
            "title": title, "kind": entry.kind, "location": entry.location.strip()[:120], "recurrence": recurrence,
            "weekday": weekday, "start_date": start_date, "end_date": end_date if recurrence == "weekly" else None,
            "start_time": start_time, "end_time": end_time, "timezone": user_timezone, "source": "ai",
            "import_key": "ai:" + hashlib.sha256(raw_key.encode()).hexdigest()[:24],
            "warnings": warnings, "flags": flags,
        })
    return proposals


AI_ERRORS = {
    "not_configured": (503, "Reading timetables needs Gemini, which isn't set up on this server. Enter your schedule manually instead."),
    "quota": (503, "Gemini is busy right now. Try again later, or enter your schedule manually."),
    "timeout": (504, "Gemini took too long. Try a smaller or clearer file, or enter your schedule manually."),
    "invalid_response": (502, "Gemini's answer couldn't be used. Try a clearer file, or enter your schedule manually."),
    "error": (502, "Gemini had a problem reading the file. Try again, or enter your schedule manually."),
}


@router.post("/commitments/import/ai")
def import_with_ai(body: AiImport, me: CurrentUser):
    if not body.consent:
        raise HTTPException(status_code=422, detail="Tick the box to choose to send this file to Gemini, or enter your schedule manually.")
    data, mime = decode_upload(body.file)
    ai_limit.check(me["id"])
    try:
        result = extract_with_gemini(data, mime)
    except GeminiUnavailable as unavailable:
        status, message = AI_ERRORS.get(unavailable.reason, AI_ERRORS["error"])
        raise HTTPException(status_code=status, detail=message)
    finally:
        del data  # the file is not kept
    proposals = proposals_from_extraction(result, me["timezone"])
    if not proposals:
        raise HTTPException(status_code=422, detail="Gemini didn't find any commitments in this file. Try entering them manually.")
    return {"proposals": proposals, "count": len(proposals), "provider": "Google Gemini", "model": config.GEMINI_MODEL}


class CommitmentImportIn(CommitmentIn):
    import_key: text(100) | None = None


class BulkSave(BaseModel):
    model_config = ConfigDict(extra="forbid")
    entries: list[CommitmentImportIn] = Field(min_length=1, max_length=100)
    source: Literal["manual", "ics", "ai"]


@router.post("/commitments/bulk", status_code=201)
def save_reviewed(body: BulkSave, me: CurrentUser):
    """Saves the proposals the person reviewed. Duplicates (already saved, or twice in this list) are skipped."""
    saved, skipped, seen = [], 0, set()
    with get_connection() as conn, conn.cursor() as cur:
        if _count(cur, me["id"]) + len(body.entries) > MAX_COMMITMENTS:
            raise HTTPException(status_code=422, detail=f"You can save up to {MAX_COMMITMENTS} commitments.")
        for entry in body.entries:
            values = check_commitment(entry.model_dump(exclude={"import_key"}), me["timezone"])
            signature = (values["title"].lower(), values["kind"], values["recurrence"], values["weekday"],
                         values["start_time"], values["end_time"], values["start_date"], values["end_date"])
            if signature in seen or (entry.import_key and entry.import_key in seen):
                skipped += 1
                continue
            seen.add(signature)
            if entry.import_key:
                seen.add(entry.import_key)
            cur.execute(
                """
                SELECT 1 FROM commitments WHERE user_id = %s AND (
                    (import_key IS NOT NULL AND import_key = %s)
                    OR (lower(title) = %s AND kind = %s AND recurrence = %s AND weekday IS NOT DISTINCT FROM %s
                        AND start_time = %s AND end_time = %s AND start_date = %s AND end_date IS NOT DISTINCT FROM %s))
                """,
                (me["id"], entry.import_key, *signature),
            )
            if cur.fetchone():
                skipped += 1
                continue
            saved.append(public_commitment(_insert(cur, me["id"], values, body.source, entry.import_key)))
    return {"saved": len(saved), "skipped_duplicates": skipped, "commitments": saved}
