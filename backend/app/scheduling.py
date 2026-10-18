"""Working out when people are free. Plain functions (no database), so they're easy to read, test and edit.

Every time here is a timezone-aware datetime. An "interval" is a (start, end) pair with start < end.
Lists of intervals are kept sorted and non-overlapping by merge().

The rules you can change:
- SLOT_HOURS: what "morning", "afternoon" and "evening" mean in someone's public "free to hang out" grid.
- DEFAULT_DAY: if someone hasn't published free times but lets a plan use their private schedule,
  they count as free during these hours, apart from their commitments.
- Commitments block their time plus the person's buffer (travel time) before and after.
- MAX_DAYS, MIN_DURATION and MAX_DURATION limit what a plan can ask for.
- SLOT_STEP_MINUTES: slot start and end times are rounded to this many minutes.

This file never decides WHOSE schedule may be used: app/planning.py checks permissions first and
only passes in what it's allowed to use.
"""

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

SLOT_HOURS = {"morning": (8, 12), "afternoon": (12, 17), "evening": (17, 22)}
DEFAULT_DAY = (8, 22)
DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
MAX_DAYS = 14
MIN_DURATION = 15
MAX_DURATION = 480
SLOT_STEP_MINUTES = 5
MAX_SLOTS = 30


# ---------- Interval helpers ----------

def merge(intervals):
    """Sorts intervals and joins any that overlap or touch."""
    result = []
    for start, end in sorted(i for i in intervals if i[0] < i[1]):
        if result and start <= result[-1][1]:
            result[-1] = (result[-1][0], max(result[-1][1], end))
        else:
            result.append((start, end))
    return result


def subtract(free, busy):
    """Free time minus busy time: the parts of `free` that don't overlap `busy`."""
    result = []
    busy = merge(busy)
    for start, end in merge(free):
        cursor = start
        for b_start, b_end in busy:
            if b_end <= cursor or b_start >= end:
                continue
            if b_start > cursor:
                result.append((cursor, b_start))
            cursor = max(cursor, b_end)
            if cursor >= end:
                break
        if cursor < end:
            result.append((cursor, end))
    return result


def intersect(a, b):
    """Times that are in both lists."""
    result = []
    a, b = merge(a), merge(b)
    i = j = 0
    while i < len(a) and j < len(b):
        start = max(a[i][0], b[j][0])
        end = min(a[i][1], b[j][1])
        if start < end:
            result.append((start, end))
        if a[i][1] < b[j][1]:
            i += 1
        else:
            j += 1
    return result


def clip(intervals, start, end):
    """Only the parts between start and end."""
    return [(max(s, start), min(e, end)) for s, e in intervals if s < end and e > start]


def days(first, last):
    """Every date from first to last, inclusive."""
    return [first + timedelta(days=n) for n in range((last - first).days + 1)]


