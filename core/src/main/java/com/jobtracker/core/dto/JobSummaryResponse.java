package com.jobtracker.core.dto;

import com.jobtracker.core.model.Location;
import com.jobtracker.core.model.Outcome;
import com.jobtracker.core.model.SourceCategory;
import com.jobtracker.core.model.Stage;
import java.time.Instant;

public record JobSummaryResponse(
        Long id,
        String company,
        String role,
        SourceCategory sourceCategory,
        Stage currentStage,
        Outcome outcome,
        String url,
        Location location,
        Integer compMin,
        Integer compMax,
        String rejectedReason,
        String notes,
        Instant createdAt,
        LatestInterviewSummary latestInterview) {
}
