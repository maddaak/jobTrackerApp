package com.jobtracker.core.dto;

import com.jobtracker.core.model.Location;
import com.jobtracker.core.model.Outcome;
import com.jobtracker.core.model.SourceCategory;
import com.jobtracker.core.model.Stage;
import java.time.Instant;

// Exactly what the table page renders; notes/rejectedReason live on the Mongo detail document.
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
        Instant createdAt,
        LatestInterviewSummary latestInterview) {
}
