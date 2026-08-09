-- Exports everything moving to Mongo as one JSON array, one object per job. Read-only: this
-- script never writes to or drops anything in Postgres.
--
-- stageHistory carries ALL stage_events, including the 43 that also carry interview data, because
-- scheduling a round genuinely was a pipeline transition. Keeping every event means the modal's
-- stage history and the metrics funnel see exactly what they saw before the move, which is what
-- makes the before/after /metrics payload diff a valid equivalence check.
--
-- Timestamps are emitted as ISO-8601 strings and converted to BSON dates by the loader.
--
-- Run from the repo root:
--   docker compose exec -T postgres sh -c \
--     'psql -tA -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
--     < core/migrations/005_export_details.sql > /tmp/job_details_export.json

SELECT COALESCE(json_agg(row_to_json(job)), '[]'::json)
FROM (
    SELECT
        j.id                AS "jobId",
        j.owner_id          AS "ownerId",
        j.notes             AS "notes",
        j.rejected_reason   AS "rejectedReason",
        COALESCE((
            SELECT json_agg(json_build_object(
                       'stage', se.stage,
                       'enteredAt', to_char(se.entered_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                       'note', se.note)
                   ORDER BY se.entered_at, se.id)
            FROM stage_events se
            WHERE se.job_id = j.id
        ), '[]'::json) AS "stageHistory",
        COALESCE((
            SELECT json_agg(json_build_object(
                       'interviewDateTime', to_char(se.interview_date_time AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                       'interviewType', se.interview_type,
                       'meetingLink', se.meeting_link,
                       'location', se.location,
                       'interviewers', COALESCE((
                           SELECT json_agg(json_build_object('name', i.name, 'linkedInUrl', i.linked_in_url) ORDER BY i.id)
                           FROM interviewers i
                           WHERE i.stage_event_id = se.id
                       ), '[]'::json))
                   ORDER BY se.interview_date_time, se.id)
            FROM stage_events se
            WHERE se.job_id = j.id AND se.interview_date_time IS NOT NULL
        ), '[]'::json) AS "interviews"
    FROM jobs j
    ORDER BY j.id
) job;
