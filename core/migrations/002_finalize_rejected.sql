-- Move every already-rejected job to the terminal Finalized stage (matches the new behavior
-- where picking Outcome = Rejected auto-advances the stage). Also records a Finalized stage
-- event for those jobs so the details view's stage history reflects the close.
--
-- Run once against Postgres, e.g. from the repo root:
--   docker compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < core/migrations/002_finalize_rejected.sql

BEGIN;

INSERT INTO stage_events (job_id, stage, entered_at)
  SELECT j.id, 'FINALIZED', now()
  FROM jobs j
  WHERE j.outcome = 'REJECTED'
    AND NOT EXISTS (
      SELECT 1 FROM stage_events se WHERE se.job_id = j.id AND se.stage = 'FINALIZED'
    );

UPDATE jobs SET current_stage = 'FINALIZED'
  WHERE outcome = 'REJECTED' AND current_stage <> 'FINALIZED';

COMMIT;
