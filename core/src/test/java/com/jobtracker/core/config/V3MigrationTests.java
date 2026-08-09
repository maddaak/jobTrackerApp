package com.jobtracker.core.config;

import com.jobtracker.core.support.InMemoryMongo;
import com.mongodb.client.MongoClients;
import org.bson.Document;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.Test;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

// This converts real user data on an upgrade, so it is tested against actual databases rather than
// mocks: H2 for the relational side, an in-memory Mongo for the documents. The two cases that
// matter most are opposites — convert a pre-v3 database faithfully, and leave a first install alone.
class V3MigrationTests {

    private DataSource freshDatabase() {
        JdbcDataSource dataSource = new JdbcDataSource();
        dataSource.setURL("jdbc:h2:mem:v3-" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1");
        dataSource.setUser("sa");
        return dataSource;
    }

    private MongoTemplate freshMongo() {
        String database = "v3test" + UUID.randomUUID().toString().replace("-", "");
        return new MongoTemplate(new SimpleMongoClientDatabaseFactory(
                MongoClients.create(InMemoryMongo.connectionString()), database));
    }

    private void execute(DataSource dataSource, String... statements) throws SQLException {
        try (Connection connection = dataSource.getConnection(); Statement statement = connection.createStatement()) {
            for (String sql : statements) {
                statement.execute(sql);
            }
        }
    }

    private void createPreV3Schema(DataSource dataSource) throws SQLException {
        execute(dataSource,
                "create table sources (id bigint primary key, category varchar(255))",
                "create table jobs (id bigint primary key, owner_id bigint, company varchar(255), "
                        + "url varchar(255), notes varchar(255), rejected_reason varchar(255), source_id bigint)",
                "create table stage_events (id bigint primary key, job_id bigint, stage varchar(255), "
                        + "entered_at timestamp, note varchar(255), interview_date_time timestamp, "
                        + "interview_type varchar(255), meeting_link varchar(255), location varchar(255))",
                "create table interviewers (id bigint primary key, stage_event_id bigint, "
                        + "name varchar(255), linked_in_url varchar(255))");
    }

    @Test
    void convertsAPreV3DatabaseIntoDocumentsAndABackfilledColumn() throws SQLException {
        DataSource dataSource = freshDatabase();
        MongoTemplate mongo = freshMongo();
        createPreV3Schema(dataSource);
        execute(dataSource,
                "insert into sources (id, category) values (7, 'REFERRAL_APPLIED')",
                "insert into jobs (id, owner_id, company, notes, rejected_reason, source_id) "
                        + "values (1, 42, 'Acme', 'my notes', 'not enough Go', 7)",
                "insert into stage_events (id, job_id, stage, entered_at, note) "
                        + "values (10, 1, 'RESUME_CHECK', timestamp '2026-01-01 00:00:00', null)",
                "insert into stage_events (id, job_id, stage, entered_at, interview_date_time, "
                        + "interview_type, meeting_link, location) values "
                        + "(11, 1, 'INTERVIEW_STAGE', timestamp '2026-01-02 00:00:00', "
                        + "timestamp '2026-01-03 09:00:00', 'SYSTEM_DESIGN', 'https://meet', 'NYC')",
                "insert into interviewers (id, stage_event_id, name, linked_in_url) "
                        + "values (100, 11, 'Dana', 'https://linkedin.com/in/dana')");

        new V3Migration(dataSource, mongo).migrateIfNeeded();

        Document detail = mongo.getCollection("job_details").find(new Document("jobId", 1L)).first();
        assertThat(detail).isNotNull();
        assertThat(detail.getLong("ownerId")).isEqualTo(42L);
        assertThat(detail.getString("notes")).isEqualTo("my notes");
        assertThat(detail.getString("rejectedReason")).isEqualTo("not enough Go");

        List<?> history = detail.getList("stageHistory", Document.class);
        assertThat(history).hasSize(2);
        assertThat(((Document) history.get(0)).getString("stage")).isEqualTo("RESUME_CHECK");

        List<?> rounds = detail.getList("interviews", Document.class);
        assertThat(rounds).hasSize(1);
        Document round = (Document) rounds.get(0);
        assertThat(round.getString("roundId")).isNotBlank();
        assertThat(round.getString("interviewType")).isEqualTo("SYSTEM_DESIGN");
        assertThat(round.getString("meetingLink")).isEqualTo("https://meet");
        assertThat(round.getList("interviewers", Document.class))
                .extracting(person -> person.getString("name"))
                .containsExactly("Dana");

        // The relational side is backfilled, and nothing is dropped: the old tables are the rollback.
        try (Connection connection = dataSource.getConnection(); Statement statement = connection.createStatement()) {
            var rows = statement.executeQuery("select source_category from jobs where id = 1");
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString(1)).isEqualTo("REFERRAL_APPLIED");
            assertThat(statement.executeQuery("select count(*) from stage_events")).satisfies(counted -> {
                try {
                    counted.next();
                    assertThat(counted.getLong(1)).isEqualTo(2);
                } catch (SQLException e) {
                    throw new AssertionError(e);
                }
            });
        }
    }

