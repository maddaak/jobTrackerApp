package com.jobtracker.core.dto;

import com.jobtracker.core.model.InterviewType;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;

// No stage: logging a round always means interviewing, and core decides what that does to the job.
public record CreateInterviewRequest(
        @NotNull Long jobId,
        @NotNull Instant interviewDateTime,
        // Optional: the length is not always known when the round is booked.
        Instant interviewEndDateTime,
        @NotNull InterviewType interviewType,
        @Size(max = Limits.URL) String meetingLink,
        @Size(max = Limits.SHORT_TEXT) String location,
        @Size(max = Limits.LIST) List<@Valid InterviewerRequest> interviewers) {
}
