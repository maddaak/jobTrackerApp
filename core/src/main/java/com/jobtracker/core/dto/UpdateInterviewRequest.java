package com.jobtracker.core.dto;

import com.jobtracker.core.model.InterviewType;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.List;

public record UpdateInterviewRequest(
        @NotNull Instant interviewDateTime,
        InterviewType interviewType,
        String meetingLink,
        String location,
        List<InterviewerRequest> interviewers) {
}
