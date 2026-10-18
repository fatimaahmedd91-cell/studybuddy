"""Planning a hangout: shared free times, suggestions, a fair meeting area, and creating the event.

POST   /api/planning/slots          {"friend_ids": [2, 3]} OR {"group_id": 5},
                                    plus "start_date", "end_date" (up to 14 days) and "duration_minutes"
POST   /api/planning/suggest        the same, plus "slots": [{"start": ..., "end": ...}] (up to 5) and "refresh"
POST   /api/planning/area           the same people, plus "activity" and "budget": meeting area and places
POST   /api/planning/create-event   {"title", "starts_at", "ends_at", "location" or "online_url", "invitee_ids", "group_id"}
GET    /api/planning/consents       who may use your private schedule when planning
PUT    /api/planning/consents       {"scope": "friends"} or {"scope": "group", "group_id": 5}
DELETE /api/planning/consents       ?scope=friends   or   ?scope=group&group_id=5
GET    /api/planning/area-presets   campuses, neighbourhoods and transit hubs you can pick as your meeting area
GET    /api/me/meeting-origin       your own meeting area (nobody else can read it)
PUT    /api/me/meeting-origin       {"preset": "union"} or {"lat": 43.65, "lng": -79.38, "label": "Near me"}
DELETE /api/me/meeting-origin

HOW FREE TIMES ARE WORKED OUT (exact calculation; Gemini never decides or changes times)
For each person (rules in app/scheduling.py):
  - Their public "free to hang out" grid, but only if their availability audience lets you see it.
  - MINUS their private commitments (plus their buffer time), but only if they allowed it for this
    kind of plan: "friends" (any plan a friend makes with them) or this specific group (given while
    they're a member). Without that, their commitments are never even loaded.
  - Your own commitments always count for you.
Everyone's free times are intersected; slots shorter than the chosen length are dropped.
Results never say WHY someone is busy, and never include titles, locations or anyone's schedule.

"HOURLY INSIGHTS" (suggestions)
Suggestions are made on demand when someone presses "Get suggestions", then saved. The same people,
times and interests reuse the saved suggestion for up to an hour (shown as "Updated at ..."). A new one is
made only when the inputs change, the hour has passed, or the person presses Refresh (rate-limited).
There's no background job: nothing is generated for people who aren't looking, and Gemini is never
called on every page view. Gemini only sees shared interests, shared friendship goals, the group size and
the calculated slots, never names, schedules or locations, and only if EVERYONE included turned on AI
features. Otherwise a labelled template suggestion is used.

MEETING AREA
People can save an approximate meeting area (a preset campus/neighbourhood or a rounded current
location, never a home address) after turning on "location suggestions". The halfway point is the
straight-line average of the saved areas, rounded to about 1 km. It is not based on travel time.
Other people's areas are never returned. With exactly two people, the halfway point can still hint at
roughly which area the other person picked; the website says so.
With GOOGLE_MAPS_API_KEY set, Google Places finds real places near the halfway point. Without it (or if the
call fails), we return plain "search on Google Maps" links that Meerkat hasn't checked.
"""

import hashlib
import json
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Literal
from urllib.parse import quote_plus
from zoneinfo import ZoneInfo

import httpx
from fastapi import APIRouter, HTTPException
from psycopg2.extras import Json
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StringConstraints, ValidationError, model_validator

from app import config, prompts, scheduling
from app.ai import ACTIVITY_BY_INTEREST, BLOCKED_WORDS, GeminiUnavailable
from app.auth import CurrentUser
from app.db import get_connection
from app.events import EventCreate, create_event
from app.friends import are_friends
from app.notifications import notify
from app.ratelimit import RateLimiter
from app.safety import blocked_ids
from app.users import USER_COLUMNS, has_consent, load_user, mini_profile, visible_availability

router = APIRouter(prefix="/api")
log = logging.getLogger("friendfinder")

slots_limit = RateLimiter(60, 600, "You're checking times very often. Wait a few minutes and try again.")
generate_limit = RateLimiter(30, 600)
refresh_limit = RateLimiter(5, 600, "You've refreshed suggestions a lot. Wait a few minutes and try again.")
area_limit = RateLimiter(30, 600, "You're checking meeting areas very often. Wait a few minutes and try again.")
places_limit = RateLimiter(20, 600)

