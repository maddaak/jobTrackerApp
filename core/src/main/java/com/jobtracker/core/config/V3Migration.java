package com.jobtracker.core.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

// v3 moved the details modal's data into Mongo and folded the sources table into a jobs column.
// An install on any earlier version has to be converted before the new code can read it, so the
// conversion runs here rather than asking the operator to run scripts by hand.
//
// Two things this deliberately does not do:
//   - It drops nothing. Every pre-v3 column and table survives, so Postgres stays the rollback and
//     a bad run is recoverable by starting the old image. 008_drop_relational_leftovers.sql is the
//     separate, manual, destructive step, to be run once the upgrade is confirmed good.
//   - It never runs on a first install. A new database is created in the v3 shape, and the marker
//     for "needs converting" is jobs rows that predate the source_category column, not a version.
@Component
public class V3Migration {

    private static final Logger log = LoggerFactory.getLogger(V3Migration.class);

    private final DataSource dataSource;
    private final MongoTemplate mongo;

    public V3Migration(DataSource dataSource, MongoTemplate mongo) {
        this.dataSource = dataSource;
        this.mongo = mongo;
    }

    // Fatal on failure: a half-converted database that serves requests is worse than one that
    // refuses to start while every original row is still in place.
    @EventListener(ApplicationReadyEvent.class)
    public void migrateIfNeeded() throws SQLException {
        try (Connection connection = dataSource.getConnection()) {
            if (!needsMigration(connection)) {
                return;
            }
            log.info("pre-v3 database detected; converting. Nothing is dropped, so the old image still runs.");
            int jobs = copyDetailsIntoMongo(connection);
            widenUrlColumn(connection);
            backfillSourceCategory(connection);
            indexOwnerId(connection);
            log.info("migration complete: {} job(s) converted. Postgres still holds every pre-v3 column and "
                    + "table; run core/migrations/008_drop_relational_leftovers.sql once you are satisfied.", jobs);
        }
    }

    boolean needsMigration(Connection connection) throws SQLException {
        DatabaseMetaData metaData = connection.getMetaData();
        // No jobs table is a first install mid-creation, not a stale one.
        if (!tableExists(metaData, "jobs") || columnExists(metaData, "jobs", "source_category")) {
            return false;
        }
        // The column is missing, so only existing rows make this a conversion rather than an empty
        // schema Hibernate is still filling in.
        return countRows(connection, "jobs") > 0;
    }

    // Mirrors 005_export_details.sql + 006_load_details_into_mongo.js: additive $set of the moved
    // fields only, so a document's existing jdText, interviewNotes and recommendedResume survive.
    private int copyDetailsIntoMongo(Connection connection) throws SQLException {
        Map<Long, List<Map<String, Object>>> historyByJob = readStageHistory(connection);
        Map<Long, List<Map<String, Object>>> roundsByJob = readRounds(connection);

        int converted = 0;
        try (PreparedStatement statement = connection.prepareStatement(
                "select id, owner_id, notes, rejected_reason from jobs order by id");
                ResultSet jobs = statement.executeQuery()) {
            while (jobs.next()) {
                long jobId = jobs.getLong("id");
                Update update = new Update()
                        .set("ownerId", jobs.getLong("owner_id"))
                        .set("notes", jobs.getString("notes"))
                        .set("rejectedReason", jobs.getString("rejected_reason"))
                        .set("stageHistory", historyByJob.getOrDefault(jobId, List.of()))
                        .set("interviews", roundsByJob.getOrDefault(jobId, List.of()));
                mongo.upsert(new Query(Criteria.where("jobId").is(jobId)), update, "job_details");
                converted++;
            }
        }
        return converted;
    }

    private Map<Long, List<Map<String, Object>>> readStageHistory(Connection connection) throws SQLException {
        Map<Long, List<Map<String, Object>>> byJob = new LinkedHashMap<>();
        try (PreparedStatement statement = connection.prepareStatement(
                "select job_id, stage, entered_at, note from stage_events order by entered_at, id");
                ResultSet events = statement.executeQuery()) {
            while (events.next()) {
                Map<String, Object> entry = new LinkedHashMap<>();
                entry.put("stage", events.getString("stage"));
                entry.put("enteredAt", toInstant(events.getTimestamp("entered_at")));
                entry.put("note", events.getString("note"));
                byJob.computeIfAbsent(events.getLong("job_id"), key -> new ArrayList<>()).add(entry);
            }
        }
        return byJob;
    }