def at(day, hour, tz):
    """A time on a date in a time zone. hour can be a number (8) or a datetime.time."""
    clock = hour if isinstance(hour, time) else time(hour % 24)
    if not isinstance(hour, time) and hour >= 24:
        day = day + timedelta(days=hour // 24)
    return datetime.combine(day, clock, tzinfo=tz)


# ---------- Turning schedules into intervals ----------

def window(start_date, end_date, tz_name):
    """The planning window: from the start of start_date to the end of end_date, in the planner's time zone."""
    tz = ZoneInfo(tz_name)
    return at(start_date, 0, tz), at(end_date + timedelta(days=1), 0, tz)


def public_free_intervals(availability, tz_name, start_date, end_date):
    """Someone's public grid ({"Tue": ["afternoon"], ...}) as intervals, in THEIR time zone.

    A day either side is included so people in other time zones still line up; callers clip to the window.
    """
    tz = ZoneInfo(tz_name)
    found = []
    for day in days(start_date - timedelta(days=1), end_date + timedelta(days=1)):
        for slot in (availability or {}).get(DAY_NAMES[day.weekday()], []):
            if slot in SLOT_HOURS:
                first, last = SLOT_HOURS[slot]
                found.append((at(day, first, tz), at(day, last, tz)))
    return merge(found)


def default_day_intervals(tz_name, start_date, end_date):
    """DEFAULT_DAY on every date, in someone's time zone."""
    tz = ZoneInfo(tz_name)
    first, last = DEFAULT_DAY
    return merge([(at(day, first, tz), at(day, last, tz))
                  for day in days(start_date - timedelta(days=1), end_date + timedelta(days=1))])


def occurrences(commitment, start_date, end_date):
    """Each (start, end) of one commitment between two dates (with a day either side), in its own time zone.

    commitment is a dict with recurrence, weekday, start_date, end_date, start_time, end_time, timezone.
    An end_time at or before start_time means it finishes the next day (an overnight shift).
    """
    tz = ZoneInfo(commitment["timezone"])
    found = []
    for day in days(start_date - timedelta(days=1), end_date + timedelta(days=1)):
        if commitment["recurrence"] == "none":
            if day != commitment["start_date"]:
                continue
        else:
            if day.weekday() != commitment["weekday"] or day < commitment["start_date"]:
                continue
            if commitment["end_date"] and day > commitment["end_date"]:
                continue
        overnight = commitment["end_time"] <= commitment["start_time"]
        start = datetime.combine(day, commitment["start_time"], tzinfo=tz)
        end = datetime.combine(day + timedelta(days=1 if overnight else 0), commitment["end_time"], tzinfo=tz)
        found.append((start, end))
    return found


def busy_intervals(commitments, start_date, end_date, buffer_minutes):
    """All commitments as busy intervals, with the buffer added before and after each one."""
    pad = timedelta(minutes=buffer_minutes)
    return merge([(start - pad, end + pad)
                  for commitment in commitments
                  for start, end in occurrences(commitment, start_date, end_date)])


# ---------- Shared free slots ----------

def _round_up(moment):
    step = SLOT_STEP_MINUTES * 60
    seconds = moment.timestamp()
    rounded = -(-seconds // step) * step
    return datetime.fromtimestamp(rounded, tz=moment.tzinfo)


def _round_down(moment):
    step = SLOT_STEP_MINUTES * 60
    return datetime.fromtimestamp((moment.timestamp() // step) * step, tz=moment.tzinfo)


def shared_slots(free_lists, window_start, window_end, now, duration_minutes):
    """Times when EVERYONE in free_lists is free, at least duration_minutes long, in the future.

    free_lists has one list of free intervals per person. Returns up to MAX_SLOTS (start, end) pairs.
    """
    if not free_lists:
        return []
    shared = clip(merge(free_lists[0]), max(window_start, now), window_end)
    for free in free_lists[1:]:
        shared = intersect(shared, free)
    needed = timedelta(minutes=duration_minutes)
    slots = []
    for start, end in shared:
        start, end = _round_up(start), _round_down(end)
        if end - start >= needed:
            slots.append((start, end))
    return slots[:MAX_SLOTS]


def describe_slot(start, end, tz_name):
    """'Tue Oct 20, 14:00–17:00' in a time zone. Used for Gemini and template suggestions."""
    tz = ZoneInfo(tz_name)
    s, e = start.astimezone(tz), end.astimezone(tz)
    return f"{DAY_NAMES[s.weekday()]} {s:%b} {s.day}, {s:%H:%M}–{e:%H:%M}"


# ---------- Meeting area ----------

def midpoint(points, coarse=False):
    """The approximate geographic middle of some (lat, lng) points, rounded to about 1 km.

    coarse=True rounds to about 5 km instead. Use it for two people: you know your own area, so a
    precise halfway point would show roughly where the other person's area is.
    This is a straight-line average, fine across a city. It says nothing about travel time,
    transit routes, cost or accessibility.
    """
    lat = sum(p[0] for p in points) / len(points)
    lng = sum(p[1] for p in points) / len(points)
    if coarse:
        return round(round(lat * 20) / 20, 2), round(round(lng * 20) / 20, 2)
    return round(lat, 2), round(lng, 2)