    @Test
    void doesNothingOnAFirstInstallWhereTheColumnAlreadyExists() throws SQLException {
        DataSource dataSource = freshDatabase();
        MongoTemplate mongo = freshMongo();
        execute(dataSource,
                "create table jobs (id bigint primary key, company varchar(255), source_category varchar(255))",
                "insert into jobs (id, company, source_category) values (1, 'Acme', 'SELF_APPLIED')");

        new V3Migration(dataSource, mongo).migrateIfNeeded();

        assertThat(mongo.getCollection("job_details").countDocuments()).isZero();
    }

    @Test
    void doesNothingWhenThereIsNoJobsTableYet() {
        assertThatCode(() -> new V3Migration(freshDatabase(), freshMongo()).migrateIfNeeded())
                .doesNotThrowAnyException();
    }

    @Test
    void doesNothingOnAnEmptyJobsTableSinceThereIsNothingToConvert() throws SQLException {
        DataSource dataSource = freshDatabase();
        MongoTemplate mongo = freshMongo();
        execute(dataSource, "create table jobs (id bigint primary key, company varchar(255))");

        new V3Migration(dataSource, mongo).migrateIfNeeded();

        assertThat(mongo.getCollection("job_details").countDocuments()).isZero();
    }

    @Test
    void refusesRatherThanLeavingAJobWithoutTheColumnTheGridFiltersOn() throws SQLException {
        DataSource dataSource = freshDatabase();
        createPreV3Schema(dataSource);
        // A job whose source row is missing cannot be backfilled.
        execute(dataSource, "insert into jobs (id, owner_id, company, source_id) values (1, 42, 'Acme', 999)");

        assertThatThrownBy(() -> new V3Migration(dataSource, freshMongo()).migrateIfNeeded())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("no source_category")
                .hasMessageContaining("Nothing has been dropped");
    }

    @Test
    void isIdempotentSoARestartDoesNotConvertTwice() throws SQLException {
        DataSource dataSource = freshDatabase();
        MongoTemplate mongo = freshMongo();
        createPreV3Schema(dataSource);
        execute(dataSource,
                "insert into sources (id, category) values (7, 'SELF_APPLIED')",
                "insert into jobs (id, owner_id, company, source_id) values (1, 42, 'Acme', 7)",
                "insert into stage_events (id, job_id, stage, entered_at) "
                        + "values (10, 1, 'RESUME_CHECK', timestamp '2026-01-01 00:00:00')");

        V3Migration migration = new V3Migration(dataSource, mongo);
        migration.migrateIfNeeded();
        migration.migrateIfNeeded();

        assertThat(mongo.getCollection("job_details").countDocuments()).isEqualTo(1);
        Document detail = mongo.getCollection("job_details").find(new Document("jobId", 1L)).first();
        assertThat(detail).isNotNull();
        assertThat(detail.getList("stageHistory", Document.class)).hasSize(1);
    }
}
