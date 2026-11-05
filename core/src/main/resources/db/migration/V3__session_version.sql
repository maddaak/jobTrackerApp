-- Bumped to end every signed-in session at once: a password change, a reset, or "sign out other devices".
-- Sessions signed before this column existed carry no version, which reads as 0, so they stay signed in.
ALTER TABLE users ADD COLUMN session_version INT DEFAULT 0 NOT NULL;
