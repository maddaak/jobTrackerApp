package com.jobtracker.core.dto;

import com.jobtracker.core.model.InterviewPhase;
import com.jobtracker.core.model.Location;
import com.jobtracker.core.model.Outcome;
import com.jobtracker.core.model.SourceCategory;
import com.jobtracker.core.model.Stage;
import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record UpdateJobRequest(
        @NotBlank @Size(max = 255) String company,
        @NotBlank @Size(max = 255) String role,
        @NotNull SourceCategory sourceCategory,
        @Size(max = Limits.URL) String url,
        Location location,
        @Size(max = 100) String city,
        Integer compMin,
        Integer compMax,
        @NotNull Stage currentStage,
        InterviewPhase interviewPhase,
        @NotNull Outcome outcome) {

    // On each request rather than in Job, so a backup holding a range saved before this check still restores.
    @JsonIgnore
    @AssertTrue(message = "the salary range's minimum is above its maximum")
    public boolean isSalaryRangeInOrder() {
        return compMin == null || compMax == null || compMin <= compMax;
    }
}
