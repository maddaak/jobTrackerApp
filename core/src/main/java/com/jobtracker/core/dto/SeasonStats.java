package com.jobtracker.core.dto;

import java.time.Instant;

// One season at a glance for the Seasons page. Each count is jobs that got at least that far, so a job
// rejected after its panel still counts as interviewed. The dates are null for an empty season.
public record SeasonStats(Long seasonId, long applications, long active, long heardBack, long interviewed,
        long offers, Instant firstApplied, Instant lastApplied) {
}
