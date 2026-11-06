package com.jobtracker.core.config;

import com.jobtracker.core.model.JobDetail;
import com.jobtracker.core.model.Stage;
import com.jobtracker.core.support.InMemoryMongo;
import com.mongodb.client.MongoClients;
import org.bson.Document;
import org.junit.jupiter.api.Test;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

// A real (in-memory) Mongo, not a mock: what's under test is how the driver treats the version field.
class DetailVersionsTests {

    private MongoTemplate freshMongo() {
        String database = "versions" + UUID.randomUUID().toString().replace("-", "");
        return new MongoTemplate(new SimpleMongoClientDatabaseFactory(
                MongoClients.create(InMemoryMongo.connectionString()), database));
    }

    private JobDetail load(MongoTemplate mongo, long jobId) {
        return mongo.findOne(new Query(Criteria.where("jobId").is(jobId)), JobDetail.class);
    }

    @Test
    void aDocumentWrittenBeforeVersioningCanBeSavedOnceBackfilled() {
        MongoTemplate mongo = freshMongo();
        mongo.getCollection("job_details").insertOne(new Document("jobId", 1L).append("ownerId", 7L));

        assertThat(new DetailVersions(mongo).backfill()).isEqualTo(1);

        JobDetail detail = load(mongo, 1L);
        detail.setNotes("first save after the upgrade");
        assertThatCode(() -> mongo.save(detail)).doesNotThrowAnyException();
    }

    @Test
    void aSaveFromAStaleCopyIsRefusedRatherThanUndoingTheOther() {
        MongoTemplate mongo = freshMongo();
        mongo.save(new JobDetail(1L, 7L, new byte[0], ""));
        JobDetail modal = load(mongo, 1L);
        JobDetail drag = load(mongo, 1L);

        drag.recordStage(Stage.INTERVIEW_STAGE, Instant.now(), null);
        mongo.save(drag);
        modal.setNotes("typed while the card was being dragged");

        assertThatThrownBy(() -> mongo.save(modal)).isInstanceOf(OptimisticLockingFailureException.class);
        assertThat(load(mongo, 1L).getStageHistory()).hasSize(1);
    }
}
