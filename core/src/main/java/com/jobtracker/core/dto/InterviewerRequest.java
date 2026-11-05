package com.jobtracker.core.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record InterviewerRequest(
        @NotBlank @Size(max = Limits.SHORT_TEXT) String name,
        @Size(max = Limits.URL) String linkedInUrl) {
}
