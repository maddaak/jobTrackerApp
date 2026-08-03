package com.jobtracker.core.dto;

// BFF-internal only, never exposed to the frontend.
public record ResumeTextResponse(String id, String extractedText) {
}
