-- Memories: posts with a caption and up to 4 photos, shared with a chosen audience.
-- Separate from Discover (which is about finding people). See app/memories.py.
-- Never edit this file after it has been merged: add 005_..., 006_... instead.

CREATE TABLE memories (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    author_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    caption    TEXT NOT NULL DEFAULT '' CHECK (char_length(caption) <= 1000),
    -- Who can see it: friends (the default), everyone on Meerkat, or only the author.
    audience   TEXT NOT NULL DEFAULT 'friends' CHECK (audience IN ('friends', 'everyone', 'only_me')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Set when a moderator removes it. Removed memories are shown to nobody.
    removed_at TIMESTAMPTZ,
    removed_by BIGINT REFERENCES users(id) ON DELETE SET NULL
);
-- The feed reads the newest memories first, page by page.
CREATE INDEX memories_feed_idx ON memories (id DESC) WHERE removed_at IS NULL;
CREATE INDEX memories_author_idx ON memories (author_id, id DESC);

-- The photos themselves. They are only sent through short-lived signed links (app/memories.py).
CREATE TABLE memory_photos (
    id        UUID PRIMARY KEY,
    memory_id BIGINT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    data      BYTEA NOT NULL,
    mime      TEXT NOT NULL DEFAULT 'image/jpeg',
    position  SMALLINT NOT NULL DEFAULT 0
);
CREATE INDEX memory_photos_memory_idx ON memory_photos (memory_id, position);

-- One ❤️ per person per memory.
CREATE TABLE memory_reactions (
    memory_id  BIGINT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (memory_id, user_id)
);

CREATE TABLE memory_comments (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    memory_id  BIGINT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    author_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body       TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX memory_comments_memory_idx ON memory_comments (memory_id, id);
