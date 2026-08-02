package com.jobtracker.core.dto;

// Sent alongside the rules-based recommendation so BFF can forward these blurbs to the
// scraper's Claude-backed /recommend-resume-variant endpoint without hardcoding variant
// config in two places.
public record ResumeVariantSummary(String id, String displayName, String blurb) {
}
