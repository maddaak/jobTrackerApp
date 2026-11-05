package com.jobtracker.core.config;

import com.jobtracker.core.model.JobDetail;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Component;

// Spring Data reads a null @Version as a new document, so saving a pre-@Version one inserts a
// duplicate and fails. Off in tests, since most test contexts point at a Mongo that never connects.
@Component
@ConditionalOnProperty(name = "app.backfill-detail-versions", matchIfMissing = true)
public class DetailVersions implements SmartInitializingSingleton {

    private static final Logger log = LoggerFactory.getLogger(DetailVersions.class);

    private final MongoTemplate mongo;

    public DetailVersions(MongoTemplate mongo) {
        this.mongo = mongo;
    }

    @Override
    public void afterSingletonsInstantiated() {
        try {
            backfill();
        } catch (RuntimeException e) {
            // Not fatal, like the index setup: Mongo being slow to start must not stop core booting.
            log.error("could not give older job_details documents a version; saving one will fail until restart", e);
        }
    }

    long backfill() {
        long updated = mongo.updateMulti(new Query(Criteria.where("version").exists(false)),
                new Update().set("version", 0L), JobDetail.class).getModifiedCount();
        if (updated > 0) {
            log.info("gave {} older job_details document(s) a version", updated);
        }
        return updated;
    }
}