MAX_FRIENDS = 10
MAX_GROUP_MEMBERS = 20
SUGGESTION_MAX_AGE = 3600       # reuse a suggestion for up to an hour
FALLBACK_RETRY_SECONDS = 600    # after a Gemini problem, try Gemini again after 10 minutes
PLACES_URL = "https://places.googleapis.com/v1/places:searchText"
PLACES_FIELDS = ("places.displayName,places.formattedAddress,places.googleMapsUri,places.location,"
                 "places.currentOpeningHours.openNow,places.priceLevel")

STATUS_NOTES = {
    "included": "Included.",
    "public_only": "Hasn't allowed their private schedule to be used for this plan, so only their public free times are used.",
    "no_availability": "Hasn't shared availability with you.",
}

# Approximate centres of places people often meet from. Edit freely: (label, lat, lng).
AREA_PRESETS = {
    "uoft_st_george": ("UofT St. George campus", 43.66, -79.40),
    "utsc": ("UofT Scarborough (UTSC)", 43.78, -79.19),
    "utm": ("UofT Mississauga (UTM)", 43.55, -79.66),
    "york_keele": ("York University (Keele)", 43.77, -79.50),
    "tmu": ("Toronto Metropolitan University", 43.66, -79.38),
    "ocad": ("OCAD University", 43.65, -79.39),
    "humber_north": ("Humber College North", 43.73, -79.61),
    "centennial_progress": ("Centennial College Progress", 43.79, -79.23),
    "union": ("Union Station", 43.65, -79.38),
    "yonge_eglinton": ("Yonge and Eglinton", 43.71, -79.40),
    "finch": ("Finch Station", 43.78, -79.42),
    "kennedy": ("Kennedy Station", 43.73, -79.26),
    "stc": ("Scarborough Town Centre", 43.78, -79.26),
    "square_one": ("Square One, Mississauga", 43.59, -79.64),
    "kipling": ("Kipling Station", 43.64, -79.54),
    "downtown_toronto": ("Downtown Toronto", 43.65, -79.38),
}

# What to search for near the halfway point, by shared interest. Edit freely.
PLACE_QUERY_BY_INTEREST = {
    "cafes": "cafe", "coding": "quiet cafe", "board games": "board game cafe", "gaming": "arcade",
    "hiking": "park", "fitness": "gym", "basketball": "basketball court", "badminton": "badminton court",
    "photography": "park", "art": "art gallery", "books": "bookstore", "music": "live music venue",
    "yoga": "yoga studio", "chess": "board game cafe", "anime": "comic shop", "food": "restaurant",
}


# ---------- Who's in the plan ----------

def text(max_length, min_length=0):
    return Annotated[str, StringConstraints(strip_whitespace=True, min_length=min_length, max_length=max_length)]


class People(BaseModel):
    model_config = ConfigDict(extra="forbid")
    friend_ids: list[int] | None = Field(default=None, max_length=MAX_FRIENDS)
    group_id: int | None = None

    @model_validator(mode="after")
    def one_choice(self):
        if bool(self.friend_ids) == (self.group_id is not None):
            raise ValueError("Choose some friends or one group.")
        return self


class PlanRequest(People):
    start_date: date
    end_date: date
    duration_minutes: int = Field(ge=scheduling.MIN_DURATION, le=scheduling.MAX_DURATION)


