"""How well two people match. Plain, visible rules, no AI.

Points (0 to 100):
    shared interests          10 points each, up to 40
    shared friendship goals   10 points each, up to 20
    same university           15 points
    overlapping free time      5 points per shared time slot, up to 25

Change the numbers in WEIGHTS to change how matching works. The reasons shown to people
come from the same facts, so the score is always explained.
"""

from app.options import DAYS, SLOTS

WEIGHTS = {
    "interest": 10,
    "interest_max": 40,
    "goal": 10,
    "goal_max": 20,
    "university": 15,
    "slot": 5,
    "slot_max": 25,
}


def _shared(mine, theirs):
    """Items in both lists, compared without caring about capitals or spaces. Keeps their spelling."""
    mine_lower = {item.strip().lower() for item in mine}
    return [item for item in theirs if item.strip().lower() in mine_lower]


def _join(items):
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + " and " + items[-1]


def shared_free_time(my_availability, their_availability):
    """Time slots where both people said they are free, like [{"day": "Tue", "slot": "afternoon"}]."""
    return [
        {"day": day, "slot": slot}
        for day in DAYS
        for slot in SLOTS
        if slot in my_availability.get(day, []) and slot in their_availability.get(day, [])
    ]


def compute_match(me, other):
    """Compares two profiles (dicts with interests, looking_for, university, availability)."""
    interests = _shared(me["interests"], other["interests"])
    goals = _shared(me["looking_for"], other["looking_for"])
    same_university = bool(me["university"].strip()) and (
        me["university"].strip().lower() == other["university"].strip().lower()
    )
    overlap = shared_free_time(me["availability"], other["availability"])

    score = (
        min(len(interests) * WEIGHTS["interest"], WEIGHTS["interest_max"])
        + min(len(goals) * WEIGHTS["goal"], WEIGHTS["goal_max"])
        + (WEIGHTS["university"] if same_university else 0)
        + min(len(overlap) * WEIGHTS["slot"], WEIGHTS["slot_max"])
    )

    reasons = []
    if interests:
        reasons.append(f"You both like {_join(interests)}")
    if goals:
        reasons.append(f"You're both looking for: {_join([g.lower() for g in goals])}")
    if same_university:
        reasons.append(f"You both go to {other['university'].strip()}")
    if overlap:
        first = overlap[0]
        more = f" (and {len(overlap) - 1} more time{'s' if len(overlap) > 2 else ''})" if len(overlap) > 1 else ""
        reasons.append(f"You're both free {first['day']} {first['slot']}{more}")

    return {
        "score": score,
        "reasons": reasons,
        "shared_interests": interests,
        "shared_goals": goals,
        "same_university": same_university,
        "overlap": overlap,
    }
