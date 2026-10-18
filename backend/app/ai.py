"""AI match notes with Gemini: why two people might connect, a conversation starter, and an activity idea.

GET /api/people/{id}/insight

What is sent to Gemini: ONLY what the two people share, worked out here on the server:
shared interests, shared friendship goals, the university (only if it's the same), and the
times both are free. Never names, emails, ages, bios, or photos.

When Gemini isn't available (no key, timeout, quota used up, or an unusable answer), the app
writes a note from fixed templates instead and labels it "Suggested by FriendFinder".
"""

import hashlib
import json
import logging

import httpx
from fastapi import APIRouter, HTTPException
from psycopg2.extras import Json
from pydantic import BaseModel, Field, ValidationError

from app import config, prompts
from app.auth import CurrentUser
from app.db import get_connection
from app.matching import compute_match
from app.ratelimit import RateLimiter
from app.users import load_user

router = APIRouter(prefix="/api")
log = logging.getLogger("friendfinder")

# New notes per person (saved notes don't count). Over the limit, the template note is used.
generate_limit = RateLimiter(30, 600)

# If Gemini failed, try again after this long instead of on every page view.
FALLBACK_RETRY_SECONDS = 600

BLOCKED_WORDS = ("dating", "romantic", "romance", "flirt", "crush", "girlfriend", "boyfriend")


class InsightOut(BaseModel):
    """The JSON shape Gemini must return. Anything else is rejected."""

    explanation: str = Field(min_length=10, max_length=400)
    conversation_starter: str = Field(min_length=5, max_length=300)
    activity: str = Field(min_length=5, max_length=250)


def insight_facts(a, b):
    """The shared facts for a pair. Always worked out from the lower id's side, so A->B and B->A match."""
    low, high = (a, b) if a["id"] < b["id"] else (b, a)
    match = compute_match(low, high)
    return {
        "shared_interests": match["shared_interests"],
        "shared_friendship_goals": match["shared_goals"],
        "same_university": high["university"].strip() if match["same_university"] else None,
        "both_free": [f"{slot['day']} {slot['slot']}" for slot in match["overlap"]][:6],
    }


def facts_hash(facts):
    raw = json.dumps({"facts": facts, "model": config.GEMINI_MODEL, "prompt": prompts.PROMPT_VERSION}, sort_keys=True)
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


# ---------- Template notes (used when Gemini isn't available) ----------

ACTIVITY_BY_INTEREST = {
    "cafes": "Try a new café together",
    "coding": "Pair up on a small coding project or a hackathon",
    "board games": "Play a board game at the student centre",
    "gaming": "Play a co-op game together",
    "hiking": "Walk a nearby trail together",
    "fitness": "Do a workout together at the gym",
    "basketball": "Shoot some hoops",
    "badminton": "Book a badminton court",
    "photography": "Go on a short photo walk around campus",
    "art": "Sketch together at the library or a gallery",
    "books": "Swap book recommendations over coffee",
    "music": "Check out an open mic night",
    "yoga": "Join a campus yoga drop-in class",
    "anime": "Watch an episode of something new together",
    "chess": "Play a game of chess",
}


def fallback_insight(facts):
    interests = facts["shared_interests"]
    goals = facts["shared_friendship_goals"]
    university = facts["same_university"]
    free = facts["both_free"]

    parts = []
    if interests:
        parts.append("you both like " + ", ".join(i.lower() for i in interests[:3]))
    if goals:
        parts.append("you're both looking for " + " and ".join(g.lower() for g in goals[:2]))
    if university:
        parts.append(f"you both go to {university}")
    if free:
        parts.append(f"you're both free {free[0]}")
    explanation = (
        "You might get along because " + "; ".join(parts) + "."
        if parts
        else "You don't share much on paper yet, but a fresh perspective can make a great friend."
    )

    if interests:
        starter = f"What got you into {interests[0].lower()}?"
    elif goals:
        starter = f"You're both looking for {goals[0].lower()}. Want to plan something this week?"
    elif university:
        starter = f"What's your favourite spot at {university}?"
    else:
        starter = "What are you hoping to get out of this term?"

    idea = next((ACTIVITY_BY_INTEREST[i.lower()] for i in interests if i.lower() in ACTIVITY_BY_INTEREST), None)
    idea = idea or "Grab a coffee and chat"
    activity = f"{idea} on {free[0]}." if free else f"{idea} when you're both free."
    return {"explanation": explanation, "conversation_starter": starter, "activity": activity}


