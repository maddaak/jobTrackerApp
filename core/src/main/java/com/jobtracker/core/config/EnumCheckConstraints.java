package com.jobtracker.core.config;

import com.jobtracker.core.model.InterviewPhase;
import com.jobtracker.core.model.Location;
import com.jobtracker.core.model.Outcome;
import com.jobtracker.core.model.SourceCategory;
import com.jobtracker.core.model.Stage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

// ddl-auto=update never widens the CHECK constraint Hibernate wrote from an enum, so a later constant is rejected.
@Component
public class EnumCheckConstraints {

    private static final Logger log = LoggerFactory.getLogger(EnumCheckConstraints.class);

    record EnumColumn(String table, String column, Class<? extends Enum<?>> type) {
        String constraintName() {
            return table + "_" + column + "_check";
        }
    }

    // Only enum columns Hibernate owns; Mongo enums carry no constraint.
    static final List<EnumColumn> COLUMNS = List.of(
            new EnumColumn("jobs", "outcome", Outcome.class),
            new EnumColumn("jobs", "current_stage", Stage.class),
            new EnumColumn("jobs", "interview_phase", InterviewPhase.class),
            new EnumColumn("jobs", "source_category", SourceCategory.class),
            new EnumColumn("jobs", "location", Location.class));

    private final DataSource dataSource;

    public EnumCheckConstraints(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    // Right after PreV4Locations' renames and before the other startup fixes. Like them it runs once the app is
    // already answering, so a write in the first seconds after an upgrade could still meet the old constraint.
    // A pre-v3 database lacks some columns until V3Migration adds them, so it runs sync again once it has.
    @Order(0)
    @EventListener(ApplicationReadyEvent.class)
    public void syncConstraints() {
        try (Connection connection = dataSource.getConnection()) {
            sync(connection);
        } catch (SQLException e) {
            // Not fatal: only a newly added constant is rejected, and refusing to boot is worse.
            log.error("could not rewrite enum check constraints; a newly added enum value will be "
                    + "rejected by the database", e);
        }
    }

    static void sync(Connection connection) throws SQLException {
        boolean autoCommit = connection.getAutoCommit();
        connection.setAutoCommit(false);
        try (Statement statement = connection.createStatement()) {
            for (EnumColumn column : COLUMNS) {
                // A missing column would throw and roll back every other column's constraint with it.
                if (!V3Migration.columnExists(connection.getMetaData(), column.table(), column.column())) {
                    continue;
                }
                // The transaction is what keeps the column from being briefly unconstrained.
                statement.execute("ALTER TABLE " + column.table()
                        + " DROP CONSTRAINT IF EXISTS " + column.constraintName());
                statement.execute("ALTER TABLE " + column.table()
                        + " ADD CONSTRAINT " + column.constraintName()
                        + " CHECK (" + column.column() + " IN (" + quotedValues(column.type()) + "))");
            }
            connection.commit();
        } catch (SQLException e) {
            connection.rollback();
            throw e;
        } finally {
            connection.setAutoCommit(autoCommit);
        }
    }

    // Enum names are compile-time constants, so inlining them is not injection.
    private static String quotedValues(Class<? extends Enum<?>> type) {
        return Arrays.stream(type.getEnumConstants())
                .map(constant -> "'" + constant.name() + "'")
                .collect(Collectors.joining(", "));
    }
}
