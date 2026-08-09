-- Every read path is owner-scoped (findByOwnerId... for the grid, metrics, and interviews), but
-- owner_id had no index, so all of them sequential-scanned the jobs table. The FK to users was
-- unindexed too, which also makes a user delete scan.
--
-- The entity now declares this index, but ddl-auto only adds it on a fresh schema.
--
-- Run from the repo root:
--   docker compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
--     < core/migrations/009_index_jobs_owner_id.sql

CREATE INDEX IF NOT EXISTS idx_jobs_owner_id ON jobs (owner_id);
