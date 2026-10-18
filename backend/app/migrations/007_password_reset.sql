-- Password reset codes, and logging out everywhere after a password change.
-- Never edit this file after it has been merged: add a new numbered file instead.

-- Reset codes use the same table as email/phone codes, with their own channel.
-- (Finds the old CHECK by what it checks, so it works whatever Postgres named it.)
DO $$
DECLARE
    old_name TEXT;
BEGIN
    FOR old_name IN
        SELECT con.conname FROM pg_constraint con
        WHERE con.conrelid = 'contact_verifications'::regclass AND con.contype = 'c'
          AND pg_get_constraintdef(con.oid) LIKE '%channel%'
    LOOP
        EXECUTE format('ALTER TABLE contact_verifications DROP CONSTRAINT %I', old_name);
    END LOOP;
END $$;
ALTER TABLE contact_verifications ADD CONSTRAINT contact_verifications_channel_check
    CHECK (channel IN ('email', 'phone', 'password_reset'));

-- When the password last changed. Login tokens made before this moment stop working,
-- so changing or resetting your password logs you out everywhere else.
ALTER TABLE users ADD COLUMN password_changed_at TIMESTAMPTZ;
