"""Accounts: sign up, log in, and finding out who is making a request.

POST /api/auth/signup  creates an account and returns a token
POST /api/auth/login   checks email and password and returns a token
(Forgot password and change password are in app/account.py.)
Every other endpoint uses current_user() to require a valid token in the header
"Authorization: Bearer <token>". It also refuses suspended accounts, and accounts that haven't
accepted the current Terms of Service yet (except for the few endpoints listed in TERMS_EXEMPT).
"""

from typing import Annotated

import psycopg2
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, Field, StringConstraints

from app import config
from app.db import get_connection
from app.ratelimit import RateLimiter, client_ip
from app.security import DUMMY_HASH, create_token, hash_password, issued_before, read_token_claims, verify_password
from app.users import USER_COLUMNS, load_user, own_profile

router = APIRouter(prefix="/api")

signup_limit = RateLimiter(10, 3600, "Too many sign-ups from this network. Try again later.")
login_limit = RateLimiter(10, 600, "Too many login attempts. Wait 10 minutes and try again.")

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: Name
    # Must be true: the unticked sign-up checkbox "I am at least 18 years old, and I agree to the
    # Terms of Service and Community Guidelines." (18 is config.MIN_AGE.)
    accept_terms: bool
    # The Terms version the person was shown. If given, it must be the current one.
    terms_version: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


# Note: the %s placeholders below let psycopg2 insert values safely.
# Never build SQL by pasting user input into the text (that allows "SQL injection").


@router.post("/auth/signup", status_code=201)
def signup(body: SignupRequest, request: Request):
    if not body.accept_terms:
        raise HTTPException(
            status_code=422,
            detail=f"To join Meerkat you need to be {config.MIN_AGE} or older and agree to the Terms of Service.",
        )
    if body.terms_version and body.terms_version != config.TERMS_VERSION:
        raise HTTPException(status_code=409, detail="The Terms have changed. Reload the page and read the new version.")
    signup_limit.check(client_ip(request))
    password_hash = hash_password(body.password)
    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO users (email, password_hash, name, terms_version, terms_accepted_at, adult_confirmed_at)
                VALUES (%s, %s, %s, %s, now(), now()) RETURNING {USER_COLUMNS}
                """,
                (body.email.lower(), password_hash, body.name, config.TERMS_VERSION),
            )
            user = cur.fetchone()
            # Made inside the "with", so if this fails the new account is not saved either.
            token = create_token(user["id"])
    except psycopg2.errors.UniqueViolation:
        raise HTTPException(status_code=409, detail="An account with this email already exists. Try logging in.")
    return {"access_token": token, "token_type": "bearer", "user": own_profile(user)}


@router.post("/auth/login")
def login(body: LoginRequest, request: Request):
    login_limit.check(f"{client_ip(request)}:{body.email.lower()}")
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT id, password_hash, suspended_at FROM users WHERE email = %s AND is_demo = FALSE", (body.email.lower(),)
        )
        row = cur.fetchone()
        # Check against a made-up hash when the email is unknown, so both cases take the same time.
        password_ok = verify_password(body.password, row["password_hash"] if row else DUMMY_HASH)
        if row is None or not password_ok:
            # Same message for both cases, so nobody can use this to find out who has an account.
            raise HTTPException(status_code=401, detail="Wrong email or password.")
        if row["suspended_at"]:
            raise HTTPException(status_code=403, detail=SUSPENDED)
        user = load_user(cur, row["id"])
    return {"access_token": create_token(user["id"]), "token_type": "bearer", "user": own_profile(user)}


# auto_error=False lets us send our own 401 message when the header is missing.
bearer = HTTPBearer(auto_error=False)

SUSPENDED = "This account is suspended. If you think this is a mistake, contact Meerkat's moderators."

# What someone can still do before accepting the current Terms: see their account, accept,
# delete their account, download their data, or send a privacy request.
TERMS_EXEMPT = {
    ("GET", "/api/me"),
    ("POST", "/api/me/accept-terms"),
    ("DELETE", "/api/me"),
    ("GET", "/api/me/export"),
    ("POST", "/api/privacy-requests"),
}


def current_user(request: Request, credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]):
    """Finds the logged-in person from the "Authorization: Bearer <token>" header, or answers 401.

    Any endpoint that needs a logged-in person adds:  me: CurrentUser
    Suspended accounts get 403. So do accounts that haven't accepted the current Terms
    (detail "terms_required"), except for the TERMS_EXEMPT endpoints.
    Tokens made before the last password change get 401, so a new password logs out every other device.
    """
    claims = read_token_claims(credentials.credentials) if credentials else None
    user = None
    if claims is not None:
        with get_connection() as conn, conn.cursor() as cur:
            user = load_user(cur, claims[0])
    if not user:
        raise HTTPException(status_code=401, detail="Please log in.", headers={"WWW-Authenticate": "Bearer"})
    if issued_before(claims[1], user["password_changed_at"]):
        raise HTTPException(
            status_code=401, detail="Your password was changed. Please log in again.", headers={"WWW-Authenticate": "Bearer"}
        )
    if user["suspended_at"]:
        raise HTTPException(status_code=403, detail=SUSPENDED)
    if user["terms_version"] != config.TERMS_VERSION and (request.method, request.url.path) not in TERMS_EXEMPT:
        raise HTTPException(status_code=403, detail="terms_required")
    return user


CurrentUser = Annotated[dict, Depends(current_user)]
