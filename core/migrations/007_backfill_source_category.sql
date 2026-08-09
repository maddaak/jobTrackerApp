-- Additive: folds the sources table into a jobs column. Nothing is dropped here, so the app can
-- run on the new code with the old tables still present and be verified before anything is removed.
--
-- ddl-auto=update tries to add this column as NOT NULL and fails on existing rows, so it has to be
-- added nullable, backfilled, and only then constrained.
--
-- Run from the repo root:
--   docker compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
--     < core/migrations/007_backfill_source_category.sql

BEGIN;

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS source_category varchar(255);

UPDATE jobs j SET source_category = s.category
FROM sources s
WHERE j.source_id = s.id AND j.source_category IS NULL;

-- Refuse to constrain the column if any job would be left without the value the grid filters on.
DO $$
DECLARE missing bigint;
BEGIN
    SELECT count(*) INTO missing FROM jobs WHERE source_category IS NULL;
    IF missing > 0 THEN
        RAISE EXCEPTION 'aborting: % job(s) have no source_category', missing;
    END IF;
END $$;

ALTER TABLE jobs ALTER COLUMN source_category SET NOT NULL;

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_source_category_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_source_category_check CHECK (source_category IN (
    'SELF_APPLIED', 'REFERRAL_APPLIED', 'LINKEDIN_OUTREACH', 'EMAIL_OUTREACH'));

COMMIT;
