"""Fictional demo content. Every person here is made up; none are real students.

Edit these lists to change what the demo shows, then run:  python -m app.seed --reset --yes
"""

MORNING, AFTERNOON, EVENING = "morning", "afternoon", "evening"

DEMO_PEOPLE = [
    {
        "name": "Amira Khan", "pronouns": "she/her", "age": 19, "university": "UofT Scarborough",
        "avatar_emoji": "🦊", "avatar_color": "#e05a10",
        "hook": "Will trade flashcards for bubble tea.",
        "bio": "Second-year computer science. I like quiet cafés, anime nights, and badminton on Fridays.",
        "interests": ["Coding", "Cafes", "Anime", "Badminton"],
        "looking_for": ["Study buddy", "Food and coffee hangouts"],
        "availability": {"Mon": [AFTERNOON], "Tue": [AFTERNOON, EVENING], "Wed": [MORNING], "Thu": [AFTERNOON]},
    },
    {
        "name": "Daniel Osei", "pronouns": "he/him", "age": 20, "university": "UofT Scarborough",
        "avatar_emoji": "🐻", "avatar_color": "#1f9fc4",
        "hook": "Debugging my life, one commit at a time.",
        "bio": "Math and CS. Always down for pickup basketball or a long co-op game.",
        "interests": ["Coding", "Gaming", "Basketball", "Cafes"],
        "looking_for": ["Study buddy", "Gaming"],
        "availability": {"Mon": [MORNING], "Tue": [AFTERNOON], "Wed": [MORNING, AFTERNOON], "Sat": [AFTERNOON]},
    },
    {
        "name": "Priya Nair", "pronouns": "she/her", "age": 18, "university": "UofT Scarborough",
        "avatar_emoji": "🦉", "avatar_color": "#a8860a",
        "hook": "Ask me for book recommendations at your own risk.",
        "bio": "First-year life sci. I sketch in the library and do yoga to stay sane.",
        "interests": ["Books", "Art", "Cafes", "Yoga"],
        "looking_for": ["Creative projects", "Food and coffee hangouts"],
        "availability": {"Mon": [EVENING], "Wed": [AFTERNOON], "Fri": [MORNING, AFTERNOON], "Sun": [MORNING]},
    },
    {
        "name": "Marcus Lee", "pronouns": "he/him", "age": 21, "university": "York University",
        "avatar_emoji": "🐼", "avatar_color": "#d25b8c",
        "hook": "Ranked in three games, unranked in sleep.",
        "bio": "Stats major. Looking for people to play with and a basketball crew.",
        "interests": ["Gaming", "Basketball", "Music", "Anime"],
        "looking_for": ["Gaming", "Gym or sports partner"],
        "availability": {"Tue": [EVENING], "Thu": [EVENING], "Sat": [AFTERNOON, EVENING]},
    },
    {
        "name": "Sofia Alvarez", "pronouns": "she/her", "age": 20, "university": "UofT Scarborough",
        "avatar_emoji": "🦋", "avatar_color": "#4f9a36",
        "hook": "Will plan the trip if you bring snacks.",
        "bio": "Psych student who loves photo walks, travel planning and Sunday yoga.",
        "interests": ["Travel", "Photography", "Cafes", "Yoga"],
        "looking_for": ["Exploring the city", "Food and coffee hangouts"],
        "availability": {"Wed": [EVENING], "Fri": [AFTERNOON], "Sat": [MORNING], "Sun": [MORNING, AFTERNOON]},
    },
    {
        "name": "Ethan Brooks", "pronouns": "he/him", "age": 19, "university": "UofT Scarborough",
        "avatar_emoji": "🐯", "avatar_color": "#e05a10",
        "hook": "Gym at 7am, code at 7pm.",
        "bio": "CS and fitness. I'd love a gym partner who also likes hackathons.",
        "interests": ["Fitness", "Coding", "Basketball", "Hackathons"],
        "looking_for": ["Gym or sports partner", "Study buddy"],
        "availability": {"Mon": [MORNING, EVENING], "Wed": [MORNING], "Thu": [AFTERNOON], "Fri": [MORNING]},
    },
    {
        "name": "Hana Sato", "pronouns": "she/they", "age": 18, "university": "UofT Scarborough",
        "avatar_emoji": "🐰", "avatar_color": "#d25b8c",
        "hook": "Doodling in the margins since forever.",
        "bio": "Arts and psych. Anime club regular, always carrying a sketchbook.",
        "interests": ["Art", "Anime", "Cafes", "Books"],
        "looking_for": ["Creative projects", "Clubs and campus events"],
        "availability": {"Tue": [AFTERNOON], "Thu": [AFTERNOON, EVENING], "Sat": [AFTERNOON]},
    },
    {
        "name": "Omar Haddad", "pronouns": "he/him", "age": 22, "university": "Toronto Metropolitan University",
        "avatar_emoji": "🦁", "avatar_color": "#a8860a",
        "hook": "I'll teach you chess openings for coffee.",
        "bio": "Engineering. Chess club, board game nights, and the occasional game jam.",
        "interests": ["Chess", "Coding", "Board games", "Music"],
        "looking_for": ["Clubs and campus events", "Gaming"],
        "availability": {"Mon": [EVENING], "Wed": [EVENING], "Fri": [EVENING], "Sun": [AFTERNOON]},
    },
    {
        "name": "Chloe Tremblay", "pronouns": "she/her", "age": 20, "university": "UofT St. George",
        "avatar_emoji": "🐨", "avatar_color": "#1f9fc4",
        "hook": "Will drag you on a hike. You'll thank me.",
        "bio": "Environmental science. Hiking, music festivals, and film photography.",
        "interests": ["Hiking", "Music", "Travel", "Photography"],
        "looking_for": ["Exploring the city", "Gym or sports partner"],
        "availability": {"Sat": [MORNING, AFTERNOON], "Sun": [MORNING], "Fri": [AFTERNOON]},
    },
    {
        "name": "Jamal Reid", "pronouns": "he/him", "age": 21, "university": "UofT Scarborough",
        "avatar_emoji": "🐺", "avatar_color": "#4f9a36",
        "hook": "Hoops, podcasts, and too many playlists.",
        "bio": "Management student. Basketball most evenings, podcasts on the bus.",
        "interests": ["Basketball", "Music", "Podcasts", "Fitness"],
        "looking_for": ["Gym or sports partner", "Someone to talk to"],
        "availability": {"Mon": [EVENING], "Tue": [EVENING], "Thu": [EVENING], "Sat": [AFTERNOON]},
    },
    {
        "name": "Lena Petrova", "pronouns": "she/her", "age": 19, "university": "UofT Scarborough",
        "avatar_emoji": "🐧", "avatar_color": "#a8860a",
        "hook": "Will explain recursion with a chessboard.",
        "bio": "Math specialist. Chess, coding puzzles, and finding the best study spots.",
        "interests": ["Chess", "Books", "Coding", "Cafes"],
        "looking_for": ["Study buddy", "Clubs and campus events"],
        "availability": {"Mon": [AFTERNOON], "Tue": [AFTERNOON], "Wed": [MORNING], "Fri": [MORNING]},
    },
    {
        "name": "Tariq Aziz", "pronouns": "he/him", "age": 19, "university": "UofT Scarborough",
        "avatar_emoji": "🦅", "avatar_color": "#e05a10",
        "hook": "Building side projects I never finish.",
        "bio": "CS student. Hackathons, badminton, and board game nights with too many rules.",
        "interests": ["Coding", "Gaming", "Cafes", "Badminton", "Board games"],
        "looking_for": ["Study buddy", "Clubs and campus events"],
        "availability": {"Mon": [AFTERNOON], "Tue": [AFTERNOON, EVENING], "Thu": [AFTERNOON], "Sat": [EVENING]},
    },
]

