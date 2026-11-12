package com.jobtracker.core.dto;

import java.time.Instant;

// closedAt is null while the season runs; acceptedJobId stays after a reopen, to fill the next close.
// firstApplied and lastApplied are null for a season with no jobs yet.
public record SeasonResponse(Long id, String name, Instant createdAt, long jobCount, boolean active,
        Instant closedAt, Long acceptedJobId, Instant firstApplied, Instant lastApplied) {
}
