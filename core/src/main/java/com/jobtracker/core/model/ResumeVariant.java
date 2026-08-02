package com.jobtracker.core.model;

import java.util.List;

// A resume variant's targeted emphasis, matched against a job's title/description text by
// ResumeRecommenderService. Seed config (see that class), not a DB table: the user has a
// small, hand-curated set of resume files, not something that needs its own collection yet.
// blurb is the one-paragraph summary sent to Claude for the Phase 2 LLM second opinion
// (FEATURE_resume_recommender.md). emphasisTags drive the free rule-based match, blurb
// drives the paid one.
public record ResumeVariant(String id, String displayName, String blurb, List<String> emphasisTags) {
}
