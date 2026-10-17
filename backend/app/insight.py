"""POST /api/insight: asks Gemini to write one friendly "why you might get along" note.

Privacy rule: the request holds ONLY what two students share (interests, courses, and
free times). No names, no contact details. Pydantic rejects anything else.
"""

import logging
import time
from collections import defaultdict
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Request
from google import genai
from google.genai import types
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app import config

router = APIRouter(prefix="/api")
log = logging.getLogger("friendfinder")

INSTRUCTIONS = """You write one short, friendly note for a university student explaining why they might get along with another student they matched with.
Rules:
- One or two sentences, under 45 words.
- Speak to the student as "you", and describe what "you both" share.
- Use only the facts given. Do not invent names, places, or details.
- If there is little in common, say kindly that a fresh perspective can still make a good study partner.
- Plain text only. No emojis, no markdown, no quotation marks."""

ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]


class FreeSlot(BaseModel):
    day: Literal["Mon", "Tue", "Wed", "Thu", "Fri"]
    slot: Literal["morning", "afternoon", "evening"]


class InsightRequest(BaseModel):
    # extra="forbid" refuses any other field, so names or emails cannot sneak in.
    model_config = ConfigDict(extra="forbid")

    sharedInterests: list[ShortText] = Field(default=[], max_length=10)
    sharedCourses: list[ShortText] = Field(default=[], max_length=10)
    sharedSlots: list[FreeSlot] = Field(default=[], max_length=15)


class InsightResponse(BaseModel):
    text: str
    model: str


# Once the site is public, anyone could call this. Each visitor gets 30 notes per 10 minutes,
# so a stranger cannot use up our Gemini quota.
LIMIT = 30
WINDOW_SECONDS = 10 * 60
_requests_by_visitor = defaultdict(list)


def over_limit(visitor):
    now = time.monotonic()
    recent = [t for t in _requests_by_visitor[visitor] if now - t < WINDOW_SECONDS]
    recent.append(now)
    _requests_by_visitor[visitor] = recent
    return len(recent) > LIMIT


def build_prompt(body):
    def show(items):
        return ", ".join(items) if items else "none"

    slots = [f"{s.day} {s.slot}" for s in body.sharedSlots]
    return "\n".join(
        [
            f"Shared courses: {show(body.sharedCourses)}",
            f"Shared interests: {show(body.sharedInterests)}",
            f"Times you are both free: {show(slots)}",
        ]
    )


def ask_gemini(prompt):
    """Sends the prompt to Gemini and returns its text. Kept separate so tests can replace it."""
    client = genai.Client(
        api_key=config.GEMINI_API_KEY,
        http_options=types.HttpOptions(timeout=20_000),  # milliseconds
    )
    response = client.models.generate_content(
        model=config.GEMINI_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(system_instruction=INSTRUCTIONS),
    )
    text = (response.text or "").strip()
    if not text:
        raise ValueError("Gemini returned no text")
    return text[:400]


@router.post("/insight", response_model=InsightResponse)
def insight(body: InsightRequest, request: Request):
    if not config.GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY is not set")

    # Behind Caddy, the visitor's address is the first one in X-Forwarded-For.
    forwarded = request.headers.get("x-forwarded-for", "")
    visitor = forwarded.split(",")[0].strip() or (request.client.host if request.client else "unknown")
    if over_limit(visitor):
        raise HTTPException(status_code=429, detail="Too many requests, try again later")

    try:
        text = ask_gemini(build_prompt(body))
    except Exception as error:
        # Details go to the server log only, not to visitors.
        log.warning("Gemini insight failed: %s", type(error).__name__)
        raise HTTPException(status_code=502, detail="AI insight is unavailable right now")
    return {"text": text, "model": config.GEMINI_MODEL}
