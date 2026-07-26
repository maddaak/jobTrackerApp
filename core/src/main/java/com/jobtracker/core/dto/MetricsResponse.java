package com.jobtracker.core.dto;

import java.util.List;

public record MetricsResponse(
        List<FunnelStageCount> funnel,
        List<OutcomeCount> outcomeCounts,
        List<InterviewRoundCount> interviewRoundCounts,
        List<SankeyLink> sankeyLinks) {
}
