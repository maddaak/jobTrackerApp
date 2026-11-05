package com.jobtracker.core.dto;

import java.util.List;

// One route through the Sankey, start to finish, how many journeys took it, and which. The page lights a hovered
// stage's whole route from these, and lists the journeys at it, or on one route.
public record SankeyPath(List<String> nodes, long jobs, List<Application> applications) {

    // One journey: a job, or a chain of reposts (postings > 1) named by its newest posting.
    public record Application(long jobId, String company, String role, int postings) {
    }
}
