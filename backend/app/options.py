"""Lists the whole app shares: friendship goals, suggested interests, universities, and time slots.

The website reads these from GET /api/options, so changing a list here changes the sign-up form too.
"""

from app.config import MIN_AGE  # noqa: F401  (the minimum age is set in config.py, default 18)

# What someone is looking for in a friend. People pick from this list, so matching can compare them.
FRIENDSHIP_GOALS = [
    "Study buddy",
    "Gym or sports partner",
    "Food and coffee hangouts",
    "Clubs and campus events",
    "Gaming",
    "Creative projects",
    "Exploring the city",
    "Someone to talk to",
]

# Suggestions shown while typing. People can also type their own interests.
SUGGESTED_INTERESTS = [
    "Anime", "Art", "Badminton", "Basketball", "Board games", "Books", "Cafes", "Chess", "Coding",
    "Cooking", "Dance", "Fitness", "Gaming", "Hackathons", "Hiking", "K-pop", "Movies", "Music",
    "Photography", "Podcasts", "Running", "Soccer", "Travel", "Volunteering", "Yoga",
]

# Suggestions for the university field. Any university can be typed in.
SUGGESTED_UNIVERSITIES = [
    "UofT Scarborough", "UofT St. George", "UofT Mississauga", "York University",
    "Toronto Metropolitan University", "OCAD University", "Centennial College", "Seneca Polytechnic",
]

DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
SLOTS = ["morning", "afternoon", "evening"]

