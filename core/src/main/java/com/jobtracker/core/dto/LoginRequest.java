package com.jobtracker.core.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record LoginRequest(
        @NotBlank @Size(max = Limits.SHORT_TEXT) String username,
        @NotBlank @Size(max = Limits.PASSWORD) String password) {
}
