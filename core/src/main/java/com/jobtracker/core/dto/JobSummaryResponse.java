package com.jobtracker.core.dto;

import com.jobtracker.core.model.InterviewPhase;
import com.jobtracker.core.model.Location;
import com.jobtracker.core.model.Outcome;
import com.jobtracker.core.model.SourceCategory;
import com.jobtracker.core.model.Stage;
import java.time.Instant;
import java.util.List;

// Exactly what the board and table render; notes/rejectedReason live on the Mongo detail document.
public record JobSummaryResponse(
        Long id,
        String company,
        String role,
        SourceCategory sourceCategory,
        Stage currentStage,
        // Stored, null until the card is dragged: what a PATCH sends back, so an edit never freezes a guess.
        InterviewPhase interviewPhase,
        // Where the card sits: the drag if any, else the furthest round logged. Display only.
        InterviewPhase boardPhase,
        Outcome outcome,
        String url,
        Location location,
        String city,
        Integer compMin,
        Integer compMax,
        Instant createdAt,
        LatestInterviewSummary latestInterview,
        // Core's rule, so the card's badge and the reminder digest can't disagree about it.
        boolean needsScheduling,
        List<JobLinkResponse> links,
        Long seasonId) {
}
