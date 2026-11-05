package com.jobtracker.core.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

public record UpdateJobDetailRequest(
        @Size(max = Limits.LONG_TEXT) String jdText,
        @Size(max = Limits.LONG_TEXT) String interviewNotes,
        @Size(max = Limits.SHORT_TEXT) String recommendedResume,
        @Size(max = Limits.LONG_TEXT) String notes,
        @Size(max = Limits.LONG_TEXT) String rejectedReason,
        // The whole list, replacing what's saved; null leaves it alone.
        @Size(max = 30) List<@Valid @NotNull ContactRequest> contacts,
        // A resume's file name; "" clears it.
        @Size(max = 255) String sentResume) {
}
