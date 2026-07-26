package com.jobtracker.core.dto;

import com.jobtracker.core.model.Location;
import com.jobtracker.core.model.SourceCategory;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record CreateJobRequest(
        @NotBlank String company,
        @NotBlank String role,
        @NotNull SourceCategory sourceCategory,
        String url,
        Location location,
        Integer compMin,
        Integer compMax,
        String notes) {
}
