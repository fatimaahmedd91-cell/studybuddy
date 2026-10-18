"""Checking email addresses and phone numbers, and the (optional) selfie age check.

GET  /api/verification                 what's verified, and which checks this server can do
POST /api/verification/email/send      emails you a 6-digit code (needs SMTP settings)
POST /api/verification/email/confirm   {"code": "123456"}
POST /api/verification/phone/send      texts a code to your phone (needs Twilio Verify settings)
POST /api/verification/phone/confirm   {"code": "123456"}
POST /api/verification/age/start       {"consent": true} starts an age check with the configured provider

Honest rules:
- "Verified" is only ever set here, after a correct code. Typing an address never verifies it.
- Changing a verified email or phone removes its label (app/account.py).
- If a provider isn't set up, the endpoint says so (503). Nothing is faked.
- Codes expire after 10 minutes, allow 5 tries, can be resent after 60 seconds, at most 5 a day.
- Codes are never logged. Only a hash of an email code is stored; phone codes are made and checked by Twilio.
- Age checks: Meerkat never looks at faces itself and never uses Gemini to guess ages. It would hand
  people to a hosted provider and keep only the result (status, provider, reference, time).
  No provider is integrated yet, so this stays "not available". AGE_CHECK_PROVIDER=mock is a clearly
  labelled TEST MODE that only works when APP_ENV=development and never shows an "Age checked" badge.
"""

import hashlib
import hmac
import logging
import secrets
import smtplib
import ssl
from datetime import datetime, timezone
from email.message import EmailMessage

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app import config
from app.auth import CurrentUser
from app.db import get_connection
from app.users import USER_COLUMNS, own_profile

router = APIRouter(prefix="/api")
log = logging.getLogger("friendfinder.verification")

CODE_MINUTES = 10
MAX_ATTEMPTS = 5
RESEND_SECONDS = 60
MAX_SENDS_PER_DAY = 5


# ---------- Which providers are set up ----------

def email_available():
    return bool(config.SMTP_HOST and config.SMTP_FROM)


def phone_available():
    return bool(config.TWILIO_ACCOUNT_SID and config.TWILIO_AUTH_TOKEN and config.TWILIO_VERIFY_SERVICE_SID)


def age_check_mode():
    """'real' (a supported provider), 'test' (mock, development only) or None (not available)."""
    provider = config.AGE_CHECK_PROVIDER.strip().lower()
    if provider == "mock" and config.APP_ENV == "development":
        return "test"
    if provider in AGE_PROVIDERS:
        return "real"
    return None


# Real age-check providers would be added here: {"name": adapter}. Each adapter needs
# start(user) -> {"redirect_url": ...} and a callback handler that stores ONLY the result.
# None is integrated yet: choosing one is a product and privacy decision (docs/PRE_LAUNCH_CHECKLIST.md).
AGE_PROVIDERS: dict = {}


# ---------- Sending (replaced by fakes in the tests) ----------

class SendFailed(Exception):
    pass


def tls_context():
    """Encryption settings for the SMTP connection: checks the server's certificate and name.
    (smtplib's own default doesn't check them, which would let someone in between read the codes.)"""
    return ssl.create_default_context()


def send_email(to, subject, body):
    """Sends a plain-text email through the configured SMTP account."""
    message = EmailMessage()
    message["From"] = config.SMTP_FROM
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)
    try:
        if config.SMTP_PORT == 465:
            server = smtplib.SMTP_SSL(config.SMTP_HOST, config.SMTP_PORT, timeout=15, context=tls_context())
        else:
            server = smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=15)
            server.starttls(context=tls_context())
        with server:
            if config.SMTP_USER:
                server.login(config.SMTP_USER, config.SMTP_PASSWORD)
            server.send_message(message)
    except (smtplib.SMTPException, OSError) as error:
        log.warning("Email could not be sent: %s", type(error).__name__)
        raise SendFailed()


TWILIO_BASE = "https://verify.twilio.com/v2/Services"


def twilio_start(phone):
    """Asks Twilio Verify to text a code to this number."""
    try:
        response = httpx.post(
            f"{TWILIO_BASE}/{config.TWILIO_VERIFY_SERVICE_SID}/Verifications",
            data={"To": phone, "Channel": "sms"},
            auth=(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN),
            timeout=15,
        )
    except httpx.HTTPError as error:
        log.warning("Twilio request failed: %s", type(error).__name__)
        raise SendFailed()
    if response.status_code >= 400:
        log.warning("Twilio refused to send a code (HTTP %s)", response.status_code)
        raise SendFailed()


