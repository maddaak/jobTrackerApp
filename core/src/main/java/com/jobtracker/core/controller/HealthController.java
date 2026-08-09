package com.jobtracker.core.controller;

import com.jobtracker.core.config.MongoIndexes;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
public class HealthController {

    // ObjectProvider, not a required bean: MongoIndexes is conditional and absent in tests.
    private final ObjectProvider<MongoIndexes> mongoIndexes;

    public HealthController(ObjectProvider<MongoIndexes> mongoIndexes) {
        this.mongoIndexes = mongoIndexes;
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "ok", "service", "core", "indexes", indexState());
    }

    // Index creation is non-fatal, so without this a missing unique jobId index is invisible.
    private String indexState() {
        MongoIndexes indexes = mongoIndexes.getIfAvailable();
        if (indexes == null) {
            return "disabled";
        }
        return indexes.isReady() ? "ready" : "degraded";
    }
}
