"""Simple limits that stop one person (or script) from flooding the app.

Each limiter remembers recent attempts in memory, per key (a user id or an IP address).
This is basic protection for a hackathon app running as one server process, not a
complete anti-abuse system.
"""

import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

_all_limiters = []


class RateLimiter:
    def __init__(self, limit, window_seconds, message="Too many requests. Please wait a bit and try again."):
        self.limit = limit
        self.window = window_seconds
        self.message = message
        self.hits = defaultdict(deque)
        _all_limiters.append(self)

    def check(self, key):
        """Counts one attempt for this key, or raises 429 if the key is over the limit."""
        now = time.monotonic()
        recent = self.hits[key]
        while recent and now - recent[0] > self.window:
            recent.popleft()
        if len(recent) >= self.limit:
            raise HTTPException(status_code=429, detail=self.message)
        recent.append(now)


def client_ip(request: Request):
    """The visitor's address.

    Behind Caddy, uvicorn (run with --proxy-headers) has already swapped in the real address from
    X-Forwarded-For, trusting only the proxy on 127.0.0.1. We don't read the header ourselves,
    because a visitor could put any address in it.
    """
    return request.client.host if request.client else "unknown"


def reset_all():
    """Forget every recorded attempt. Used by the tests."""
    for limiter in _all_limiters:
        limiter.hits.clear()
