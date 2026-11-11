package com.jobtracker.core.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.jobtracker.core.model.Location;
import com.jobtracker.core.model.SourceCategory;
import com.jobtracker.core.model.Stage;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateJobRequest(
        @NotBlank @Size(max = 255) String company,
        @NotBlank @Size(max = 255) String role,
        @NotNull SourceCategory sourceCategory,
        @Size(max = Limits.URL) String url,
        Location location,
        @Size(max = 100) String city,
        Integer compMin,
        Integer compMax,
        @Size(max = Limits.LONG_TEXT) String notes,
        // Null means applied and waiting; a recruiter reaching out first starts the job as contacted.
        Stage startingStage,
        // Carried on create so a new job is one request, not a create plus follow-up saves that could race.
        @Size(max = Limits.LONG_TEXT) String jdText,
        @Size(max = Limits.SHORT_TEXT) String recommendedResume) {

    @JsonIgnore
    @AssertTrue(message = "the salary range's minimum is above its maximum")
    public boolean isSalaryRangeInOrder() {
        return compMin == null || compMax == null || compMin <= compMax;
    }

    // Anything later needs rounds or an offer behind it, so a new job can't be created already past them.
    @JsonIgnore
    @AssertTrue(message = "a new job can only start as applied or contacted")
    public boolean isStartingStageAllowed() {
        return startingStage == null || startingStage == Stage.RESUME_CHECK || startingStage == Stage.INTERVIEW_REQUEST;
    }
}