# Accepted friendships between demo people (by name), so profiles have real friend counts.
DEMO_FRIENDSHIPS = [
    ("Amira Khan", "Tariq Aziz"), ("Amira Khan", "Lena Petrova"), ("Daniel Osei", "Marcus Lee"),
    ("Priya Nair", "Hana Sato"), ("Sofia Alvarez", "Chloe Tremblay"), ("Ethan Brooks", "Jamal Reid"),
    ("Omar Haddad", "Lena Petrova"), ("Tariq Aziz", "Daniel Osei"),
]

DEMO_GROUPS = [
    {
        "name": "CSCA08 Study Group",
        "description": "Weekly problem-set sessions for intro programming. Bring questions, leave with answers.",
        "tags": ["Coding", "Study"],
        "owner": "Lena Petrova",
        "members": ["Amira Khan", "Daniel Osei", "Tariq Aziz", "Ethan Brooks"],
        "posts": [
            ("Lena Petrova", "We're meeting in the library group room 2 this week. Bring your laptop!"),
            ("Tariq Aziz", "Can we go over recursion again? Question 4 broke my brain."),
        ],
    },
    {
        "name": "Badminton Drop-in Crew",
        "description": "Friendly badminton at the Pan Am Sports Centre. All levels welcome.",
        "tags": ["Badminton", "Fitness"],
        "owner": "Amira Khan",
        "members": ["Tariq Aziz", "Ethan Brooks"],
        "posts": [("Amira Khan", "Court is booked for Friday afternoon. Who's in?")],
    },
    {
        "name": "Anime & Sketch Club",
        "description": "Watch an episode, then draw your favourite scene. Snacks shared.",
        "tags": ["Anime", "Art"],
        "owner": "Hana Sato",
        "members": ["Amira Khan", "Marcus Lee", "Priya Nair"],
        "posts": [("Hana Sato", "Voting on next week's show: drop your picks here!")],
    },
    {
        "name": "Board Games & Bubble Tea",
        "description": "Strategy games, party games, and bubble tea at the student centre.",
        "tags": ["Board games", "Cafes"],
        "owner": "Omar Haddad",
        "members": ["Tariq Aziz", "Lena Petrova", "Daniel Osei"],
        "posts": [("Omar Haddad", "I'm bringing Catan and Codenames on Wednesday.")],
    },
    {
        "name": "Campus Photo Walks",
        "description": "Short walks around campus and the Highland Creek trail with cameras or phones.",
        "tags": ["Photography", "Hiking"],
        "owner": "Sofia Alvarez",
        "members": ["Chloe Tremblay", "Priya Nair"],
        "posts": [("Sofia Alvarez", "Golden hour is around 6pm this week.")],
    },
    {
        "name": "Morning Gym Buddies",
        "description": "Accountability group for early workouts. Beginners very welcome.",
        "tags": ["Fitness", "Basketball"],
        "owner": "Ethan Brooks",
        "members": ["Jamal Reid", "Daniel Osei"],
        "posts": [("Ethan Brooks", "7am Monday, meet at the front desk.")],
    },
]

