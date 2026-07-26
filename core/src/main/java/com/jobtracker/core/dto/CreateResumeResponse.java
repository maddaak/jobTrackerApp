package com.jobtracker.core.dto;

import java.time.Instant;

public record CreateResumeResponse(String id, String fileName, String extractedText, Instant uploadedAt) {
}
