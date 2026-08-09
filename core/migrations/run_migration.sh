#!/usr/bin/env bash
# Moves the modal's data from Postgres into Mongo. Backs up both stores first, copies, verifies,
# and stops before dropping anything: the Postgres columns and tables are still there afterwards,
# so a bad run is recoverable by restarting the old core image.
#
# Dropping is deliberately NOT part of this script. Run 008_drop_relational_leftovers.sql by hand
# only once the app has been rebuilt and confirmed working against the migrated data.
#
# The full order is: this script, then 007 (additive, and required before the new code can read
# jobs.source_category), then verify, then 008 (destructive), then 009 (index).
#
# Run from the repo root:  ./core/migrations/run_migration.sh

set -euo pipefail

BACKUP_DIR="core/migrations/backups/$(date +%Y%m%d-%H%M%S)"
EXPORT_FILE="/tmp/job_details_export.json"

mkdir -p "$BACKUP_DIR"

echo "==> Backing up both stores to $BACKUP_DIR"
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$BACKUP_DIR/postgres.sql"
docker compose exec -T mongo mongodump --quiet --db=jobtracker --archive > "$BACKUP_DIR/mongo.archive"
test -s "$BACKUP_DIR/postgres.sql" || { echo "postgres backup is empty, aborting"; exit 1; }
test -s "$BACKUP_DIR/mongo.archive" || { echo "mongo backup is empty, aborting"; exit 1; }
echo "    postgres.sql  $(wc -c < "$BACKUP_DIR/postgres.sql") bytes"
echo "    mongo.archive $(wc -c < "$BACKUP_DIR/mongo.archive") bytes"

echo "==> Recording source counts"
docker compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
  select (select count(*) from jobs) as jobs,
         (select count(*) from stage_events) as stage_events,
         (select count(*) from stage_events where interview_date_time is not null) as rounds,
         (select count(*) from interviewers) as interviewers;"' | tee "$BACKUP_DIR/source_counts.txt"

# Piping a script into mongosh runs it as a REPL: multi-line statements are mangled and it still
# exits 0, so a broken step reports success. --eval runs the whole thing as one script and a throw
# is a non-zero exit that set -e catches.
mongo_script() {
  docker compose exec -T mongo mongosh --quiet "mongodb://localhost:27017/jobtracker" "$@"
}

echo "==> Merging any duplicate jobId documents (no-op when there are none)"
mongo_script --eval "$(cat core/migrations/004_dedupe_job_details.js)"

echo "==> Exporting from Postgres (read-only)"
docker compose exec -T postgres sh -c 'psql -tA -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < core/migrations/005_export_details.sql > "$EXPORT_FILE"
test -s "$EXPORT_FILE" || { echo "export is empty, aborting"; exit 1; }
cp "$EXPORT_FILE" "$BACKUP_DIR/export.json"

echo "==> Loading into Mongo (additive)"
mongo_script --eval "var EXPORT = $(cat "$EXPORT_FILE")" \
             --eval "$(cat core/migrations/006_load_details_into_mongo.js)"

echo "==> Archiving documents whose job no longer exists"
# A document the load never touched belongs to a deleted job. Harmless where it sits, but it would
# keep a jobId alive that nothing can reach, so move it aside rather than delete it.
mongo_script --eval '
  const d = db.getSiblingDB("jobtracker");
  const orphans = d.job_details.find({ ownerId: { $exists: false } }).toArray();
  orphans.forEach(doc => {
    d.job_details_orphans.insertOne(Object.assign({}, doc, { archivedFrom: doc._id }));
    d.job_details.deleteOne({ _id: doc._id });
    print("  archived jobId " + doc.jobId + " (job no longer exists)");
  });
  print("orphans archived: " + orphans.length + ", retained in job_details_orphans: " + d.job_details_orphans.countDocuments());
'

echo "==> Verifying the documents actually landed"
# The load script checks itself, but assert from outside too so a silent no-op can't pass as success.
mongo_script --eval '
  const d = db.getSiblingDB("jobtracker");
  const total = d.job_details.countDocuments();
  const withHistory = d.job_details.countDocuments({ "stageHistory.0": { $exists: true } });
  const withOwner = d.job_details.countDocuments({ ownerId: { $exists: true } });
  const rounds = d.job_details.aggregate([{ $unwind: "$interviews" }, { $count: "n" }]).toArray();
  print("documents:      " + total);
  print("with history:   " + withHistory);
  print("with ownerId:   " + withOwner);
  print("rounds:         " + (rounds.length ? rounds[0].n : 0));
  if (withOwner !== total) { throw new Error("some documents still have no ownerId"); }
  if (withHistory === 0) { throw new Error("no stage history was written"); }
'

echo
echo "==> Done. Postgres is untouched; backups in $BACKUP_DIR"
echo "    Next, in order:"
echo "      1. 007_backfill_source_category.sql  (additive; the new code needs this column)"
echo "      2. rebuild core, confirm the app works, and diff GET /metrics against the"
echo "         pre-migration payload"
echo "      3. 008_drop_relational_leftovers.sql (DESTRUCTIVE; only after step 2 passes)"
echo "      4. 009_index_jobs_owner_id.sql       (index ddl-auto only adds on a fresh schema)"
