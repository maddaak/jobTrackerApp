package com.jobtracker.core.config;

import com.jobtracker.core.model.JobDetail;
import com.jobtracker.core.model.JobImage;
import com.jobtracker.core.model.Resume;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.index.Index;
import org.springframework.stereotype.Component;

// Spring Data defaults autoIndexCreation to false, so @Indexed alone builds nothing. Off in tests.
@Component
@ConditionalOnProperty(name = "app.ensure-mongo-indexes", matchIfMissing = true)
public class MongoIndexes {

    private static final Logger log = LoggerFactory.getLogger(MongoIndexes.class);

    private final MongoTemplate mongo;

    public MongoIndexes(MongoTemplate mongo) {
        this.mongo = mongo;
    }

    // Caught so Mongo isn't a hard boot dependency; /health reports it, since the unique jobId index is load-bearing.
    private volatile boolean ready;

    @EventListener(ApplicationReadyEvent.class)
    public void ensureIndexes() {
        try {
            createIndexes();
            ready = true;
        } catch (RuntimeException e) {
            log.error("could not create Mongo indexes; the unique jobId constraint is missing", e);
        }
    }

    public boolean isReady() {
        return ready;
    }

    private void createIndexes() {
        mongo.indexOps(JobDetail.class).createIndex(new Index().on("jobId", Sort.Direction.ASC).unique());
        mongo.indexOps(JobDetail.class).createIndex(new Index().on("ownerId", Sort.Direction.ASC));
        // Round lookups for update/delete go through this rather than scanning the owner's documents.
        mongo.indexOps(JobDetail.class).createIndex(new Index().on("interviews.roundId", Sort.Direction.ASC));
        mongo.indexOps(Resume.class).createIndex(new Index().on("ownerId", Sort.Direction.ASC));
        // Listing a job's attachments and the delete cascade both go through jobId.
        mongo.indexOps(JobImage.class).createIndex(new Index().on("jobId", Sort.Direction.ASC));
        mongo.indexOps(JobImage.class).createIndex(new Index().on("ownerId", Sort.Direction.ASC));
    }
}
