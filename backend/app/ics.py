"""Reading calendar files (.ics, exported by Google Calendar, Outlook, Apple Calendar or a university timetable).

parse_ics(text, default_tz) returns PROPOSED commitments for the person to review. Nothing is saved here.
Each proposal carries "warnings" (plain sentences) and "flags" for anything we weren't sure about:
    uncertain_time        times were missing or guessed (for example all-day events)
    missing_dates         no clear end date for something that repeats
    ambiguous_recurrence  a repeat rule we can't represent exactly (not weekly, every 2 weeks, skipped dates...)

Only weekly repeats are supported (that's how most timetables work). Anything else becomes a one-time
entry on its first date, with a warning, so the person can fix it on the review screen.
"""

import hashlib
import re
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

MAX_EVENTS = 300
WEEKDAYS = {"MO": 0, "TU": 1, "WE": 2, "TH": 3, "FR": 4, "SA": 5, "SU": 6}
COURSE_CODE = re.compile(r"\b[A-Z]{3,4}\s?\d{2,3}[A-Z]?\d?\b")
CLASS_WORDS = ("lecture", "lec", "tutorial", "tut", "lab", "seminar", "class", "practical")
WORK_WORDS = ("shift", "work", "job")


def _unfold(text):
    """Calendar files wrap long lines: a line starting with a space continues the previous one."""
    lines = []
    for raw in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if raw[:1] in (" ", "\t") and lines:
            lines[-1] += raw[1:]
        elif raw.strip():
            lines.append(raw)
    return lines


def _split(line):
    """'DTSTART;TZID=America/Toronto:20260915T100000' -> ('DTSTART', {'TZID': 'America/Toronto'}, '2026...')."""
    head, _, value = line.partition(":")
    name, *params = head.split(";")
    found = {}
    for param in params:
        key, _, val = param.partition("=")
        found[key.upper()] = val.strip('"')
    return name.upper(), found, value


def _unescape(value):
    return value.replace("\\n", " ").replace("\\N", " ").replace("\\,", ",").replace("\\;", ";").replace("\\\\", "\\").strip()


def _parse_when(value, params, default_tz):
    """Returns (datetime in its own zone or a date for all-day, zone name, warning or None)."""
    value = value.strip()
    if params.get("VALUE") == "DATE" or re.fullmatch(r"\d{8}", value):
        return date(int(value[:4]), int(value[4:6]), int(value[6:8])), default_tz, None
    match = re.fullmatch(r"(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z?)", value)
    if not match:
        raise ValueError(f"unreadable date {value!r}")
    y, mo, d, h, mi, s, utc = match.groups()
    naive = datetime(int(y), int(mo), int(d), int(h), int(mi), int(s or 0))
    if utc:
        # UTC times are shown in the person's own time zone.
        return naive.replace(tzinfo=timezone.utc).astimezone(ZoneInfo(default_tz)), default_tz, None
    tzid = params.get("TZID")
    if tzid:
        try:
            return naive.replace(tzinfo=ZoneInfo(tzid)), tzid, None
        except (ZoneInfoNotFoundError, ValueError):
            return naive.replace(tzinfo=ZoneInfo(default_tz)), default_tz, f"Unknown time zone “{tzid}”; we assumed {default_tz}."
    return naive.replace(tzinfo=ZoneInfo(default_tz)), default_tz, f"No time zone in the file; we assumed {default_tz}."


def _duration(value):
    """'PT1H30M' -> timedelta(hours=1, minutes=30)."""
    match = re.fullmatch(r"P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?", value.strip())
    if not match:
        return None
    w, d, h, m, s = (int(x or 0) for x in match.groups())
    return timedelta(weeks=w, days=d, hours=h, minutes=m, seconds=s)


def guess_kind(title):
    lowered = title.lower()
    if COURSE_CODE.search(title) or any(re.search(rf"\b{w}\b", lowered) for w in CLASS_WORDS):
        return "class"
    if any(re.search(rf"\b{w}\b", lowered) for w in WORK_WORDS):
        return "work"
    return "other"


def _events(lines):
    current = None
    for line in lines:
        name, params, value = _split(line)
        if name == "BEGIN" and value.upper() == "VEVENT":
            current = {}
        elif name == "END" and value.upper() == "VEVENT":
            if current is not None:
                yield current
            current = None
        elif current is not None and name not in current:
            current[name] = (params, value)


def parse_ics(text, default_tz):
    """Proposed commitments from a calendar file. Raises ValueError if it isn't a calendar file."""
    if "BEGIN:VCALENDAR" not in text.upper() and "BEGIN:VEVENT" not in text.upper():
        raise ValueError("This doesn't look like a calendar (.ics) file.")
    proposals = []
    for event in _events(_unfold(text)):
        if len(proposals) >= MAX_EVENTS:
            break
        if "DTSTART" not in event:
            continue
        proposals.extend(_proposals_for(event, default_tz))
    return proposals


