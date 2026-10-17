"""Loading people from the database and turning them into what the website receives.

Two shapes:
    public_profile(row)  what OTHER people may see (no email, no full timetable)
    own_profile(row)     what YOU see about yourself (adds email, timetable, settings)
"""

# Every column except password_hash. Never select the hash unless you are checking a password.
USER_COLUMNS = (
    "id, email, name, pronouns, age, university, hook, bio, interests, looking_for, availability, "
    "avatar_emoji, avatar_color, photo_id, stickers, daily_goal_minutes, onboarded, is_demo, created_at"
)


def load_user(cur, user_id):
    cur.execute(f"SELECT {USER_COLUMNS} FROM users WHERE id = %s", (user_id,))
    return cur.fetchone()


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
        "availability": row["availability"],
        "daily_goal_minutes": row["daily_goal_minutes"],
        "onboarded": row["onboarded"],
    }


def is_complete(row):
    """A profile is ready for Discover once it has a name, university, an interest and a goal."""
    return bool(row["name"].strip() and row["university"].strip() and row["interests"] and row["looking_for"])
