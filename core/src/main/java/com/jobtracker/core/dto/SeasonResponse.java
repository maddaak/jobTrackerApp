package com.jobtracker.core.dto;

import java.time.Instant;

// closedAt is null while the season runs; acceptedJobId is the offer accepted when it closed.
// firstApplied and lastApplied are null for a season with no jobs yet.
public record SeasonResponse(Long id, String name, Instant createdAt, long jobCount, boolean active,
        Instant closedAt, Long acceptedJobId, Instant firstApplied, Instant lastApplied) {
}
