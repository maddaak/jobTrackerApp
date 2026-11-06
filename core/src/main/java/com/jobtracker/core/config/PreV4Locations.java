package com.jobtracker.core.config;

import com.jobtracker.core.model.JobDetail;
import com.jobtracker.core.model.Location;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.annotation.Order;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Map;

// Renames the pre-V4 New York locations to a work model plus the city, so no job loses where it was.
// Off in tests, since most test contexts point at a Mongo that never connects.
@Component
@ConditionalOnProperty(name = "app.convert-pre-v4-locations", matchIfMissing = true)
public class PreV4Locations {

    private static final Logger log = LoggerFactory.getLogger(PreV4Locations.class);
    private static final String CHECKED_LOCATION = "offer.marketCheck.basis.location";

    private final DataSource dataSource;
    private final MongoTemplate mongo;

    public PreV4Locations(DataSource dataSource, MongoTemplate mongo) {
        this.dataSource = dataSource;
        this.mongo = mongo;
    }

    // Before EnumCheckConstraints, which writes a CHECK the old names would fail. Fatal, because a row or
    // document left with an old name can't be read.
    @Order(-1)
    @EventListener(ApplicationReadyEvent.class)
    public void convert() throws SQLException {
        try (Connection connection = dataSource.getConnection()) {
            int converted = convert(connection);
            if (converted > 0) {
                log.info("converted {} job(s) from a New York location to a work model and city", converted);
            }
        }
        // A saved market check records the location it priced, so it isn't marked out of date by the rename.
        for (Map.Entry<String, Location> rename : Location.PRE_V4_NAMES.entrySet()) {
            mongo.updateMulti(Query.query(Criteria.where(CHECKED_LOCATION).is(rename.getKey())),
                    new Update().set(CHECKED_LOCATION, rename.getValue().name())
                            .set("offer.marketCheck.basis.city", Location.PRE_V4_CITY),
                    JobDetail.class);
        }
    }

    static int convert(Connection connection) throws SQLException {
        if (!V3Migration.columnExists(connection.getMetaData(), "jobs", "location")) {
            return 0;
        }
        try (Statement statement = connection.createStatement();
                ResultSet count = statement.executeQuery(
                        // Cast, since a column typed by the current enum can't be compared to an old name.
                        "SELECT count(*) FROM jobs WHERE CAST(location AS VARCHAR(255)) IN ('NYC_IN_PERSON', 'NYC_HYBRID')")) {
            if (count.next() && count.getInt(1) == 0) {
                return 0;
            }
        }
        boolean autoCommit = connection.getAutoCommit();
        connection.setAutoCommit(false);
        int converted = 0;
        try (Statement statement = connection.createStatement()) {
            // The old CHECK allows only the old names; EnumCheckConstraints writes the new one straight after.
            statement.execute("ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_location_check");
            try (PreparedStatement update = connection.prepareStatement(
                    "UPDATE jobs SET location = ?, city = coalesce(city, ?) WHERE location = ?")) {
                for (Map.Entry<String, Location> rename : Location.PRE_V4_NAMES.entrySet()) {
                    update.setString(1, rename.getValue().name());
                    update.setString(2, Location.PRE_V4_CITY);
                    update.setString(3, rename.getKey());
                    converted += update.executeUpdate();
                }
            }
            connection.commit();
            return converted;
        } catch (SQLException e) {
            connection.rollback();
            throw e;
        } finally {
            connection.setAutoCommit(autoCommit);
        }
    }
}
