"""Discover people and view someone's profile.

GET /api/people        everyone else with a finished profile, best match first.
                       Optional filters: ?university=  ?interest=  ?goal=  ?free_together=true  ?q=name
GET /api/people/{id}   one person's profile, why you match, and your friendship status
"""

from fastapi import APIRouter, HTTPException

from app.auth import CurrentUser
from app.db import get_connection
from app.matching import compute_match
from app.users import USER_COLUMNS, load_user, public_profile

router = APIRouter(prefix="/api")


def relationships(cur, my_id):
    """Your friendship status with everyone you have a request or friendship with.

    Returns {other_person_id: {"status": "friends" | "outgoing" | "incoming", "request_id": id}}.
    """
    cur.execute(
        "SELECT id, requester_id, addressee_id, status FROM friendships WHERE requester_id = %s OR addressee_id = %s",
        (my_id, my_id),
    )
    result = {}
    for row in cur.fetchall():
        other = row["addressee_id"] if row["requester_id"] == my_id else row["requester_id"]
        if row["status"] == "accepted":
            status = "friends"
        else:
            status = "outgoing" if row["requester_id"] == my_id else "incoming"
        result[other] = {"status": status, "request_id": row["id"]}
    return result


NO_RELATIONSHIP = {"status": "none", "request_id": None}


def person_card(me, other, relation):
    match = compute_match(me, other)
    return {
        **public_profile(other),
        "match": match,
        "relationship": relation or NO_RELATIONSHIP,
    }


@router.get("/people")
def discover(
    me: CurrentUser,
    university: str = "",
    interest: str = "",
    goal: str = "",
    free_together: bool = False,
    q: str = "",
):
    conditions = ["onboarded = TRUE", "id <> %s"]
    params = [me["id"]]
    if university.strip():
        conditions.append("lower(trim(university)) = lower(trim(%s))")
        params.append(university)
    if interest.strip():
        conditions.append("EXISTS (SELECT 1 FROM unnest(interests) AS i WHERE lower(i) = lower(trim(%s)))")
        params.append(interest)
    if goal.strip():
        conditions.append("%s = ANY(looking_for)")
        params.append(goal.strip())
    if q.strip():
        conditions.append("name ILIKE %s")
        params.append(f"%{q.strip()[:60]}%")

    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(f"SELECT {USER_COLUMNS} FROM users WHERE {' AND '.join(conditions)} LIMIT 300", params)
        others = cur.fetchall()
        relations = relationships(cur, me["id"])
        cur.execute(
            "SELECT DISTINCT trim(university) AS u FROM users WHERE onboarded = TRUE AND trim(university) <> '' ORDER BY 1"
        )
        universities = [row["u"] for row in cur.fetchall()]

    cards = [person_card(me, other, relations.get(other["id"])) for other in others]
    if free_together:
        cards = [card for card in cards if card["match"]["overlap"]]
    cards.sort(key=lambda card: (-card["match"]["score"], card["name"].lower()))
    return {"people": cards, "universities": universities}


@router.get("/people/{person_id}")
def person(person_id: int, me: CurrentUser):
    with get_connection() as conn, conn.cursor() as cur:
        other = load_user(cur, person_id)
        if not other or (not other["onboarded"] and other["id"] != me["id"]):
            raise HTTPException(status_code=404, detail="This person could not be found.")
        relation = relationships(cur, me["id"]).get(person_id)
    card = person_card(me, other, relation)
    card["is_me"] = other["id"] == me["id"]
    return card
