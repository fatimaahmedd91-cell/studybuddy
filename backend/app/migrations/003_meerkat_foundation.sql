-- Meerkat foundation: terms acceptance, roles, contact verification, privacy settings,
-- optional-feature choices, blocking, reports and moderation records.
-- Never edit this file after it has been merged: add 004_..., 005_... instead.

-- Terms: which version someone accepted, and when. Accounts made before this stay NULL,
-- so they are asked to accept on their next visit (nobody "accepted" retroactively).
ALTER TABLE users
    ADD COLUMN terms_version      TEXT,
    ADD COLUMN terms_accepted_at  TIMESTAMPTZ,
    ADD COLUMN adult_confirmed_at TIMESTAMPTZ,

    -- member, moderator or admin. Change it only with: python -m app.roles
    ADD COLUMN role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'moderator', 'admin')),
    ADD COLUMN suspended_at     TIMESTAMPTZ,
    ADD COLUMN suspended_reason TEXT NOT NULL DEFAULT '',

    -- Contact details are private. "Verified" is set only by a real code check (app/verification.py).
    ADD COLUMN email_verified_at TIMESTAMPTZ,
    ADD COLUMN phone             TEXT,
    ADD COLUMN phone_verified_at TIMESTAMPTZ,

    -- Age check through an outside provider. Only the result is kept, never images.
    ADD COLUMN age_check_status    TEXT,
    ADD COLUMN age_check_provider  TEXT,
    ADD COLUMN age_check_reference TEXT,
    ADD COLUMN age_check_at        TIMESTAMPTZ,

    -- Privacy and preferences
    ADD COLUMN timezone TEXT NOT NULL DEFAULT 'America/Toronto',
    ADD COLUMN discoverable BOOLEAN NOT NULL DEFAULT TRUE,
    -- Who can use your PUBLIC "free to hang out" times: everyone on Meerkat, friends, or nobody.
    ADD COLUMN availability_audience TEXT NOT NULL DEFAULT 'everyone'
        CHECK (availability_audience IN ('everyone', 'friends', 'nobody')),
    ADD COLUMN notification_prefs JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Optional features, each chosen separately: {"ai_features": {"granted": true, "at": "..."}}
    ADD COLUMN consents JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Fictional demo people may use AI features (their data is made up).
UPDATE users SET consents = '{"ai_features": {"granted": true, "at": "seed"}}'::jsonb WHERE is_demo;

-- Blocking: blocker no longer sees or hears from blocked, and vice versa (see app/safety.py).
CREATE TABLE blocks (
    blocker_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker_id, blocked_id),
    CHECK (blocker_id <> blocked_id)
);
CREATE INDEX blocks_blocked_idx ON blocks (blocked_id);

-- Reports about profiles, messages, memories, groups, events or group posts.
CREATE TABLE reports (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    reporter_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    target_type TEXT NOT NULL CHECK (target_type IN ('profile', 'message', 'memory', 'group', 'event', 'group_post')),
    target_id   BIGINT NOT NULL,
    -- The person the report is about (if any), so moderators can act on the account.
    target_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    reason      TEXT NOT NULL,
    details     TEXT NOT NULL DEFAULT '',
    -- A copy of what was reported at the time, so moderators see it even if it is edited later.
    snapshot    TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'actioned')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    handled_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
    handled_at  TIMESTAMPTZ
);
-- One open report per person per item: stops duplicate and spam reports.
CREATE UNIQUE INDEX reports_one_open_per_reporter
    ON reports (reporter_id, target_type, target_id) WHERE status = 'open';
CREATE INDEX reports_status_idx ON reports (status, created_at);

-- Every moderator action is recorded and never edited.
CREATE TABLE moderation_actions (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    moderator_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    action       TEXT NOT NULL,
    report_id    BIGINT REFERENCES reports(id) ON DELETE SET NULL,
    target_type  TEXT NOT NULL DEFAULT '',
    target_id    BIGINT,
    note         TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Requests to see, correct or delete personal information (Settings → Terms and privacy).
CREATE TABLE privacy_requests (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    BIGINT REFERENCES users(id) ON DELETE SET NULL,
    kind       TEXT NOT NULL CHECK (kind IN ('access', 'correction', 'deletion', 'withdraw_consent', 'other')),
    details    TEXT NOT NULL DEFAULT '',
    contact_email TEXT NOT NULL DEFAULT '',
    status     TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    handled_at TIMESTAMPTZ
);

-- One-time codes for email checks. Only a hash of the code is stored.
-- (Phone codes are created and checked by the SMS provider, so only the send time is kept.)
CREATE TABLE contact_verifications (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel    TEXT NOT NULL CHECK (channel IN ('email', 'phone')),
    target     TEXT NOT NULL,
    code_hash  TEXT NOT NULL DEFAULT '',
    attempts   INT NOT NULL DEFAULT 0,
    sent_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ
);
CREATE INDEX contact_verifications_user_idx ON contact_verifications (user_id, channel, sent_at);
