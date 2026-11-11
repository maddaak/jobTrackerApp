package com.jobtracker.core.dto;

import com.jobtracker.core.model.InterviewType;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;

public record UpdateInterviewRequest(
        @NotNull Instant interviewDateTime,
        Instant interviewEndDateTime,
        @NotNull InterviewType interviewType,
        @Size(max = Limits.URL) String meetingLink,
        @Size(max = Limits.SHORT_TEXT) String location,
        @Size(max = Limits.LIST) List<@Valid InterviewerRequest> interviewers) {
}
