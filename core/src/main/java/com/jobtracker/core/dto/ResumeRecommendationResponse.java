package com.jobtracker.core.dto;

import java.util.List;
import java.util.Map;

public record ResumeRecommendationResponse(
        String recommendedVariantId,
        String recommendedDisplayName,
        Map<String, Integer> scores,
        String reason,
        List<ResumeVariantSummary> variants) {
}
