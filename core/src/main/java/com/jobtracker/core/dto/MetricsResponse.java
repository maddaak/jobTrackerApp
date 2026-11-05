package com.jobtracker.core.dto;

import java.util.List;

public record MetricsResponse(
        MetricsSummary summary,
        List<FunnelStageCount> funnel,
        List<OutcomeCount> outcomeCounts,
        List<InterviewRoundCount> interviewRoundCounts,
        List<SankeyLink> sankeyLinks,
        // Top-to-bottom order for the Sankey's nodes within a column.
        List<String> sankeyNodeOrder,
        // Each distinct route through the Sankey with its jobs, so a hovered stage can light the whole journey of
        // its jobs and list them, all from one source.
        List<SankeyPath> sankeyPaths,
        // Oldest first, ending with the current week, every week present even when empty.
        List<WeeklyActivity> weeklyActivity,
        // Only jobs with the resume they were sent with recorded; most replies first.
        List<ResumeResponseRate> resumeResponses) {
}
