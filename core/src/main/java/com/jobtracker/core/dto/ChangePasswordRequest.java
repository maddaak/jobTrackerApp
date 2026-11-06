package com.jobtracker.core.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ChangePasswordRequest(
        @NotBlank @Size(max = Limits.PASSWORD) String currentPassword,
        @NotBlank @Size(max = Limits.PASSWORD) String newPassword) {
}
