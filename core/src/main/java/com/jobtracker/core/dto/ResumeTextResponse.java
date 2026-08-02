package com.jobtracker.core.dto;

// Used only by BFF to fetch a resume's stored text back out when the user chooses "summarize
// with AI" after upload (or on a resume that's still pending from an earlier session). Never
// exposed directly to the frontend.
public record ResumeTextResponse(String id, String extractedText) {
}
