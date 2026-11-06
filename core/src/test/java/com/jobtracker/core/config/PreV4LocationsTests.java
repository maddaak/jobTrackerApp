package com.jobtracker.core.config;

import com.jobtracker.core.model.Location;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class PreV4LocationsTests {

    // A pre-V4 table: the old names, and the CHECK Hibernate wrote from them.
    private Connection preV4Database(String name) throws SQLException {
        Connection connection = DriverManager.getConnection("jdbc:h2:mem:" + name, "sa", "");
        try (Statement statement = connection.createStatement()) {
            statement.execute("CREATE TABLE jobs (id BIGINT PRIMARY KEY, location VARCHAR(255), city VARCHAR(100))");
            statement.execute("ALTER TABLE jobs ADD CONSTRAINT jobs_location_check "
                    + "CHECK (location IN ('REMOTE', 'NYC_IN_PERSON', 'NYC_HYBRID'))");
        }
        return connection;
    }

    private Map<Long, String> rows(Connection connection) throws SQLException {
        Map<Long, String> rows = new LinkedHashMap<>();
        try (Statement statement = connection.createStatement();
                ResultSet result = statement.executeQuery("SELECT id, location, city FROM jobs ORDER BY id")) {
            while (result.next()) {
                rows.put(result.getLong(1), result.getString(2) + "/" + result.getString(3));
            }
        }
        return rows;
    }

    @Test
    void eachOldNameBecomesItsWorkModelInNewYork() throws SQLException {
        try (Connection connection = preV4Database("pre_v4_rename")) {
            long id = 1;
            for (String oldName : Location.PRE_V4_NAMES.keySet()) {
                try (Statement statement = connection.createStatement()) {
                    statement.execute("INSERT INTO jobs (id, location) VALUES (" + id++ + ", '" + oldName + "')");
                }
            }
            try (Statement statement = connection.createStatement()) {
                statement.execute("INSERT INTO jobs (id, location) VALUES (" + id + ", 'REMOTE')");
            }

            assertThat(PreV4Locations.convert(connection)).isEqualTo(Location.PRE_V4_NAMES.size());
            EnumCheckConstraints.sync(connection);

            Map<Long, String> expected = new LinkedHashMap<>();
            long expectedId = 1;
            for (Location renamed : Location.PRE_V4_NAMES.values()) {
                expected.put(expectedId++, renamed.name() + "/" + Location.PRE_V4_CITY);
            }
            expected.put(expectedId, "REMOTE/null");
            assertThat(rows(connection)).isEqualTo(expected);
        }
    }

    @Test
    void aCityAlreadyThereIsKept() throws SQLException {
        try (Connection connection = preV4Database("pre_v4_city_kept")) {
            try (Statement statement = connection.createStatement()) {
                statement.execute("INSERT INTO jobs (id, location, city) VALUES (1, 'NYC_HYBRID', 'Brooklyn')");
            }

            PreV4Locations.convert(connection);

            assertThat(rows(connection)).containsEntry(1L, "HYBRID/Brooklyn");
        }
    }

    @Test
    void nothingToConvertLeavesTheConstraintInPlace() throws SQLException {
        try (Connection connection = preV4Database("pre_v4_nothing")) {
            assertThat(PreV4Locations.convert(connection)).isZero();

            try (Statement statement = connection.createStatement();
                    ResultSet result = statement.executeQuery("SELECT count(*) FROM information_schema.table_constraints "
                            + "WHERE constraint_name = 'JOBS_LOCATION_CHECK'")) {
                result.next();
                assertThat(result.getInt(1)).isEqualTo(1);
            }
        }
    }
}
