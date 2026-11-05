package com.jobtracker.core.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ResetPasswordRequest(
        @NotBlank @Size(max = Limits.SHORT_TEXT) String token,
        @NotBlank @Size(max = Limits.PASSWORD) String newPassword) {
}