# Times are local Toronto times, counted from the day the seed runs.
DEMO_EVENTS = [
    {
        "title": "CSCA08 Problem Set Session", "group": "CSCA08 Study Group", "organiser": "Lena Petrova",
        "days_from_now": 2, "hour": 16, "hours": 2, "location": "Library, Group Study Room 2",
        "description": "Work through this week's problem set together.",
        "going": ["Amira Khan", "Tariq Aziz", "Daniel Osei"],
    },
    {
        "title": "Friday Badminton", "group": "Badminton Drop-in Crew", "organiser": "Amira Khan",
        "days_from_now": 4, "hour": 15, "hours": 2, "location": "Toronto Pan Am Sports Centre",
        "description": "Rackets available at the desk. All levels.",
        "going": ["Tariq Aziz", "Ethan Brooks"],
    },
    {
        "title": "Board Game and Bubble Tea Social", "group": "Board Games & Bubble Tea", "organiser": "Omar Haddad",
        "days_from_now": 3, "hour": 18, "hours": 3, "location": "Student Centre Lounge",
        "description": "Strategy and party games. Bubble tea run at 7.",
        "going": ["Lena Petrova", "Tariq Aziz"],
    },
    {
        "title": "Golden Hour Photo Walk", "group": "Campus Photo Walks", "organiser": "Sofia Alvarez",
        "days_from_now": 5, "hour": 17, "hours": 1, "location": "Highland Creek trail entrance",
        "description": "A relaxed walk with cameras or phones.",
        "going": ["Chloe Tremblay"],
    },
    {
        "title": "Online Study Hall", "group": None, "organiser": "Ethan Brooks",
        "days_from_now": 1, "hour": 20, "hours": 2, "online_url": "https://meet.example.com/friendfinder-study-hall",
        "description": "Cameras optional. 50 minutes focus, 10 minutes chat.",
        "going": ["Jamal Reid", "Amira Khan"],
    },
    {
        "title": "Anime Watch Party", "group": "Anime & Sketch Club", "organiser": "Hana Sato",
        "days_from_now": 6, "hour": 19, "hours": 2, "location": "Arts and Administration Building, Room 160",
        "description": "Episode, snacks, and a sketch session after.",
        "going": ["Marcus Lee", "Priya Nair"],
    },
]

