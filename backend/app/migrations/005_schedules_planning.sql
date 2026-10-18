-- Private schedules, planning permissions, meeting areas and cached plan suggestions.
-- Never edit this file after it has been merged: add a new numbered file instead.

-- PRIVATE commitments: classes, work shifts and other things that make you busy.
-- Only their owner can ever read them. Plans only use them to work out free time, and only
-- when the owner allowed it for that plan (see planning_consents).
CREATE TABLE commitments (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    kind       TEXT NOT NULL DEFAULT 'other' CHECK (kind IN ('class', 'work', 'other')),
    location   TEXT NOT NULL DEFAULT '',
    -- 'none' = happens once, on start_date. 'weekly' = every week on weekday, from start_date to end_date.
    recurrence TEXT NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none', 'weekly')),
    weekday    SMALLINT CHECK (weekday BETWEEN 0 AND 6),   -- 0 = Monday ... 6 = Sunday
    start_date DATE NOT NULL,
    end_date   DATE,                                        -- NULL = keeps repeating
    start_time TIME NOT NULL,
    end_time   TIME NOT NULL,                               -- earlier than start_time = ends the next day
    timezone   TEXT NOT NULL DEFAULT 'America/Toronto',
    source     TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ics', 'ai')),
    import_key TEXT,                                        -- stops the same imported entry being saved twice
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (recurrence = 'none' OR weekday IS NOT NULL),
    CHECK (end_date IS NULL OR end_date >= start_date),
    CHECK (start_time <> end_time)
);
CREATE INDEX commitments_user_idx ON commitments (user_id);
CREATE UNIQUE INDEX commitments_import_key_idx ON commitments (user_id, import_key) WHERE import_key IS NOT NULL;

-- Travel or buffer time kept free before and after each commitment when planning.
ALTER TABLE users ADD COLUMN buffer_minutes SMALLINT NOT NULL DEFAULT 15 CHECK (buffer_minutes BETWEEN 0 AND 120);

-- Who may use your PRIVATE commitments to work out shared free time:
--   scope 'friends'  = plans a friend makes with you
--   scope 'group'    = plans made for that group (only while you're a member, and only if you
--                      allowed it during your current membership)
-- Without a row here, plans only see your public "free to hang out" times.
CREATE TABLE planning_consents (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scope      TEXT NOT NULL CHECK (scope IN ('friends', 'group')),
    group_id   BIGINT REFERENCES groups(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((scope = 'friends' AND group_id IS NULL) OR (scope = 'group' AND group_id IS NOT NULL))
);
CREATE UNIQUE INDEX planning_consents_unique_idx ON planning_consents (user_id, scope, COALESCE(group_id, 0));

-- Your approximate meeting area (a campus, neighbourhood or rounded current location), never a home address.
-- Rounded to about 1 km. Deleted when you turn location suggestions off (app/account.py).
CREATE TABLE meeting_origins (
    user_id    BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    label      TEXT NOT NULL DEFAULT '',
    lat        DOUBLE PRECISION NOT NULL,
    lng        DOUBLE PRECISION NOT NULL,
    source     TEXT NOT NULL CHECK (source IN ('preset', 'device')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Saved hangout suggestions, reused for up to an hour while the inputs stay the same.
CREATE TABLE plan_suggestions (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    requester_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_hash     TEXT NOT NULL,
    payload      JSONB NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX plan_suggestions_lookup_idx ON plan_suggestions (requester_id, key_hash, created_at);
