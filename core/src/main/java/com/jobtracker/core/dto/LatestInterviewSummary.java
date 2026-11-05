package com.jobtracker.core.dto;

import com.jobtracker.core.model.InterviewType;
import java.time.Instant;
import java.util.List;

public record LatestInterviewSummary(
        String roundId,
        Instant interviewDateTime,
        Instant interviewEndDateTime,
        InterviewType interviewType,
        long roundCount,
        String meetingLink,
        String location,
        List<InterviewerResponse> interviewers) {
}
