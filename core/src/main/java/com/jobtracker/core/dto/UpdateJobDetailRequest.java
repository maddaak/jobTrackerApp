package com.jobtracker.core.dto;

public record UpdateJobDetailRequest(
        String jdText,
        String interviewNotes,
        String recommendedResume,
        String notes,
        String rejectedReason) {
}
