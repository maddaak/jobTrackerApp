package com.jobtracker.core.dto;

public record JobDetailDocumentResponse(Long jobId, String jdText, String interviewNotes, String recommendedResume) {
}
