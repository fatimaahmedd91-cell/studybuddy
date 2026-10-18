"""Loading people from the database and turning them into what the website receives.

Two shapes:
    public_profile(row)  what OTHER people may see (no email, phone, timetable or private settings)
    own_profile(row)     what YOU see about yourself (adds email, phone, timetable, settings)
"""

from app import config

# Every column except password_hash. Never select the hash unless you are checking a password.
USER_COLUMNS = (
    "id, email, name, pronouns, age, university, hook, bio, interests, looking_for, availability, "
    "avatar_emoji, avatar_color, photo_id, stickers, daily_goal_minutes, onboarded, is_demo, created_at, "
    "terms_version, terms_accepted_at, adult_confirmed_at, role, suspended_at, "
    "email_verified_at, phone, phone_verified_at, age_check_status, age_check_provider, age_check_at, "
    "timezone, discoverable, availability_audience, notification_prefs, consents, password_changed_at"
)

# Only checks that really happened can appear here, each with its own specific label.
# There is deliberately no general "verified" badge: none of these checks prove identity or safety.
BADGE_LABELS = {
    "email_verified": "Email verified",
    "phone_verified": "Phone verified",
    "age_checked": "Age checked",
}


def load_user(cur, user_id):
    cur.execute(f"SELECT {USER_COLUMNS} FROM users WHERE id = %s", (user_id,))
    return cur.fetchone()


def badges(row):
    """Specific verification labels for a person, e.g. ["email_verified"]."""
    result = []
    if row.get("email_verified_at"):
        result.append("email_verified")
    if row.get("phone_verified_at"):
        result.append("phone_verified")
    # A test-mode ("mock") result never counts as a real age check.
    if row.get("age_check_status") == "passed" and row.get("age_check_provider") not in (None, "", "mock"):
        result.append("age_checked")
    return result


def has_consent(row, key):
    """True if the person chose to turn on this optional feature (Settings → Privacy)."""
    return bool(((row.get("consents") or {}).get(key) or {}).get("granted"))


def visible_availability(owner, can_see_as_friend):
    """The owner's PUBLIC "free to hang out" times, if this viewer is allowed to use them.

    Private commitments (classes, shifts) are never part of this: see app/commitments.py.
    """
    audience = owner.get("availability_audience") or "everyone"
    if audience == "everyone" or (audience == "friends" and can_see_as_friend):
        return owner.get("availability") or {}
    return {}


def photo_url(row):
    return f"/api/photos/{row['photo_id']}" if row.get("photo_id") else None


def public_profile(row):
    return {
        "id": row["id"],
        "name": row["name"],
        "pronouns": row["pronouns"],
        "age": row["age"],
        "university": row["university"],
        "hook": row["hook"],
        "bio": row["bio"],
        "interests": row["interests"],
        "looking_for": row["looking_for"],
        "avatar_emoji": row["avatar_emoji"],
        "avatar_color": row["avatar_color"],
        "photo_url": photo_url(row),
        "stickers": row["stickers"],
        "is_demo": row["is_demo"],
        "badges": badges(row),
    }


def mini_profile(row):
    """Just enough to show a small avatar and a name (member lists, chat headers)."""
    return {
        "id": row["id"],
        "name": row["name"],
        "avatar_emoji": row["avatar_emoji"],
        "avatar_color": row["avatar_color"],
        "photo_url": photo_url(row),
        "is_demo": row["is_demo"],
    }


def own_profile(row):
    return {
        **public_profile(row),
        "email": row["email"],
        "email_verified": bool(row["email_verified_at"]),
        "phone": row["phone"],
        "phone_verified": bool(row["phone_verified_at"]),
        "availability": row["availability"],
        "availability_audience": row["availability_audience"],
        "daily_goal_minutes": row["daily_goal_minutes"],
        "onboarded": row["onboarded"],
        "timezone": row["timezone"],
        "discoverable": row["discoverable"],
        "notification_prefs": row["notification_prefs"] or {},
        "consents": {key: bool(value.get("granted")) for key, value in (row["consents"] or {}).items()},
        "role": row["role"],
        "age_check": {"status": row["age_check_status"], "provider": row["age_check_provider"], "at": row["age_check_at"]},
        "terms": {
            "accepted_version": row["terms_version"],
            "accepted_at": row["terms_accepted_at"],
            "current_version": config.TERMS_VERSION,
            "current": row["terms_version"] == config.TERMS_VERSION,
        },
    }


def is_complete(row):
    """A profile is ready for Discover once it has a name, university, an interest and a goal."""
    return bool(row["name"].strip() and row["university"].strip() and row["interests"] and row["looking_for"])