# The profile every "Try the demo" account starts with.
DEMO_EXPLORER = {
    "name": "Demo Explorer", "pronouns": "they/them", "age": None, "university": "UofT Scarborough",
    "avatar_emoji": "🧭", "avatar_color": "#1f9fc4",
    "hook": "Just exploring Meetkat!",
    "bio": "This is a demo account for trying Meetkat. Everything in it is made up.",
    "interests": ["Coding", "Cafes", "Board games", "Hiking"],
    "looking_for": ["Study buddy", "Clubs and campus events"],
    "availability": {"Mon": [AFTERNOON], "Tue": [AFTERNOON, EVENING], "Thu": [AFTERNOON], "Sat": [AFTERNOON]},
}

# For a new demo account: who has already sent a friend request, and who is already a friend.
DEMO_INCOMING_REQUESTS = ["Tariq Aziz", "Lena Petrova"]
DEMO_FRIEND = "Daniel Osei"
DEMO_FRIEND_MESSAGES = [
    "Hey! Saw you're into coding too 👋",
    "Want to grab a table at the library Tuesday afternoon?",
]

# ---------- Private schedules, planning permissions and meeting areas (all made up) ----------
# So a demo plan shows how private schedules work without anyone typing one in first.

# Weekly commitments: (title, kind, weekday 0=Mon … 6=Sun, starts "HH:MM", ends "HH:MM", place).
# An end time earlier than the start means it ends the next day (an overnight shift).
DEMO_SCHEDULES = {
    "Daniel Osei": [("MATA31 tutorial", "class", 1, "13:00", "14:00", "IC 130"),
                    ("Bookstore shift", "work", 5, "15:00", "18:00", "")],
    "Amira Khan": [("CSCA08 lecture", "class", 0, "11:00", "13:00", "SW 319"),
                   ("Badminton practice", "other", 3, "18:00", "20:00", "")],
    "Tariq Aziz": [("Cafe shift", "work", 2, "16:00", "21:00", ""),
                   ("STAB22 lecture", "class", 3, "10:00", "12:00", "AA 112")],
    "Lena Petrova": [("CSCA08 tutorial", "class", 1, "09:00", "10:00", "BV 260"),
                     ("Overnight library shift", "work", 4, "22:00", "02:00", "")],
}
# These people let plans their friends make use their private schedule (only free times are ever shown).
DEMO_PLANNING_FRIENDS = ["Daniel Osei", "Amira Khan", "Tariq Aziz"]
# These people let plans for these groups use their private schedule.
DEMO_PLANNING_GROUPS = {"CSCA08 Study Group": ["Lena Petrova", "Amira Khan", "Daniel Osei", "Tariq Aziz"]}
# Approximate meeting areas (keys of AREA_PRESETS in app/planning.py), never a home address.
DEMO_MEETING_AREAS = {"Daniel Osei": "utsc", "Amira Khan": "kennedy", "Tariq Aziz": "stc", "Lena Petrova": "uoft_st_george"}
# Every "Try the demo" account starts with this one, so its private schedule isn't empty.
DEMO_EXPLORER_SCHEDULE = [("Example: CSCA08 lab", "class", 1, "16:00", "17:00", "BV 473")]
