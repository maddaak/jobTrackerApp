-- Widens jobs.url to text. Hibernate maps an unannotated String to varchar(255), which is what
-- made saving long job notes fail with a masked 409 ("the request conflicts with existing data").
--
-- notes, rejected_reason, meeting_link, location, and the interviewers table were the other
-- varchar(255) free-text columns; they move to Mongo instead of being widened, so url is the only
-- unbounded value left in Postgres. Job URLs with tracking parameters routinely pass 255.
--
-- The entity now declares columnDefinition = "text", but ddl-auto=update only adds columns and
-- never changes the type of an existing one, so this has to be applied by hand.
--
-- Run from the repo root:
--   docker compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
--     < core/migrations/003_widen_free_text_columns.sql

BEGIN;

ALTER TABLE jobs ALTER COLUMN url TYPE text;

COMMIT;
