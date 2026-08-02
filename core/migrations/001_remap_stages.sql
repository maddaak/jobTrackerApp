-- One-time remap of the simplified job pipeline stages.
-- The Stage enum was reduced to: RESUME_CHECK, INTERVIEW_REQUEST, INTERVIEW_STAGE,
-- WAITING_INTERVIEW_RESULTS, OFFER_STAGE, FINALIZED. Existing rows store the old string
-- values, and Hibernate created CHECK constraints pinned to the old value list, so both the
-- data and the constraints must be rewritten or the app cannot read or write the new stages.
--
-- Run once against Postgres, e.g. from the repo root:
--   docker compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < core/migrations/001_remap_stages.sql

BEGIN;

-- The old CHECK constraints only allow the previous 11 values; drop them before rewriting.
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_current_stage_check;
ALTER TABLE stage_events DROP CONSTRAINT IF EXISTS stage_events_stage_check;

UPDATE jobs SET current_stage = 'INTERVIEW_REQUEST'
  WHERE current_stage IN ('RECRUITER_CHAT_INVITE', 'WAITING_RECRUITER_RESPONSE', 'INTERVIEW_SCHEDULING');
UPDATE jobs SET current_stage = 'INTERVIEW_STAGE'
  WHERE current_stage = 'RECRUITER_CHAT_SCHEDULED';
UPDATE jobs SET current_stage = 'OFFER_STAGE'
  WHERE current_stage IN ('OFFER_EXTENDED', 'WAITING_OFFER_DETAILS', 'NEGOTIATION');
UPDATE jobs SET current_stage = 'FINALIZED'
  WHERE current_stage = 'WAITING_FINAL_DETAILS';

UPDATE stage_events SET stage = 'INTERVIEW_REQUEST'
  WHERE stage IN ('RECRUITER_CHAT_INVITE', 'WAITING_RECRUITER_RESPONSE', 'INTERVIEW_SCHEDULING');
UPDATE stage_events SET stage = 'INTERVIEW_STAGE'
  WHERE stage = 'RECRUITER_CHAT_SCHEDULED';
UPDATE stage_events SET stage = 'OFFER_STAGE'
  WHERE stage IN ('OFFER_EXTENDED', 'WAITING_OFFER_DETAILS', 'NEGOTIATION');
UPDATE stage_events SET stage = 'FINALIZED'
  WHERE stage = 'WAITING_FINAL_DETAILS';

-- Re-add the constraints, now pinned to the new 6-value enum. Same names Hibernate uses, so
-- ddl-auto=update leaves them in place instead of trying to recreate them.
ALTER TABLE jobs ADD CONSTRAINT jobs_current_stage_check
  CHECK (current_stage IN ('RESUME_CHECK', 'INTERVIEW_REQUEST', 'INTERVIEW_STAGE',
                           'WAITING_INTERVIEW_RESULTS', 'OFFER_STAGE', 'FINALIZED'));
ALTER TABLE stage_events ADD CONSTRAINT stage_events_stage_check
  CHECK (stage IN ('RESUME_CHECK', 'INTERVIEW_REQUEST', 'INTERVIEW_STAGE',
                   'WAITING_INTERVIEW_RESULTS', 'OFFER_STAGE', 'FINALIZED'));

COMMIT;