def twilio_check(phone, code):
    """True if Twilio says the code is right."""
    try:
        response = httpx.post(
            f"{TWILIO_BASE}/{config.TWILIO_VERIFY_SERVICE_SID}/VerificationCheck",
            data={"To": phone, "Code": code},
            auth=(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN),
            timeout=15,
        )
    except httpx.HTTPError as error:
        log.warning("Twilio check failed: %s", type(error).__name__)
        raise SendFailed()
    if response.status_code == 404:
        return False  # Twilio forgets codes once they expire or are used
    if response.status_code >= 400:
        log.warning("Twilio check refused (HTTP %s)", response.status_code)
        raise SendFailed()
    return response.json().get("status") == "approved"


# ---------- Shared code-handling ----------

def hash_code(user_id, code):
    return hmac.new(config.JWT_SECRET.encode(), f"{user_id}:{code}".encode(), hashlib.sha256).hexdigest()


def latest_open(cur, user_id, channel):
    cur.execute(
        """
        SELECT * FROM contact_verifications
        WHERE user_id = %s AND channel = %s AND used_at IS NULL
        ORDER BY id DESC LIMIT 1
        """,
        (user_id, channel),
    )
    return cur.fetchone()


def check_send_limits(cur, user_id, channel):
    cur.execute(
        """
        SELECT count(*) AS n, max(sent_at) AS last FROM contact_verifications
        WHERE user_id = %s AND channel = %s AND sent_at > now() - interval '1 day'
        """,
        (user_id, channel),
    )
    row = cur.fetchone()
    if row["last"] and (datetime.now(timezone.utc) - row["last"]).total_seconds() < RESEND_SECONDS:
        wait = RESEND_SECONDS - int((datetime.now(timezone.utc) - row["last"]).total_seconds())
        raise HTTPException(status_code=429, detail=f"Please wait {wait} seconds before asking for another code.")
    if row["n"] >= MAX_SENDS_PER_DAY:
        raise HTTPException(status_code=429, detail="You've asked for several codes today. Try again tomorrow.")


def start_code(cur, user_id, channel, target, code_hash="", minutes=CODE_MINUTES):
    """Cancels older codes and records a new one (sent just now, valid for `minutes`)."""
    cur.execute(
        "UPDATE contact_verifications SET used_at = now() WHERE user_id = %s AND channel = %s AND used_at IS NULL",
        (user_id, channel),
    )
    cur.execute(
        """
        INSERT INTO contact_verifications (user_id, channel, target, code_hash, expires_at)
        VALUES (%s, %s, %s, %s, now() + make_interval(mins => %s)) RETURNING id
        """,
        (user_id, channel, target, code_hash, minutes),
    )
    return cur.fetchone()["id"]


def usable_code(cur, user_id, channel, target):
    """The current code record, or a clear error saying why it can't be used."""
    row = latest_open(cur, user_id, channel)
    if not row or row["target"] != target:
        raise HTTPException(status_code=400, detail="There's no code waiting. Ask for a new one.")
    if row["expires_at"] < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="This code has expired. Ask for a new one.")
    if row["attempts"] >= MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Too many wrong tries. Ask for a new code.")
    return row


def wrong_code(cur, row):
    cur.execute("UPDATE contact_verifications SET attempts = attempts + 1 WHERE id = %s", (row["id"],))
    left = MAX_ATTEMPTS - row["attempts"] - 1
    return HTTPException(status_code=400, detail=f"That code isn't right. {left} tr{'y' if left == 1 else 'ies'} left.")


class CodeBody(BaseModel):
    code: str = Field(pattern=r"^\s*[0-9]{4,10}\s*$")


# ---------- Status ----------

