package com.jobtracker.core.dto;

import java.util.List;

// Counted per time faced, so a panel is one count: its verdict is only known at that level.
// passed + notPassed can be under count, since an open pipeline has judged nothing yet.
public record InterviewRoundCount(
        String roundNode,
        long count,
        long passed,
        long notPassed,
        List<RoundJobRef> passedJobs,
        List<RoundJobRef> notPassedJobs) {
}
