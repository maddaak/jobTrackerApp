package com.jobtracker.core.dto;

import jakarta.validation.constraints.NotBlank;

public record InterviewerRequest(
        @NotBlank String name,
        String linkedInUrl) {
}
