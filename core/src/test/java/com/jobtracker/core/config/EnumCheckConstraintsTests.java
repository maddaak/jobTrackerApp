package com.jobtracker.core.config;

import com.jobtracker.core.model.Outcome;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Arrays;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

// The suite's schema is always fresh from the current enums, so these build the stale shape explicitly.
class EnumCheckConstraintsTests {

    private Connection freshDatabase(String name) throws SQLException {
        Connection connection = DriverManager.getConnection("jdbc:h2:mem:" + name, "sa", "");
        try (Statement statement = connection.createStatement()) {
            statement.execute("""
                    CREATE TABLE jobs (
                        id BIGINT PRIMARY KEY,
                        outcome VARCHAR(255),
                        current_stage VARCHAR(255),
                        source_category VARCHAR(255))
                    """);
        }
        return connection;
    }

    // What Hibernate left behind: every outcome that existed when the column was created.
    private void addStaleOutcomeConstraint(Connection connection) throws SQLException {
        String stale = Arrays.stream(Outcome.values())
                .filter(outcome -> outcome != Outcome.POSITION_CLOSED)
                .map(outcome -> "'" + outcome.name() + "'")
                .reduce((a, b) -> a + ", " + b)
                .orElseThrow();
        try (Statement statement = connection.createStatement()) {
            statement.execute("ALTER TABLE jobs ADD CONSTRAINT jobs_outcome_check CHECK (outcome IN (" + stale + "))");
        }
    }

    private void insertOutcome(Connection connection, long id, Outcome outcome) throws SQLException {
        try (Statement statement = connection.createStatement()) {
            statement.execute("INSERT INTO jobs (id, outcome) VALUES (" + id + ", '" + outcome.name() + "')");
        }
    }

    @Test
    void aConstraintWrittenBeforeAnEnumConstantExistedRejectsItUntilSynced() throws SQLException {
        try (Connection connection = freshDatabase("stale_outcome")) {
            addStaleOutcomeConstraint(connection);

            assertThatThrownBy(() -> insertOutcome(connection, 1L, Outcome.POSITION_CLOSED))
                    .isInstanceOf(SQLException.class);

            EnumCheckConstraints.sync(connection);

            insertOutcome(connection, 2L, Outcome.POSITION_CLOSED);
        }
    }

    @Test
    void everyEnumValueIsAcceptedAfterSyncing() throws SQLException {
        try (Connection connection = freshDatabase("all_outcomes")) {
            addStaleOutcomeConstraint(connection);
            EnumCheckConstraints.sync(connection);

            long id = 0;
            for (Outcome outcome : Outcome.values()) {
                insertOutcome(connection, ++id, outcome);
            }

            assertThat(id).isEqualTo(Outcome.values().length);
        }
    }

    @Test
    void syncingStillRejectsAValueNoEnumDefines() throws SQLException {
        try (Connection connection = freshDatabase("bogus_outcome")) {
            EnumCheckConstraints.sync(connection);

            try (Statement statement = connection.createStatement()) {
                assertThatThrownBy(() -> statement.execute("INSERT INTO jobs (id, outcome) VALUES (1, 'NONSENSE')"))
                        .as("widening the constraint must not turn the column into free text")
                        .isInstanceOf(SQLException.class);
            }
        }
    }

    @Test
    void syncingIsIdempotentSoItCanRunOnEveryBoot() throws SQLException {
        try (Connection connection = freshDatabase("idempotent")) {
            EnumCheckConstraints.sync(connection);
            EnumCheckConstraints.sync(connection);

            insertOutcome(connection, 1L, Outcome.POSITION_CLOSED);
        }
    }
}
