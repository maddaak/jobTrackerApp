package com.jobtracker.core.dto;

import java.util.List;
import java.util.Map;

public record MetricsResponse(
        List<FunnelStageCount> funnel,
        List<OutcomeCount> outcomeCounts,
        List<InterviewRoundCount> interviewRoundCounts,
        List<SankeyLink> sankeyLinks,
        Map<String, Map<String, Integer>> companiesByNode) {
}
