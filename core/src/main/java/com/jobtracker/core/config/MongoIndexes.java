package com.jobtracker.core.config;

import com.jobtracker.core.model.JobDetail;
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

// Spring Data defaults autoIndexCreation to false, so @Indexed alone builds nothing.
// Off in tests, where the Mongo driver connects lazily and is never reached.
@Component
@ConditionalOnProperty(name = "app.ensure-mongo-indexes", matchIfMissing = true)
public class MongoIndexes {

    private static final Logger log = LoggerFactory.getLogger(MongoIndexes.class);

    private final MongoTemplate mongo;

    public MongoIndexes(MongoTemplate mongo) {
        this.mongo = mongo;
    }

    // Failing here would make Mongo a hard boot dependency, so it is caught. But the app then runs
    // without the unique jobId index, which is what stops two documents describing one job, so the
    // failure is reported on /health rather than living only in a log line nobody reads.
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
    }
}
