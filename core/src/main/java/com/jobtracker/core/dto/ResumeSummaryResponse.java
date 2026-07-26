package com.jobtracker.core.dto;

import java.time.Instant;
import java.util.List;

public record ResumeSummaryResponse(
        String id,
        String fileName,
        Instant uploadedAt,
        String analysisStatus,
        String summary,
        List<String> skills,
        String seniority,
        List<String> roles) {
}
