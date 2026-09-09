package com.jobtracker.core.dto;

import java.util.List;

public record JobDetailDocumentResponse(
        Long jobId,
        String jdText,
        String interviewNotes,
        String recommendedResume,
        String notes,
        String rejectedReason,
        List<JobLinkResponse> links) {
}
