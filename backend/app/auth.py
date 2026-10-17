"""Account endpoints.

POST /api/auth/signup  creates an account and returns a token
POST /api/auth/login   checks email and password and returns a token
GET  /api/me           returns the logged-in user. Send the token as the header
                       "Authorization: Bearer <token>".
"""

from datetime import datetime
from typing import Annotated

import psycopg2
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, Field, StringConstraints

from app.db import get_connection
from app.security import DUMMY_HASH, create_token, hash_password, read_token, verify_password

router = APIRouter(prefix="/api")


# What requests and responses look like. FastAPI checks every request against these
# and answers 422 with an explanation if something is missing or wrong.

# A name with spaces trimmed off both ends, 1 to 60 characters long.
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: Name


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserOut(BaseModel):
    """What we send back about a user. It has no password field, so a hash can never leak out."""

    id: int
    email: str
    name: str
    created_at: datetime


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# Note: the %s placeholders below let psycopg2 insert values safely.
# Never build SQL by pasting user input into the text (that allows "SQL injection").


@router.post("/auth/signup", response_model=TokenOut, status_code=201)
def signup(body: SignupRequest):
    password_hash = hash_password(body.password)
    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                "INSERT INTO users (email, password_hash, name) VALUES (%s, %s, %s) "
                "RETURNING id, email, name, created_at",
                (body.email.lower(), password_hash, body.name),
            )
            user = cur.fetchone()
            # Made inside the "with", so if this fails the new account is not saved either.
            token = create_token(user["id"])
    except psycopg2.errors.UniqueViolation:
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    return {"access_token": token, "user": user}


@router.post("/auth/login", response_model=TokenOut)
def login(body: LoginRequest):
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT id, email, name, created_at, password_hash FROM users WHERE email = %s",
            (body.email.lower(),),
        )
        row = cur.fetchone()

    password_ok = verify_password(body.password, row["password_hash"] if row else DUMMY_HASH)
    if row is None or not password_ok:
        # Same message for both cases, so nobody can use this to find out who has an account.
        raise HTTPException(status_code=401, detail="Wrong email or password")

    user = {key: row[key] for key in ("id", "email", "name", "created_at")}
    return {"access_token": create_token(user["id"]), "user": user}


# auto_error=False lets us send our own 401 message when the header is missing.
bearer = HTTPBearer(auto_error=False)


def current_user(credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]):
    """Finds the logged-in user from the "Authorization: Bearer <token>" header, or answers 401.

    Any endpoint that needs a logged-in user can use it: user = Depends(current_user)
    """
    user_id = read_token(credentials.credentials) if credentials else None
    if user_id is not None:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute("SELECT id, email, name, created_at FROM users WHERE id = %s", (user_id,))
            user = cur.fetchone()
        if user:
            return user
    raise HTTPException(status_code=401, detail="Please log in", headers={"WWW-Authenticate": "Bearer"})


@router.get("/me", response_model=UserOut)
def me(user: Annotated[dict, Depends(current_user)]):
    return user
