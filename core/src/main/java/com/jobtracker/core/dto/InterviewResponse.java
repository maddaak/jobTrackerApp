package com.jobtracker.core.dto;

import com.jobtracker.core.model.InterviewType;
import com.jobtracker.core.model.Stage;
import java.time.Instant;
import java.util.List;

public record InterviewResponse(
        String roundId,
        Long jobId,
        String company,
        String role,
        Stage stage,
        Instant interviewDateTime,
        InterviewType interviewType,
        String meetingLink,
        String location,
        List<InterviewerResponse> interviewers) {
}
