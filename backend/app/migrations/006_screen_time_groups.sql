-- Screen-time groups: self-reported daily screen time, groups with a shared per-person target,
-- and leaderboards. See app/screen_time_groups.py.
-- Never edit this file after it has been merged: add a new numbered file instead.

-- Daily phone/device screen time that a person types in themselves ("self-reported").
-- Meerkat can't read device screen time from a website, so these are never "measured".
CREATE TABLE screen_time_entries (
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day        DATE NOT NULL,
    minutes    INT NOT NULL CHECK (minutes BETWEEN 0 AND 1440),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, day)
);

-- A screen-time accountability group. Each group uses ONE measurement for everyone, so
-- different kinds of numbers are never ranked against each other:
--   self_reported: the screen_time_entries above
--   in_app:        time actively spent in Meerkat (the app_time table)
CREATE TABLE st_groups (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name                 TEXT NOT NULL,
    description          TEXT NOT NULL DEFAULT '',
    metric               TEXT NOT NULL CHECK (metric IN ('self_reported', 'in_app')),
    -- One shared target, per person, per day (not a total for the whole group).
    daily_target_minutes INT NOT NULL CHECK (daily_target_minutes BETWEEN 10 AND 1440),
    -- Where each day starts and ends for this group (the creator's time zone).
    timezone             TEXT NOT NULL DEFAULT 'America/Toronto',
    created_by           BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Who is in a group. Only "active" members share their numbers with the group.
CREATE TABLE st_members (
    group_id   BIGINT NOT NULL REFERENCES st_groups(id) ON DELETE CASCADE,
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status     TEXT NOT NULL CHECK (status IN ('invited', 'active', 'declined', 'left')),
    invited_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    invited_at TIMESTAMPTZ,
    joined_at  TIMESTAMPTZ,
    left_at    TIMESTAMPTZ,
    PRIMARY KEY (group_id, user_id)
);
CREATE INDEX st_members_user_idx ON st_members (user_id, status);

-- Tidy-up: a group with no active members left is deleted (with its invitations), so nothing
-- private is left behind when the last person leaves or deletes their account.
-- A "trigger" is a small function the database runs by itself after members change.
CREATE FUNCTION st_delete_empty_groups() RETURNS trigger AS $$
BEGIN
    DELETE FROM st_groups g
    WHERE NOT EXISTS (SELECT 1 FROM st_members m WHERE m.group_id = g.id AND m.status = 'active');
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER st_members_tidy_up
    AFTER UPDATE OR DELETE ON st_members
    FOR EACH STATEMENT EXECUTE FUNCTION st_delete_empty_groups();
