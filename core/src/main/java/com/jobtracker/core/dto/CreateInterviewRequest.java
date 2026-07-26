package com.jobtracker.core.dto;

import com.jobtracker.core.model.InterviewType;
import com.jobtracker.core.model.Stage;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.List;

public record CreateInterviewRequest(
        @NotNull Long jobId,
        @NotNull Stage stage,
        @NotNull Instant interviewDateTime,
        InterviewType interviewType,
        String meetingLink,
        String location,
        List<InterviewerRequest> interviewers) {
}
