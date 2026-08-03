package com.jobtracker.core.dto;

// Lets BFF forward blurbs to the scraper's Claude recommend endpoint without duplicating variant config.
public record ResumeVariantSummary(String id, String displayName, String blurb) {
}
