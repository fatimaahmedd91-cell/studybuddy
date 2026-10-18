-- Everything FriendFinder stores: profiles, friendships, messages, groups, events,
-- notifications, time in the app, and cached AI match notes.

-- Profile fields live on the users table (one row per person).
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS pronouns           TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS age                SMALLINT,
    ADD COLUMN IF NOT EXISTS university         TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS hook               TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS bio                TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS interests          TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS looking_for        TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS availability       JSONB NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS avatar_emoji       TEXT NOT NULL DEFAULT '🙂',
    ADD COLUMN IF NOT EXISTS avatar_color       TEXT NOT NULL DEFAULT '#d64d00',
    ADD COLUMN IF NOT EXISTS photo_id           UUID,
    ADD COLUMN IF NOT EXISTS stickers           BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS daily_goal_minutes SMALLINT,
    ADD COLUMN IF NOT EXISTS onboarded          BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS is_demo            BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ NOT NULL DEFAULT now();

-- Profile photos, stored in the database so they survive restarts and redeploys.
CREATE TABLE IF NOT EXISTS photos (
    id         UUID PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mime       TEXT NOT NULL,
    data       BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Friend requests and friendships: one row per pair of people.
-- status 'pending' = request sent, 'accepted' = friends. Declining deletes the row.
CREATE TABLE IF NOT EXISTS friendships (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    requester_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    addressee_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status       TEXT NOT NULL CHECK (status IN ('pending', 'accepted')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    accepted_at  TIMESTAMPTZ,
    CHECK (requester_id <> addressee_id)
);
-- Stops duplicates in either direction (A->B and B->A count as the same pair).
CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair
    ON friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));

-- Direct messages between friends.
CREATE TABLE IF NOT EXISTS messages (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sender_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body         TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    read_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS messages_pair
    ON messages (LEAST(sender_id, recipient_id), GREATEST(sender_id, recipient_id), id);

-- Groups, their members, and their discussion posts.
CREATE TABLE IF NOT EXISTS groups (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    tags        TEXT[] NOT NULL DEFAULT '{}',
    created_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
    is_demo     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_members (
    group_id  BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS group_posts (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    group_id   BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    author_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Events and who is going. Times are stored in UTC (TIMESTAMPTZ) and shown in each viewer's time zone.
CREATE TABLE IF NOT EXISTS events (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title        TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    starts_at    TIMESTAMPTZ NOT NULL,
    ends_at      TIMESTAMPTZ,
    location     TEXT NOT NULL DEFAULT '',
    online_url   TEXT NOT NULL DEFAULT '',
    organiser_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    group_id     BIGINT REFERENCES groups(id) ON DELETE SET NULL,
    is_demo      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (ends_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS events_starts_at ON events (starts_at);

CREATE TABLE IF NOT EXISTS event_rsvps (
    event_id   BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (event_id, user_id)
);

-- The notification bell.
CREATE TABLE IF NOT EXISTS notifications (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL,
    text       TEXT NOT NULL,
    link       TEXT NOT NULL DEFAULT '',
    actor_id   BIGINT REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    read_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS notifications_user ON notifications (user_id, id DESC);

-- Time spent in FriendFinder: one row per counted 30-second "heartbeat" from an open, active tab.
CREATE TABLE IF NOT EXISTS app_time (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    seconds SMALLINT NOT NULL CHECK (seconds BETWEEN 1 AND 60)
);
CREATE INDEX IF NOT EXISTS app_time_user_at ON app_time (user_id, at DESC);

-- Cached AI notes for a pair of people, so Gemini is not called on every page view.
-- facts_hash changes when what they share changes, which makes a fresh note.
CREATE TABLE IF NOT EXISTS match_insights (
    user_low   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_high  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    facts_hash TEXT NOT NULL,
    payload    JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_low, user_high)
);
