-- DESTRUCTIVE. Run only after the migration has completed, core has been rebuilt, the app has been
-- confirmed working against the migrated data, and the GET /metrics payload matches what it
-- returned before the move. Until then these columns and tables are the fallback.
--
-- Everything here has already been copied into Mongo by run_migration.sh, and the timestamped
-- pg_dump in core/migrations/backups/ is the second line of defence.
--
-- Run from the repo root:
--   docker compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
--     < core/migrations/008_drop_relational_leftovers.sql

BEGIN;

-- source_category must already be populated, or the grid loses its Application column.
DO $$
DECLARE missing bigint;
BEGIN
    SELECT count(*) INTO missing FROM jobs WHERE source_category IS NULL;
    IF missing > 0 THEN
        RAISE EXCEPTION 'aborting: run 007 first, % job(s) have no source_category', missing;
    END IF;
END $$;

ALTER TABLE jobs DROP COLUMN IF EXISTS source_id;
ALTER TABLE jobs DROP COLUMN IF EXISTS notes;
ALTER TABLE jobs DROP COLUMN IF EXISTS rejected_reason;

-- interviewers references stage_events, so it goes first.
DROP TABLE IF EXISTS interviewers;
DROP TABLE IF EXISTS stage_events;
DROP TABLE IF EXISTS sources;

COMMIT;
