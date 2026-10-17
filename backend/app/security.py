"""Password hashing and login tokens.

- Passwords are hashed with Argon2. We store only the hash, never the password itself.
- After signup or login, the user gets a JWT ("JSON Web Token"). It is a signed note that says
  "this is user 5, valid until next week". The app sends it back with every request, and we
  check the signature with JWT_SECRET, so nobody can make a fake one.
"""

from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from app import config

TOKEN_LIFETIME = timedelta(days=7)
ALGORITHM = "HS256"
MIN_SECRET_LENGTH = 32

_hasher = PasswordHasher()

# When someone logs in with an email that has no account, we still check their password
# against this made-up hash. That way both cases take the same time, and the response time
# does not reveal which emails have accounts.
DUMMY_HASH = _hasher.hash("not-a-real-password")


class TokenSecretMissing(Exception):
    """Raised when JWT_SECRET is missing or too short."""


def hash_password(password):
    return _hasher.hash(password)


def verify_password(password, password_hash):
    """True if the password matches the hash, False otherwise."""
    try:
        return _hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def _secret():
    if len(config.JWT_SECRET) < MIN_SECRET_LENGTH:
        raise TokenSecretMissing(f"JWT_SECRET must be at least {MIN_SECRET_LENGTH} characters")
    return config.JWT_SECRET


def create_token(user_id):
    now = datetime.now(timezone.utc)
    payload = {"sub": str(user_id), "iat": now, "exp": now + TOKEN_LIFETIME}
    return jwt.encode(payload, _secret(), algorithm=ALGORITHM)


def read_token(token):
    """Returns the user id inside a valid token, or None if the token is fake, broken, or expired."""
    secret = _secret()
    try:
        payload = jwt.decode(token, secret, algorithms=[ALGORITHM], options={"require": ["exp", "sub"]})
        return int(payload["sub"])
    except (jwt.InvalidTokenError, ValueError):
        return None
