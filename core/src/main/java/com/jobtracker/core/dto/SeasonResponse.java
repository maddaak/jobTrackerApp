package com.jobtracker.core.dto;

import java.time.Instant;

public record SeasonResponse(Long id, String name, Instant createdAt, long jobCount, boolean active) {
}
