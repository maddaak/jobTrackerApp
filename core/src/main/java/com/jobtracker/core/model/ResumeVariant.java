package com.jobtracker.core.model;

import java.util.List;

// emphasisTags drive the free rule-based match; blurb is the summary sent to Claude for Phase 2.
public record ResumeVariant(String id, String displayName, String blurb, List<String> emphasisTags) {
}