def _proposals_for(event, default_tz):
    warnings, flags = [], {"uncertain_time": False, "missing_dates": False, "ambiguous_recurrence": False}
    title = _unescape(event.get("SUMMARY", ({}, "Untitled"))[1])[:80] or "Untitled"
    location = _unescape(event.get("LOCATION", ({}, ""))[1])[:120]
    uid = _unescape(event.get("UID", ({}, ""))[1])

    start, tz_name, warning = _parse_when(event["DTSTART"][1], event["DTSTART"][0], default_tz)
    if warning:
        warnings.append(warning)
        flags["uncertain_time"] = True

    if isinstance(start, date) and not isinstance(start, datetime):
        # All-day: count the whole day as busy, and say so.
        start_day, start_time, end_time = start, time(0, 0), time(23, 55)
        warnings.append("All-day event: we marked the whole day as busy. Add times if it's shorter.")
        flags["uncertain_time"] = True
    else:
        end = None
        if "DTEND" in event:
            end, _, _ = _parse_when(event["DTEND"][1], event["DTEND"][0], tz_name)
            if isinstance(end, datetime):
                end = end.astimezone(start.tzinfo)
            else:
                end = None
        elif "DURATION" in event and _duration(event["DURATION"][1]):
            end = start + _duration(event["DURATION"][1])
        if end is None or end <= start:
            end = start + timedelta(hours=1)
            warnings.append("No end time: we assumed it lasts 1 hour.")
            flags["uncertain_time"] = True
        if end - start > timedelta(hours=24):
            warnings.append("Lasts longer than a day: only the first day was kept.")
            flags["uncertain_time"] = True
            end = datetime.combine(start.date(), time(23, 55), tzinfo=start.tzinfo)
        start_day, start_time, end_time = start.date(), start.time().replace(second=0), end.time().replace(second=0)
        if start_time == end_time:
            end_time = (datetime.combine(start_day, start_time) + timedelta(minutes=5)).time()

    base = {
        "title": title, "kind": guess_kind(title), "location": location, "start_time": start_time.strftime("%H:%M"),
        "end_time": end_time.strftime("%H:%M"), "timezone": tz_name, "source": "ics",
    }

    rule = {}
    if "RRULE" in event:
        for part in event["RRULE"][1].split(";"):
            key, _, val = part.partition("=")
            rule[key.upper()] = val
    if "EXDATE" in event:
        warnings.append("Some dates in this series were cancelled in your calendar; they still show as busy here.")
        flags["ambiguous_recurrence"] = True

    def key_for(extra=""):
        raw = uid or f"{title}|{start_day}|{start_time}|{end_time}"
        return "ics:" + hashlib.sha256(f"{raw}{extra}".encode()).hexdigest()[:24]

    if not rule:
        return [{**base, "recurrence": "none", "weekday": None, "start_date": start_day.isoformat(), "end_date": None,
                 "import_key": key_for(), "warnings": warnings, "flags": flags}]

    if rule.get("FREQ") != "WEEKLY":
        warnings.append(f"Repeats {rule.get('FREQ', 'in an unusual way').lower()}: only the first date was kept.")
        flags["ambiguous_recurrence"] = True
        return [{**base, "recurrence": "none", "weekday": None, "start_date": start_day.isoformat(), "end_date": None,
                 "import_key": key_for(), "warnings": warnings, "flags": flags}]

    if rule.get("INTERVAL", "1") != "1":
        warnings.append(f"Repeats every {rule['INTERVAL']} weeks: we saved it as every week. Check it.")
        flags["ambiguous_recurrence"] = True
    weekdays = [WEEKDAYS[d[-2:]] for d in rule.get("BYDAY", "").split(",") if d[-2:] in WEEKDAYS] or [start_day.weekday()]

    end_date = None
    if "UNTIL" in rule:
        until, _, _ = _parse_when(rule["UNTIL"], {}, tz_name)
        end_date = until.date() if isinstance(until, datetime) else until
    elif "COUNT" in rule and rule["COUNT"].isdigit():
        weeks = -(-int(rule["COUNT"]) // len(weekdays))
        end_date = start_day + timedelta(weeks=weeks) - timedelta(days=1)
        warnings.append("The end date was worked out from the number of repeats. Check it.")
    else:
        warnings.append("This repeats with no end date. Add one if it stops (for example, the end of term).")
        flags["missing_dates"] = True

    return [{**base, "recurrence": "weekly", "weekday": wd, "start_date": start_day.isoformat(),
             "end_date": end_date.isoformat() if end_date else None, "import_key": key_for(f":{wd}"),
             "warnings": list(warnings), "flags": dict(flags)}
            for wd in sorted(set(weekdays))]