    // Embedded rounds have no database identity, so mint the addressable id the v3 API exposes.
    private Map<Long, List<Map<String, Object>>> readRounds(Connection connection) throws SQLException {
        Map<Long, List<Map<String, Object>>> interviewersByEvent = readInterviewers(connection);
        Map<Long, List<Map<String, Object>>> byJob = new LinkedHashMap<>();
        try (PreparedStatement statement = connection.prepareStatement(
                "select id, job_id, interview_date_time, interview_type, meeting_link, location "
                        + "from stage_events where interview_date_time is not null "
                        + "order by interview_date_time, id");
                ResultSet rounds = statement.executeQuery()) {
            while (rounds.next()) {
                long eventId = rounds.getLong("id");
                Map<String, Object> round = new LinkedHashMap<>();
                round.put("roundId", UUID.randomUUID().toString());
                round.put("interviewDateTime", toInstant(rounds.getTimestamp("interview_date_time")));
                round.put("interviewType", rounds.getString("interview_type"));
                round.put("meetingLink", rounds.getString("meeting_link"));
                round.put("location", rounds.getString("location"));
                round.put("interviewers", interviewersByEvent.getOrDefault(eventId, List.of()));
                byJob.computeIfAbsent(rounds.getLong("job_id"), key -> new ArrayList<>()).add(round);
            }
        }
        return byJob;
    }

    private Map<Long, List<Map<String, Object>>> readInterviewers(Connection connection) throws SQLException {
        Map<Long, List<Map<String, Object>>> byEvent = new LinkedHashMap<>();
        try (PreparedStatement statement = connection.prepareStatement(
                "select stage_event_id, name, linked_in_url from interviewers order by id");
                ResultSet people = statement.executeQuery()) {
            while (people.next()) {
                Map<String, Object> person = new LinkedHashMap<>();
                person.put("name", people.getString("name"));
                person.put("linkedInUrl", people.getString("linked_in_url"));
                byEvent.computeIfAbsent(people.getLong("stage_event_id"), key -> new ArrayList<>()).add(person);
            }
        }
        return byEvent;
    }

    // 003: a real posting URL outgrows Hibernate's default varchar(255). Postgres-only syntax, and
    // Postgres is the only database this runs against outside tests.
    private void widenUrlColumn(Connection connection) throws SQLException {
        if (!"PostgreSQL".equals(connection.getMetaData().getDatabaseProductName())) {
            return;
        }
        execute(connection, "alter table jobs alter column url type text");
    }

    // 007: add nullable, backfill from sources, and only then constrain, because the column cannot
    // be added NOT NULL to a table that already has rows.
    private void backfillSourceCategory(Connection connection) throws SQLException {
        execute(connection, "alter table jobs add column if not exists source_category varchar(255)");
        execute(connection, "update jobs set source_category = "
                + "(select s.category from sources s where s.id = jobs.source_id) "
                + "where source_category is null");
        long missing = countRows(connection, "jobs", "source_category is null");
        if (missing > 0) {
            // Constraining now would fail anyway; say why rather than surfacing a driver error.
            throw new IllegalStateException("aborting migration: " + missing
                    + " job(s) have no source_category, so the grid's Application column would be empty. "
                    + "Nothing has been dropped; the pre-v3 tables are intact.");
        }
        execute(connection, "alter table jobs alter column source_category set not null");
    }

    // 009: every read path is owner-scoped, and ddl-auto only adds this index on a fresh schema.
    private void indexOwnerId(Connection connection) throws SQLException {
        execute(connection, "create index if not exists idx_jobs_owner_id on jobs (owner_id)");
    }

    private Instant toInstant(Timestamp timestamp) {
        return timestamp == null ? null : timestamp.toInstant();
    }

    private void execute(Connection connection, String sql) throws SQLException {
        try (Statement statement = connection.createStatement()) {
            statement.execute(sql);
        }
    }

    private long countRows(Connection connection, String table) throws SQLException {
        return countRows(connection, table, null);
    }

    private long countRows(Connection connection, String table, String where) throws SQLException {
        String sql = "select count(*) from " + table + (where == null ? "" : " where " + where);
        try (Statement statement = connection.createStatement(); ResultSet rows = statement.executeQuery(sql)) {
            return rows.next() ? rows.getLong(1) : 0;
        }
    }

    // Identifiers case-fold differently per database (Postgres lowercases, H2 uppercases), so match
    // on both spellings rather than assuming one.
    private boolean tableExists(DatabaseMetaData metaData, String table) throws SQLException {
        for (String name : new String[] {table, table.toUpperCase()}) {
            try (ResultSet tables = metaData.getTables(null, null, name, null)) {
                if (tables.next()) {
                    return true;
                }
            }
        }
        return false;
    }

    private boolean columnExists(DatabaseMetaData metaData, String table, String column) throws SQLException {
        for (String name : new String[] {table, table.toUpperCase()}) {
            try (ResultSet columns = metaData.getColumns(null, null, name, null)) {
                while (columns.next()) {
                    if (column.equalsIgnoreCase(columns.getString("COLUMN_NAME"))) {
                        return true;
                    }
                }
            }
        }
        return false;
    }
}
