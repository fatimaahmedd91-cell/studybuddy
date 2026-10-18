"""Demo mode: "Try the demo" gives a judge (or anyone) a ready-made account without sharing personal data.

POST /api/auth/demo   creates a fresh demo account and logs it in

Each click makes a NEW demo account (so visitors don't see each other's changes). It starts with
a filled-in fictional profile, two friend requests waiting, and one friend with a short chat.
Demo accounts are hidden from Discover, are deleted after 24 hours (with any groups and events they
made), and are all marked as demo. `python -m app.seed --reset --yes` removes them straight away.
"""

import secrets

from fastapi import APIRouter, HTTPException, Request

from app import config
from app import seed_data as data
from app.db import get_connection
from app.notifications import notify
from app.ratelimit import RateLimiter, client_ip
from app.security import create_token
from app.seed import DEMO_DOMAIN, add_commitments, demo_people_ids, insert_demo_person, remove_old_explorers, seed
from app.users import load_user, own_profile

router = APIRouter(prefix="/api")

demo_limit = RateLimiter(20, 3600, "Too many demo accounts from this network. Try again later.")


@router.post("/auth/demo", status_code=201)
def start_demo(request: Request):
    if not config.DEMO_MODE_ENABLED:
        raise HTTPException(status_code=403, detail="The demo is turned off right now.")
    demo_limit.check(client_ip(request))

    with get_connection() as conn, conn.cursor() as cur:
        remove_old_explorers(cur)
        seed(cur)  # makes sure the fictional people exist (does nothing if they already do)
        people = demo_people_ids(cur)
        me = insert_demo_person(cur, data.DEMO_EXPLORER, f"explorer-{secrets.token_hex(6)}@{DEMO_DOMAIN}")
        add_commitments(cur, me, data.DEMO_EXPLORER_SCHEDULE)

        for name in data.DEMO_INCOMING_REQUESTS:
            if name in people:
                cur.execute(
                    "INSERT INTO friendships (requester_id, addressee_id, status) VALUES (%s, %s, 'pending')",
                    (people[name], me),
                )
                notify(cur, me, "friend_request", f"{name} sent you a friend request", "/friends", people[name])

        friend = people.get(data.DEMO_FRIEND)
        if friend:
            cur.execute(
                "INSERT INTO friendships (requester_id, addressee_id, status, accepted_at)"
                " VALUES (%s, %s, 'accepted', now())",
                (friend, me),
            )
            for body in data.DEMO_FRIEND_MESSAGES:
                cur.execute("INSERT INTO messages (sender_id, recipient_id, body) VALUES (%s, %s, %s)", (friend, me, body))
            notify(cur, me, "message", f"New message from {data.DEMO_FRIEND}", f"/messages?with={friend}", friend)

        user = load_user(cur, me)
        token = create_token(me)
    return {"access_token": token, "token_type": "bearer", "user": own_profile(user)}
