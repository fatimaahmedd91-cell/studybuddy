"""Time in Meerkat: how long you've had the app open and in use.

This only measures Meerkat. It cannot see your phone's screen time or other apps.

How time is counted:
  - While a Meerkat tab is visible and you've used it in the last minute, the website
    sends a "heartbeat" every 30 seconds. Each heartbeat adds 30 seconds.
  - Heartbeats closer than 25 seconds apart are ignored, so two open tabs don't count double.
  - A hidden tab, or one you haven't touched for a minute, sends nothing.

POST /api/screen-time/heartbeat    count 30 seconds (the website calls this; you don't need to)
GET  /api/screen-time?tz=America/Toronto   today's total and the last 7 days, in your time zone
Your daily goal is a profile setting: PATCH /api/me {"daily_goal_minutes": 30}

Self-reported phone screen time and screen-time groups live in app/screen_time_groups.py.
"""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, HTTPException

from app.auth import CurrentUser
from app.db import get_connection, timescale_in_use
from app.screen_time_groups import maybe_send_reminder

router = APIRouter(prefix="/api")

HEARTBEAT_SECONDS = 30
MIN_GAP_SECONDS = 25


@router.post("/screen-time/heartbeat")
def heartbeat(me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        # Lock this person's row so two tabs sending at the same moment can't both be counted.
        cur.execute("SELECT id FROM users WHERE id = %s FOR UPDATE", (me["id"],))
        cur.execute(
            "SELECT extract(epoch FROM now() - max(at)) AS gap FROM app_time"
            " WHERE user_id = %s AND at > now() - interval '1 hour'",
            (me["id"],),
        )
        gap = cur.fetchone()["gap"]
        if gap is not None and gap < MIN_GAP_SECONDS:
            return {"counted": False}
        cur.execute("INSERT INTO app_time (user_id, seconds) VALUES (%s, %s)", (me["id"], HEARTBEAT_SECONDS))
        if gap is None:
            # First heartbeat in an hour (a new visit): a good moment for the once-a-day reminder.
            maybe_send_reminder(cur, me)
    return {"counted": True}


@router.get("/screen-time")
def summary(me: CurrentUser, tz: str = "UTC"):
    try:
        zone = ZoneInfo(tz)
    except (ZoneInfoNotFoundError, ValueError):
        raise HTTPException(status_code=422, detail="Unknown time zone.")

    today = datetime.now(zone).date()
    first_day = today - timedelta(days=6)
    with get_connection() as conn, conn.cursor() as cur:
        timescale = timescale_in_use(cur)
        if timescale:
            # TimescaleDB's time_bucket groups the samples into days in your time zone.
            day_expr = "(time_bucket('1 day', at, %(tz)s) AT TIME ZONE %(tz)s)::date"
        else:
            day_expr = "(at AT TIME ZONE %(tz)s)::date"
        cur.execute(
            f"SELECT {day_expr} AS day, sum(seconds) AS seconds FROM app_time"
            " WHERE user_id = %(me)s AND at >= now() - interval '8 days' GROUP BY 1",
            {"tz": tz, "me": me["id"]},
        )
        totals = {row["day"]: int(row["seconds"]) for row in cur.fetchall()}

    week = [
        {"date": (first_day + timedelta(days=i)).isoformat(), "seconds": totals.get(first_day + timedelta(days=i), 0)}
        for i in range(7)
    ]
    return {
        "today_seconds": totals.get(today, 0),
        "week": week,
        "goal_minutes": me["daily_goal_minutes"],
        "heartbeat_seconds": HEARTBEAT_SECONDS,
        "storage": "timescaledb" if timescale else "postgresql",
    }
