package com.jobtracker.core.dto;

import java.time.Instant;

// Metadata only. The bytes come from the download endpoint, so listing a job never moves a file.
public record JobImageResponse(
        String id,
        String fileName,
        String contentType,
        int sizeBytes,
        Instant uploadedAt) {
}
