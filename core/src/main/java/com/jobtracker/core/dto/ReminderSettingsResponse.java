package com.jobtracker.core.dto;

// emailConfigured is the server's, not the person's: false means no SMTP settings, so nothing can be sent.
public record ReminderSettingsResponse(
        boolean emailConfigured,
        boolean emailEnabled,
        String email,
        String timeZone,
        boolean digest,
        int digestHour,
        boolean interviewSoon,
        boolean offerDeadline,
        boolean followUp) {
}
