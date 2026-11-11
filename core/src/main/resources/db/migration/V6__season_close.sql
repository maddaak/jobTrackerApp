-- A finished job hunt is closed: read-only, with how it ended. Null closed_at is a season still running.
ALTER TABLE seasons ADD COLUMN closed_at TIMESTAMP WITH TIME ZONE;
-- The offer taken, if the hunt ended in one. Deleting that job leaves the season closed without it.
ALTER TABLE seasons ADD COLUMN accepted_job_id BIGINT;
ALTER TABLE seasons ADD CONSTRAINT fk_seasons_accepted_job FOREIGN KEY (accepted_job_id) REFERENCES jobs (id) ON DELETE SET NULL;
ALTER TABLE seasons ADD COLUMN accepted_on DATE;
ALTER TABLE seasons ADD COLUMN starts_on DATE;