# ---------- Gemini ----------


class GeminiUnavailable(Exception):
    def __init__(self, reason):
        super().__init__(reason)
        self.reason = reason  # "not_configured", "quota", "timeout", "invalid_response", or "error"


def ask_gemini(facts):
    """Calls Gemini and returns a checked InsightOut. Kept separate so tests can replace it."""
    if not config.GEMINI_API_KEY:
        raise GeminiUnavailable("not_configured")
    from google import genai
    from google.genai import errors, types

    try:
        client = genai.Client(
            api_key=config.GEMINI_API_KEY,
            http_options=types.HttpOptions(timeout=config.GEMINI_TIMEOUT_SECONDS * 1000),  # milliseconds
        )
        response = client.models.generate_content(
            model=config.GEMINI_MODEL,
            contents=prompts.insight_prompt(facts),
            config=types.GenerateContentConfig(
                system_instruction=prompts.INSIGHT_SYSTEM,
                response_mime_type="application/json",
                response_schema=InsightOut,
                temperature=0.7,
            ),
        )
        result = InsightOut.model_validate_json(response.text or "")
    except errors.APIError as error:
        log.warning("Gemini refused the request: %s %s", error.code, error.status)
        raise GeminiUnavailable("quota" if error.code == 429 else "error")
    except httpx.TimeoutException:
        raise GeminiUnavailable("timeout")
    except (ValidationError, ValueError):
        raise GeminiUnavailable("invalid_response")
    except Exception as error:
        log.warning("Gemini call failed: %s", type(error).__name__)
        raise GeminiUnavailable("error")

    text = " ".join([result.explanation, result.conversation_starter, result.activity]).lower()
    if any(word in text for word in BLOCKED_WORDS):
        raise GeminiUnavailable("invalid_response")
    return result


def make_insight(facts, user_id):
    """Asks Gemini, or falls back to the template. Returns the note as a dict."""
    try:
        generate_limit.check(user_id)
        result = ask_gemini(facts)
        return {**result.model_dump(), "source": "gemini", "model": config.GEMINI_MODEL, "fallback_reason": None}
    except HTTPException:
        reason = "rate_limited"
    except GeminiUnavailable as unavailable:
        reason = unavailable.reason
    return {**fallback_insight(facts), "source": "fallback", "model": None, "fallback_reason": reason}


@router.get("/people/{person_id}/insight")
def insight(person_id: int, me: CurrentUser):
    if person_id == me["id"]:
        raise HTTPException(status_code=400, detail="Match notes are for other people.")
    with get_connection() as conn, conn.cursor() as cur:
        other = load_user(cur, person_id)
        if not other or not other["onboarded"]:
            raise HTTPException(status_code=404, detail="This person could not be found.")
        facts = insight_facts(me, other)
        key = facts_hash(facts)
        low, high = sorted([me["id"], other["id"]])
        cur.execute(
            "SELECT payload, facts_hash, extract(epoch FROM now() - created_at) AS age, created_at"
            " FROM match_insights WHERE user_low = %s AND user_high = %s",
            (low, high),
        )
        saved = cur.fetchone()

    usable = saved and saved["facts_hash"] == key and (
        saved["payload"]["source"] == "gemini" or saved["age"] < FALLBACK_RETRY_SECONDS
    )
    if usable:
        return {**saved["payload"], "facts_sent": facts, "cached": True, "generated_at": saved["created_at"]}

    # Ask outside the database transaction: the Gemini call can take a few seconds.
    note = make_insight(facts, me["id"])
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO match_insights (user_low, user_high, facts_hash, payload) VALUES (%s, %s, %s, %s)
            ON CONFLICT (user_low, user_high)
            DO UPDATE SET facts_hash = EXCLUDED.facts_hash, payload = EXCLUDED.payload, created_at = now()
            RETURNING created_at
            """,
            (low, high, key, Json(note)),
        )
        created_at = cur.fetchone()["created_at"]
    return {**note, "facts_sent": facts, "cached": False, "generated_at": created_at}