@router.get("/verification")
def verification_status(me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        pending = {ch: latest_open(cur, me["id"], ch) for ch in ("email", "phone")}
    now = datetime.now(timezone.utc)

    def waiting(channel, target):
        row = pending[channel]
        return bool(row and row["target"] == target and row["expires_at"] > now and row["attempts"] < MAX_ATTEMPTS)

    mode = age_check_mode()
    return {
        "email": {
            "address": me["email"],
            "verified": bool(me["email_verified_at"]),
            "verified_at": me["email_verified_at"],
            "available": email_available() and not me["is_demo"],
            "code_sent": waiting("email", me["email"]),
        },
        "phone": {
            "number": me["phone"],
            "verified": bool(me["phone_verified_at"]),
            "verified_at": me["phone_verified_at"],
            "available": phone_available() and not me["is_demo"],
            "code_sent": bool(me["phone"]) and waiting("phone", me["phone"]),
        },
        "age": {
            "available": mode is not None,
            "test_mode": mode == "test",
            "status": me["age_check_status"],
            "provider": me["age_check_provider"],
            "checked_at": me["age_check_at"],
        },
    }


# ---------- Email ----------

@router.post("/verification/email/send")
def send_email_code(me: CurrentUser):
    if me["is_demo"]:
        raise HTTPException(status_code=403, detail="Demo accounts use made-up emails, so they can't be verified.")
    if not email_available():
        raise HTTPException(status_code=503, detail="Email verification isn't set up on this server yet.")
    if me["email_verified_at"]:
        raise HTTPException(status_code=409, detail="Your email is already verified.")
    code = f"{secrets.randbelow(10**6):06d}"
    with get_connection() as conn, conn.cursor() as cur:
        check_send_limits(cur, me["id"], "email")
        record_id = start_code(cur, me["id"], "email", me["email"], hash_code(me["id"], code))
    try:
        send_email(
            me["email"],
            "Your Meerkat verification code",
            f"Your Meerkat code is {code}. It expires in {CODE_MINUTES} minutes.\n\n"
            "If you didn't ask for this, you can ignore this email.",
        )
    except SendFailed:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute("UPDATE contact_verifications SET used_at = now() WHERE id = %s", (record_id,))
        raise HTTPException(status_code=502, detail="We couldn't send the email. Please try again later.")
    return {"sent": True, "expires_in_minutes": CODE_MINUTES}


@router.post("/verification/email/confirm")
def confirm_email_code(body: CodeBody, me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        row = usable_code(cur, me["id"], "email", me["email"])
        if not hmac.compare_digest(row["code_hash"], hash_code(me["id"], body.code.strip())):
            error = wrong_code(cur, row)
        else:
            error = None
            cur.execute("UPDATE contact_verifications SET used_at = now() WHERE id = %s", (row["id"],))
            # Only verify the address the code was sent to (in case the email changed meanwhile).
            cur.execute(
                f"UPDATE users SET email_verified_at = now() WHERE id = %s AND email = %s RETURNING {USER_COLUMNS}",
                (me["id"], row["target"]),
            )
            user = cur.fetchone()
    if error:
        raise error
    return own_profile(user)


# ---------- Phone ----------

@router.post("/verification/phone/send")
def send_phone_code(me: CurrentUser):
    if me["is_demo"]:
        raise HTTPException(status_code=403, detail="Demo accounts can't verify a phone number.")
    if not phone_available():
        raise HTTPException(status_code=503, detail="Phone verification isn't set up on this server yet.")
    if not me["phone"]:
        raise HTTPException(status_code=400, detail="Add your phone number first.")
    if me["phone_verified_at"]:
        raise HTTPException(status_code=409, detail="Your phone number is already verified.")
    with get_connection() as conn, conn.cursor() as cur:
        check_send_limits(cur, me["id"], "phone")
        record_id = start_code(cur, me["id"], "phone", me["phone"])
    try:
        twilio_start(me["phone"])
    except SendFailed:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute("UPDATE contact_verifications SET used_at = now() WHERE id = %s", (record_id,))
        raise HTTPException(status_code=502, detail="We couldn't send the text message. Please try again later.")
    return {"sent": True, "expires_in_minutes": CODE_MINUTES}


@router.post("/verification/phone/confirm")
def confirm_phone_code(body: CodeBody, me: CurrentUser):
    if not phone_available():
        raise HTTPException(status_code=503, detail="Phone verification isn't set up on this server yet.")
    with get_connection() as conn, conn.cursor() as cur:
        row = usable_code(cur, me["id"], "phone", me["phone"] or "")
    try:
        approved = twilio_check(row["target"], body.code.strip())
    except SendFailed:
        raise HTTPException(status_code=502, detail="We couldn't check the code right now. Please try again.")
    with get_connection() as conn, conn.cursor() as cur:
        if not approved:
            error = wrong_code(cur, row)
        else:
            error = None
            cur.execute("UPDATE contact_verifications SET used_at = now() WHERE id = %s", (row["id"],))
            cur.execute(
                f"UPDATE users SET phone_verified_at = now() WHERE id = %s AND phone = %s RETURNING {USER_COLUMNS}",
                (me["id"], row["target"]),
            )
            user = cur.fetchone()
    if error:
        raise error
    return own_profile(user)


# ---------- Age check ----------

class AgeCheckStart(BaseModel):
    consent: bool


@router.post("/verification/age/start")
def start_age_check(body: AgeCheckStart, me: CurrentUser):
    mode = age_check_mode()
    if mode is None:
        raise HTTPException(
            status_code=503,
            detail="Selfie age checks aren't available yet. No age badge is shown until a real provider is set up.",
        )
    if not body.consent:
        raise HTTPException(status_code=422, detail="Tick the box to agree to the described age-check process first.")
    if mode == "test":
        # TEST MODE: no image is taken or sent anywhere. Never counts as a real check (see users.badges).
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                f"""
                UPDATE users SET age_check_status = 'passed', age_check_provider = 'mock',
                       age_check_reference = %s, age_check_at = now()
                WHERE id = %s RETURNING {USER_COLUMNS}
                """,
                (f"test-{secrets.token_hex(4)}", me["id"]),
            )
            return {"test_mode": True, "user": own_profile(cur.fetchone())}
    # A real provider would return a hosted page to send the person to.
    return AGE_PROVIDERS[config.AGE_CHECK_PROVIDER.strip().lower()].start(me)
