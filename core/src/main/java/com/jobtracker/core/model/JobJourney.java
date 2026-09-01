package com.jobtracker.core.model;

import java.util.List;

// Not a JobDetail supertype: Spring Data only projects when the return type isn't assignable from the entity.
public record JobJourney(Long jobId, List<StageHistoryEntry> stageHistory, List<InterviewRound> interviews,
        List<JobLink> relatedJobs) {

    // A document written before a field existed omits it, and the projection then yields null.
    public JobJourney {
        stageHistory = stageHistory == null ? List.of() : stageHistory;
        interviews = interviews == null ? List.of() : interviews;
        relatedJobs = relatedJobs == null ? List.of() : relatedJobs;
    }
}
