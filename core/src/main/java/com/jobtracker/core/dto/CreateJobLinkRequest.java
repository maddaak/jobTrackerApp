package com.jobtracker.core.dto;

import com.jobtracker.core.model.JobRelation;
import jakarta.validation.constraints.NotNull;

public record CreateJobLinkRequest(
        @NotNull(message = "is required") Long targetJobId,
        @NotNull(message = "is required") JobRelation relation) {
}
