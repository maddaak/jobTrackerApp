package com.jobtracker.core.dto;

import com.jobtracker.core.model.Location;
import com.jobtracker.core.model.Outcome;
import com.jobtracker.core.model.SourceCategory;
import com.jobtracker.core.model.Stage;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record UpdateJobRequest(
        @NotBlank String company,
        @NotBlank String role,
        @NotNull SourceCategory sourceCategory,
        String url,
        Location location,
        Integer compMin,
        Integer compMax,
        String notes,
        @NotNull Stage currentStage,
        @NotNull Outcome outcome,
        String rejectedReason) {
}
