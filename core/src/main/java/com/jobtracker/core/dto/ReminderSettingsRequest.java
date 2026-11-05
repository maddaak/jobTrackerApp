package com.jobtracker.core.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

// Turning email off keeps the address and the per-kind choices, so turning it back on restores them.
public record ReminderSettingsRequest(
        boolean emailEnabled,
        @Email @Size(max = 254) String email,
        @NotBlank @Size(max = Limits.SHORT_TEXT) String timeZone,
        boolean digest,
        @Min(0) @Max(23) int digestHour,
        boolean interviewSoon,
        boolean offerDeadline,
        boolean followUp) {
}