def resolve_people(cur, me, body):
    """Returns (context, other people's user rows). context is ("friends", None) or ("group", group_id).

    Friends must be accepted friends. A group plan includes the group's current members, except anyone
    you blocked or who blocked you.
    """
    if body.friend_ids:
        ids = sorted(set(body.friend_ids) - {me["id"]})
        if not ids:
            raise HTTPException(status_code=422, detail="Choose at least one friend.")
        people = []
        for person_id in ids:
            person = load_user(cur, person_id)
            if not person or not are_friends(cur, me["id"], person_id):
                raise HTTPException(status_code=403, detail="You can only plan with your friends.")
            people.append(person)
        return ("friends", None), people
    cur.execute("SELECT 1 FROM groups WHERE id = %s", (body.group_id,))
    if not cur.fetchone():
        raise HTTPException(status_code=404, detail="That group could not be found.")
    cur.execute("SELECT 1 FROM group_members WHERE group_id = %s AND user_id = %s", (body.group_id, me["id"]))
    if not cur.fetchone():
        raise HTTPException(status_code=403, detail="Join the group to plan with it.")
    hidden = blocked_ids(cur, me["id"])
    cur.execute(
        f"SELECT {', '.join('u.' + c.strip() for c in USER_COLUMNS.split(','))} FROM group_members m"
        " JOIN users u ON u.id = m.user_id WHERE m.group_id = %s AND m.user_id <> %s AND u.suspended_at IS NULL"
        " ORDER BY m.joined_at",
        (body.group_id, me["id"]),
    )
    people = [row for row in cur.fetchall() if row["id"] not in hidden]
    if not people:
        raise HTTPException(status_code=422, detail="Nobody else is in this group yet.")
    if len(people) > MAX_GROUP_MEMBERS:
        raise HTTPException(status_code=422, detail=f"Planning works for groups of up to {MAX_GROUP_MEMBERS + 1} people.")
    return ("group", body.group_id), people


def schedule_allowed(cur, user_id, context):
    """True if this person let plans of this kind use their private commitments."""
    scope, group_id = context
    if scope == "friends":
        cur.execute("SELECT 1 FROM planning_consents WHERE user_id = %s AND scope = 'friends'", (user_id,))
    else:
        # Only a permission given during their CURRENT membership counts: joining (or re-joining)
        # a group never shares anyone's calendar by itself.
        cur.execute(
            "SELECT 1 FROM planning_consents c JOIN group_members m ON m.group_id = c.group_id AND m.user_id = c.user_id"
            " WHERE c.user_id = %s AND c.scope = 'group' AND c.group_id = %s AND c.created_at >= m.joined_at",
            (user_id, group_id),
        )
    return cur.fetchone() is not None


def _busy(cur, user_id, start_date, end_date, buffer_minutes):
    """Someone's commitments as busy times. Only the time fields are loaded, never titles or locations."""
    cur.execute(
        "SELECT recurrence, weekday, start_date, end_date, start_time, end_time, timezone FROM commitments"
        " WHERE user_id = %s AND start_date <= %s AND (end_date IS NULL OR end_date >= %s OR recurrence = 'none')",
        (user_id, end_date + timedelta(days=1), start_date - timedelta(days=1)),
    )
    return scheduling.busy_intervals(cur.fetchall(), start_date, end_date, buffer_minutes)


def _buffer(cur, user_id):
    cur.execute("SELECT buffer_minutes FROM users WHERE id = %s", (user_id,))
    return cur.fetchone()["buffer_minutes"]


