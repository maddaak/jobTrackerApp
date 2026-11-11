package com.jobtracker.core.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RegisterRequest(
        @NotBlank @Size(max = 100) String name,
        @NotBlank @Email @Size(max = 254) String email,
        @NotBlank @Size(max = Limits.SHORT_TEXT) String username,
        @NotBlank @Size(max = Limits.PASSWORD) String password) {
}
