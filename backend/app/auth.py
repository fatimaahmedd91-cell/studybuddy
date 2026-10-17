"""Accounts: sign up, log in, and finding out who is making a request.

POST /api/auth/signup  creates an account and returns a token
POST /api/auth/login   checks email and password and returns a token
Every other endpoint uses current_user() to require a valid token in the header
"Authorization: Bearer <token>".
"""

from typing import Annotated

import psycopg2
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, Field, StringConstraints

from app.db import get_connection
from app.options import MIN_AGE
from app.ratelimit import RateLimiter, client_ip
from app.security import DUMMY_HASH, create_token, hash_password, read_token, verify_password
from app.users import USER_COLUMNS, load_user, own_profile

router = APIRouter(prefix="/api")

signup_limit = RateLimiter(10, 3600, "Too many sign-ups from this network. Try again later.")
login_limit = RateLimiter(10, 600, "Too many login attempts. Wait 10 minutes and try again.")

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: Name
    # Must be true. FriendFinder is for students aged 16 and up.
    confirm_age: bool


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


# Note: the %s placeholders below let psycopg2 insert values safely.
# Never build SQL by pasting user input into the text (that allows "SQL injection").


@router.post("/auth/signup", status_code=201)
def signup(body: SignupRequest, request: Request):
    if not body.confirm_age:
        raise HTTPException(status_code=422, detail=f"You need to be {MIN_AGE} or older to use FriendFinder.")
    signup_limit.check(client_ip(request))
    password_hash = hash_password(body.password)
    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                f"INSERT INTO users (email, password_hash, name) VALUES (%s, %s, %s) RETURNING {USER_COLUMNS}",
                (body.email.lower(), password_hash, body.name),
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
        cur.execute("SELECT id, password_hash FROM users WHERE email = %s AND is_demo = FALSE", (body.email.lower(),))
        row = cur.fetchone()
        # Check against a made-up hash when the email is unknown, so both cases take the same time.
        password_ok = verify_password(body.password, row["password_hash"] if row else DUMMY_HASH)
        if row is None or not password_ok:
            # Same message for both cases, so nobody can use this to find out who has an account.
            raise HTTPException(status_code=401, detail="Wrong email or password.")
        user = load_user(cur, row["id"])
    return {"access_token": create_token(user["id"]), "token_type": "bearer", "user": own_profile(user)}


# auto_error=False lets us send our own 401 message when the header is missing.
bearer = HTTPBearer(auto_error=False)


def current_user(credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]):
    """Finds the logged-in person from the "Authorization: Bearer <token>" header, or answers 401.

    Any endpoint that needs a logged-in person adds:  me: CurrentUser
    """
    user_id = read_token(credentials.credentials) if credentials else None
    if user_id is not None:
        with get_connection() as conn, conn.cursor() as cur:
            user = load_user(cur, user_id)
        if user:
            return user
    raise HTTPException(status_code=401, detail="Please log in.", headers={"WWW-Authenticate": "Bearer"})


CurrentUser = Annotated[dict, Depends(current_user)]