def compute_plan(cur, me, body):
    """The exact shared free slots for a plan request. Shared by /slots, /suggest and the tests."""
    my_tz = me["timezone"]
    today = datetime.now(ZoneInfo(my_tz)).date()
    if body.end_date < body.start_date:
        raise HTTPException(status_code=422, detail="The end date must be on or after the start date.")
    if (body.end_date - body.start_date).days + 1 > scheduling.MAX_DAYS:
        raise HTTPException(status_code=422, detail=f"Plan up to {scheduling.MAX_DAYS} days at a time.")
    if body.end_date < today or body.start_date > today + timedelta(days=365):
        raise HTTPException(status_code=422, detail="Pick dates from today onwards, up to a year ahead.")

    context, others = resolve_people(cur, me, body)
    start_date, end_date = body.start_date, body.end_date
    window_start, window_end = scheduling.window(start_date, end_date, my_tz)

    # You: your public grid (or a normal day if you haven't set one), minus your own commitments.
    my_base = (scheduling.public_free_intervals(me["availability"], my_tz, start_date, end_date)
               or scheduling.default_day_intervals(my_tz, start_date, end_date))
    free_lists = [scheduling.subtract(my_base, _busy(cur, me["id"], start_date, end_date, _buffer(cur, me["id"])))]

    participants, included_ids = [], []
    for person in others:
        is_friend = are_friends(cur, me["id"], person["id"])
        grid = visible_availability(person, is_friend)
        tz = person["timezone"]
        if schedule_allowed(cur, person["id"], context):
            base = (scheduling.public_free_intervals(grid, tz, start_date, end_date)
                    or scheduling.default_day_intervals(tz, start_date, end_date))
            free = scheduling.subtract(base, _busy(cur, person["id"], start_date, end_date, _buffer(cur, person["id"])))
            status = "included"
        elif grid:
            free = scheduling.public_free_intervals(grid, tz, start_date, end_date)
            status = "public_only"
        else:
            free, status = None, "no_availability"
        if free is not None:
            free_lists.append(free)
            included_ids.append(person["id"])
        participants.append({"person": mini_profile(person), "status": status, "note": STATUS_NOTES[status]})

    now = datetime.now(timezone.utc)
    raw = scheduling.shared_slots(free_lists, window_start, window_end, now, body.duration_minutes) if included_ids else []
    zone = ZoneInfo(my_tz)
    slots = [
        {"id": f"S{n}", "start": start.astimezone(zone), "end": end.astimezone(zone),
         "minutes": int((end - start).total_seconds() // 60), "label": scheduling.describe_slot(start, end, my_tz)}
        for n, (start, end) in enumerate(raw, start=1)
    ]
    return {
        "context": {"type": context[0], "group_id": context[1]},
        "timezone": my_tz,
        "start_date": start_date,
        "end_date": end_date,
        "duration_minutes": body.duration_minutes,
        "participants": participants,
        "included_ids": included_ids,
        "slots": slots,
        "computed_at": now,
        "message": None if included_ids else "None of the people you picked have shared availability with you yet.",
    }, others


@router.post("/planning/slots")
def find_slots(body: PlanRequest, me: CurrentUser):
    slots_limit.check(me["id"])
    with get_connection() as conn, conn.cursor() as cur:
        plan, _ = compute_plan(cur, me, body)
    plan.pop("included_ids")
    return plan


# ---------- Suggestions ("hourly insights") ----------

class SlotRef(BaseModel):
    model_config = ConfigDict(extra="forbid")
    start: AwareDatetime
    end: AwareDatetime


class SuggestRequest(PlanRequest):
    slots: list[SlotRef] = Field(min_length=1, max_length=5)
    refresh: bool = False


class PlanActivity(BaseModel):
    title: str = Field(min_length=2, max_length=60)
    reason: str = Field(min_length=2, max_length=160)


class PlanOut(BaseModel):
    """The JSON shape Gemini must return. Anything else is rejected."""

    summary: str = Field(min_length=10, max_length=300)
    ranked_slot_ids: list[str] = Field(max_length=3)
    activities: list[PlanActivity] = Field(min_length=1, max_length=3)
    plan_slot_id: str
    plan: str = Field(min_length=5, max_length=250)


def _shared(lists, at_least=2):
    """Items in at least `at_least` of the lists (ignoring capitals), most common first, up to 6."""
    counts, spelling = {}, {}
    for items in lists:
        for item in set(i.strip() for i in items or [] if i.strip()):
            key = item.lower()
            counts[key] = counts.get(key, 0) + 1
            spelling.setdefault(key, item)
    ranked = sorted((key for key, n in counts.items() if n >= at_least), key=lambda key: (-counts[key], key))
    return [spelling[key] for key in ranked][:6]


def matching_slot(slots, requested):
    """The calculated slot the website meant. A slot that started "now" shrinks as time passes, so its
    start may have moved forward a little; the end must be exactly the same."""
    for slot in slots:
        moved = slot["start"] - requested.start
        if slot["end"] == requested.end and timedelta(0) <= moved <= timedelta(minutes=30):
            return slot
    return None


def suggestion_facts(me, people, chosen):
    """Exactly what Gemini may see: shared interests/goals, how many people, and the calculated slots."""
    everyone = [me, *people]
    return {
        "group_size": len(everyone),
        # Shared by at least two of the people coming.
        "shared_interests": _shared([p["interests"] for p in everyone]),
        "shared_friendship_goals": _shared([p["looking_for"] for p in everyone]),
        "slots": [{"id": s["id"], "when": s["label"], "minutes": s["minutes"]} for s in chosen],
    }


def ask_gemini_plan(facts):
    """Calls Gemini and returns a checked PlanOut. Kept separate so tests can replace it."""
    if not config.GEMINI_API_KEY:
        raise GeminiUnavailable("not_configured")
    from google import genai
    from google.genai import errors, types

    try:
        client = genai.Client(
            api_key=config.GEMINI_API_KEY,
            http_options=types.HttpOptions(timeout=config.GEMINI_TIMEOUT_SECONDS * 1000),
        )
        response = client.models.generate_content(
            model=config.GEMINI_MODEL,
            contents=prompts.plan_prompt(facts),
            config=types.GenerateContentConfig(
                system_instruction=prompts.PLAN_SYSTEM,
                response_mime_type="application/json",
                response_schema=PlanOut,
                temperature=0.6,
            ),
        )
        result = PlanOut.model_validate_json(response.text or "")
    except errors.APIError as error:
        log.warning("Gemini refused the plan request: %s %s", error.code, error.status)
        raise GeminiUnavailable("quota" if error.code == 429 else "error")
    except httpx.TimeoutException:
        raise GeminiUnavailable("timeout")
    except (ValidationError, ValueError):
        raise GeminiUnavailable("invalid_response")
    except Exception as error:
        log.warning("Gemini plan call failed: %s", type(error).__name__)
        raise GeminiUnavailable("error")
    return result


def check_plan(result, facts):
    """Gemini may only refer to slots we gave it, and must stay friendly and platonic."""
    ids = {s["id"] for s in facts["slots"]}
    if not set(result.ranked_slot_ids) <= ids or result.plan_slot_id not in ids:
        raise GeminiUnavailable("invalid_response")
    words = " ".join([result.summary, result.plan, *[a.title + " " + a.reason for a in result.activities]]).lower()
    if any(word in words for word in BLOCKED_WORDS):
        raise GeminiUnavailable("invalid_response")
    return result


def fallback_plan(facts):
    """A template suggestion made without AI, from the same facts."""
    slots = sorted(facts["slots"], key=lambda s: -s["minutes"])
    activities = []
    for interest in facts["shared_interests"]:
        idea = ACTIVITY_BY_INTEREST.get(interest.lower())
        if idea and len(activities) < 3:
            activities.append({"title": idea, "reason": f"You share an interest in {interest.lower()}."})
    if not activities:
        activities = [
            {"title": "Grab a coffee and chat", "reason": "Easy, low-cost and good for getting to know each other."},
            {"title": "Go for a walk", "reason": "Free, flexible and easy to fit around plans."},
        ]
    best = slots[0]
    summary = (f"These times work for everyone. The longest one is {best['when']} ({best['minutes'] // 60} h "
               f"{best['minutes'] % 60} min).") if best["minutes"] >= 60 else f"These times work for everyone, starting with {best['when']}."
    return PlanOut(
        summary=summary,
        ranked_slot_ids=[s["id"] for s in slots[:3]],
        activities=[PlanActivity(**a) for a in activities],
        plan_slot_id=best["id"],
        plan=f"{activities[0]['title']} on {best['when']}.",
    )


@router.post("/planning/suggest")
def suggest(body: SuggestRequest, me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        plan, others = compute_plan(cur, me, body)
        # Only slots that are really free right now can be used: the website can't send made-up times.
        chosen = [s for s in (matching_slot(plan["slots"], r) for r in body.slots) if s]
        if not chosen:
            raise HTTPException(status_code=409, detail="These times have changed. Press “Find times” again.")
        people = [p for p in others if p["id"] in plan["included_ids"]]
        facts = suggestion_facts(me, people, chosen)
        ai_allowed = has_consent(me, "ai_features") and all(has_consent(p, "ai_features") for p in people)
        key = hashlib.sha256(json.dumps(
            {"people": sorted(plan["included_ids"]), "facts": facts, "model": config.GEMINI_MODEL,
             "prompt": prompts.PLAN_PROMPT_VERSION, "ai": ai_allowed}, sort_keys=True, default=str,
        ).encode()).hexdigest()[:32]
        cur.execute(
            "SELECT payload, created_at, extract(epoch FROM now() - created_at) AS age FROM plan_suggestions"
            " WHERE requester_id = %s AND key_hash = %s ORDER BY created_at DESC LIMIT 1",
            (me["id"], key),
        )
        saved = cur.fetchone()

    if saved and not body.refresh:
        reason = saved["payload"]["fallback_reason"]
        max_age = FALLBACK_RETRY_SECONDS if reason in ("timeout", "quota", "error", "rate_limited", "invalid_response") else SUGGESTION_MAX_AGE
        if saved["age"] < max_age:
            return _suggestion_response(saved["payload"], chosen, facts, saved["created_at"], cached=True)
    if body.refresh:
        refresh_limit.check(me["id"])

    payload = _make_suggestion(facts, me["id"], ai_allowed)
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM plan_suggestions WHERE requester_id = %s AND created_at < now() - interval '1 day'", (me["id"],))
        cur.execute(
            "INSERT INTO plan_suggestions (requester_id, key_hash, payload) VALUES (%s, %s, %s) RETURNING created_at",
            (me["id"], key, Json(payload)),
        )
        created_at = cur.fetchone()["created_at"]
    return _suggestion_response(payload, chosen, facts, created_at, cached=False)


def _make_suggestion(facts, user_id, ai_allowed):
    if not ai_allowed:
        result, source, reason = fallback_plan(facts), "fallback", "ai_off"
    else:
        try:
            generate_limit.check(user_id)
            result, source, reason = check_plan(ask_gemini_plan(facts), facts), "gemini", None
        except HTTPException:
            result, source, reason = fallback_plan(facts), "fallback", "rate_limited"
        except GeminiUnavailable as unavailable:
            result, source, reason = fallback_plan(facts), "fallback", unavailable.reason
    return {**result.model_dump(), "source": source, "fallback_reason": reason,
            "model": config.GEMINI_MODEL if source == "gemini" else None}


def _suggestion_response(payload, chosen, facts, generated_at, cached):
    by_id = {s["id"]: s for s in chosen}
    return {
        "source": payload["source"],
        "fallback_reason": payload["fallback_reason"],
        "model": payload["model"],
        "summary": payload["summary"],
        "ranked_slots": [by_id[i] for i in payload["ranked_slot_ids"] if i in by_id],
        "activities": payload["activities"],
        "plan": {"slot": by_id.get(payload["plan_slot_id"]), "text": payload["plan"]},
        "facts_sent": facts if payload["source"] == "gemini" else None,
        "generated_at": generated_at,
        "cached": cached,
    }


# ---------- Planning permissions ----------

class ConsentChange(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scope: Literal["friends", "group"]
    group_id: int | None = None


@router.get("/planning/consents")
def list_consents(me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT 1 FROM planning_consents WHERE user_id = %s AND scope = 'friends'", (me["id"],))
        friends = cur.fetchone() is not None
        cur.execute(
            """
            SELECT g.id, g.name, EXISTS (
                SELECT 1 FROM planning_consents c WHERE c.user_id = %(me)s AND c.scope = 'group'
                AND c.group_id = g.id AND c.created_at >= m.joined_at) AS allowed
            FROM group_members m JOIN groups g ON g.id = m.group_id
            WHERE m.user_id = %(me)s ORDER BY g.name
            """,
            {"me": me["id"]},
        )
        groups = cur.fetchall()
    return {"friends": friends, "groups": groups}


@router.put("/planning/consents")
def allow(body: ConsentChange, me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        if body.scope == "group":
            if body.group_id is None:
                raise HTTPException(status_code=422, detail="Choose a group.")
            cur.execute("SELECT 1 FROM group_members WHERE group_id = %s AND user_id = %s", (body.group_id, me["id"]))
            if not cur.fetchone():
                raise HTTPException(status_code=403, detail="You can only allow groups you're in.")
        group_id = body.group_id if body.scope == "group" else None
        # Replace any older permission, so it counts from now (and from this membership).
        cur.execute(
            "DELETE FROM planning_consents WHERE user_id = %s AND scope = %s AND group_id IS NOT DISTINCT FROM %s",
            (me["id"], body.scope, group_id),
        )
        cur.execute("INSERT INTO planning_consents (user_id, scope, group_id) VALUES (%s, %s, %s)", (me["id"], body.scope, group_id))
    return list_consents(me)


@router.delete("/planning/consents")
def revoke(me: CurrentUser, scope: Literal["friends", "group"], group_id: int | None = None):
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            "DELETE FROM planning_consents WHERE user_id = %s AND scope = %s AND group_id IS NOT DISTINCT FROM %s",
            (me["id"], scope, group_id if scope == "group" else None),
        )
    return list_consents(me)


# ---------- Meeting area ----------

@router.get("/planning/area-presets")
def area_presets():
    return [{"key": key, "label": label, "lat": lat, "lng": lng} for key, (label, lat, lng) in AREA_PRESETS.items()]


class OriginChange(BaseModel):
    model_config = ConfigDict(extra="forbid")
    preset: str | None = None
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    label: text(60) = ""


def _origin(row):
    return {"label": row["label"], "lat": row["lat"], "lng": row["lng"], "source": row["source"], "updated_at": row["updated_at"]}


@router.get("/me/meeting-origin")
def my_origin(me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT label, lat, lng, source, updated_at FROM meeting_origins WHERE user_id = %s", (me["id"],))
        row = cur.fetchone()
    return {"origin": _origin(row) if row else None, "consent": has_consent(me, "location_suggestions")}


@router.put("/me/meeting-origin")
def set_origin(body: OriginChange, me: CurrentUser):
    if not has_consent(me, "location_suggestions"):
        raise HTTPException(status_code=403, detail="Turn on location suggestions first.")
    if body.preset:
        if body.preset not in AREA_PRESETS:
            raise HTTPException(status_code=422, detail="Pick an area from the list.")
        label, lat, lng = AREA_PRESETS[body.preset]
        source = "preset"
    elif body.lat is not None and body.lng is not None:
        # Rounded to about 1 km, so it's an area, not an exact spot.
        label, lat, lng, source = body.label or "Near my current location", round(body.lat, 2), round(body.lng, 2), "device"
    else:
        raise HTTPException(status_code=422, detail="Pick an area, or use your current location.")
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO meeting_origins (user_id, label, lat, lng, source) VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (user_id) DO UPDATE SET label = EXCLUDED.label, lat = EXCLUDED.lat, lng = EXCLUDED.lng,
                source = EXCLUDED.source, updated_at = now()
            RETURNING label, lat, lng, source, updated_at
            """,
            (me["id"], label, lat, lng, source),
        )
        return {"origin": _origin(cur.fetchone()), "consent": True}


@router.delete("/me/meeting-origin")
def delete_origin(me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM meeting_origins WHERE user_id = %s", (me["id"],))
    return {"origin": None, "consent": has_consent(me, "location_suggestions")}


class AreaRequest(People):
    activity: text(60) = ""
    budget: Literal["any", "cheap", "moderate"] = "any"


def search_places(query, lat, lng, budget):
    """Google Places (New) Text Search near a point. Returns the raw list of places. Kept separate for tests."""
    request = {
        "textQuery": query,
        "maxResultCount": 6,
        "locationBias": {"circle": {"center": {"latitude": lat, "longitude": lng}, "radius": 2500.0}},
    }
    if budget == "cheap":
        request["priceLevels"] = ["PRICE_LEVEL_INEXPENSIVE"]
    elif budget == "moderate":
        request["priceLevels"] = ["PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE"]
    response = httpx.post(
        PLACES_URL, json=request, timeout=8,
        headers={"X-Goog-Api-Key": config.GOOGLE_MAPS_API_KEY, "X-Goog-FieldMask": PLACES_FIELDS},
    )
    response.raise_for_status()
    return response.json().get("places", [])


def _venue(place):
    """Only fields Google actually returned. Missing ones stay None: we never fill them in."""
    name = (place.get("displayName") or {}).get("text")
    if not name:
        return None
    location = place.get("location") or {}
    hours = place.get("currentOpeningHours") or {}
    return {
        "name": name,
        "address": place.get("formattedAddress"),
        "maps_url": place.get("googleMapsUri"),
        "open_now": hours.get("openNow"),
        "price_level": place.get("priceLevel"),
        "lat": location.get("latitude"),
        "lng": location.get("longitude"),
    }


def maps_search_link(query, lat, lng):
    return "https://www.google.com/maps/search/?api=1&query=" + quote_plus(f"{query} near {lat},{lng}")


@router.post("/planning/area")
def meeting_area(body: AreaRequest, me: CurrentUser):
    area_limit.check(me["id"])
    with get_connection() as conn, conn.cursor() as cur:
        _, others = resolve_people(cur, me, body)
        everyone = [me, *others]
        # Only people who turned on location suggestions count (their area is deleted if they turn it off).
        ids = [p["id"] for p in everyone if has_consent(p, "location_suggestions")]
        points = []
        if ids:
            cur.execute("SELECT lat, lng FROM meeting_origins WHERE user_id = ANY(%s)", (ids,))
            points = [(row["lat"], row["lng"]) for row in cur.fetchall()]

    interests = _shared([p["interests"] for p in everyone])
    query = body.activity or next(
        (PLACE_QUERY_BY_INTEREST[i.lower()] for i in interests if i.lower() in PLACE_QUERY_BY_INTEREST), "cafe")
    result = {"used_count": len(points), "total": len(everyone), "query": query, "midpoint": None,
              "source": None, "venues": [], "links": [], "notice": None}
    if len(points) < 2:
        result["notice"] = ("A halfway point needs at least two people's meeting areas. Add yours, and ask your "
                            "friends to add theirs on their Plan page.")
        return result

    lat, lng = scheduling.midpoint(points)
    result["midpoint"] = {
        "lat": lat, "lng": lng, "maps_url": f"https://www.google.com/maps/search/?api=1&query={lat},{lng}",
        "label": "Approximate halfway point (straight-line), not based on travel time",
    }
    if config.GOOGLE_MAPS_API_KEY:
        try:
            places_limit.check(me["id"])
            venues = [v for v in (_venue(p) for p in search_places(query, lat, lng, body.budget)) if v]
            result.update(source="google_places", venues=venues)
            return result
        except HTTPException:
            result["notice"] = "You've searched for places a lot recently, so here are plain map links instead."
        except (httpx.HTTPError, ValueError) as error:
            log.warning("Google Places search failed: %s", type(error).__name__)
            result["notice"] = "Google Maps place search didn't work just now, so here are plain map links instead."
    else:
        result["notice"] = "Live place search isn't set up on this server, so here are plain map links instead."
    queries = [query] + [q for q in ("cafe", "park") if q != query]
    result["source"] = "links"
    result["links"] = [
        {"label": f"Search “{q}” near the halfway point", "url": maps_search_link(q, lat, lng),
         "note": "Opens Google Maps — not checked by Meerkat"}
        for q in queries[:3]
    ]
    return result


# ---------- Turning a slot into an event ----------

class PlanEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: text(80, 3)
    description: text(1000) = ""
    starts_at: AwareDatetime
    ends_at: AwareDatetime | None = None
    location: text(120) = ""
    online_url: Annotated[str, StringConstraints(strip_whitespace=True, max_length=300, pattern=r"^(https?://\S+)?$")] = ""
    invitee_ids: list[int] = Field(default=[], max_length=20)
    group_id: int | None = None


@router.post("/planning/create-event", status_code=201)
def create_plan_event(body: PlanEvent, me: CurrentUser):
    invitees = sorted(set(body.invitee_ids) - {me["id"]})
    with get_connection() as conn, conn.cursor() as cur:
        for person_id in invitees:
            # Friends only. Blocking ends a friendship, so blocked people can never be invited.
            if not are_friends(cur, me["id"], person_id):
                raise HTTPException(status_code=403, detail="You can only invite your friends.")
    event = create_event(EventCreate(**body.model_dump(exclude={"invitee_ids"})), me)
    invited = 0
    with get_connection() as conn, conn.cursor() as cur:
        group_members = set()
        if body.group_id is not None:
            # Group members already got a "new event in your group" notification.
            cur.execute("SELECT user_id FROM group_members WHERE group_id = %s", (body.group_id,))
            group_members = {row["user_id"] for row in cur.fetchall()}
        for person_id in invitees:
            if person_id in group_members:
                continue
            if notify(cur, person_id, "plan_invite", f"{me['name']} invited you to {body.title}",
                      f"/events?id={event['id']}", me["id"]):
                invited += 1
    return {"event": event, "invited": invited, "invitee_count": len(invitees)}
