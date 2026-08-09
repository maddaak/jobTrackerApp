package com.jobtracker.core.dto;

import com.jobtracker.core.model.InterviewType;
import com.jobtracker.core.model.Stage;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.List;

public record CreateInterviewRequest(
        @NotNull Long jobId,
        // createInterview advances the job, so an unconstrained stage lets a POST jump the pipeline.
        @NotNull @InterviewStage Stage stage,
        @NotNull Instant interviewDateTime,
        @NotNull InterviewType interviewType,
        String meetingLink,
        String location,
        List<@Valid InterviewerRequest> interviewers) {
}
