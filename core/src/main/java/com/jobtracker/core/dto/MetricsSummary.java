package com.jobtracker.core.dto;

// The headline numbers. Anything the funnel or round rows already carry is left to them.
public record MetricsSummary(
        long totalJobs,
        long activeJobs,
        // Active jobs on the board: contacted or interviewing, past waiting on an application.
        long inInterviews,
        long interviewsDone,
        long interviewsUpcoming) {
}
