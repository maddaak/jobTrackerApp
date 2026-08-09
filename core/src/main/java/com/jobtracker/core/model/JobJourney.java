package com.jobtracker.core.model;

import java.util.List;

// Read-only view of the parts of a JobDetail that describe a job's journey: its stage history and
// its interview rounds. A separate type, not an interface JobDetail implements: Spring Data only
// builds a projection when the returned type is not assignable from the entity, so a shared
// supertype would hand back the entity itself with the projected-away fields nulled, one cast away
// from being saved over the real ones.
public record JobJourney(Long jobId, List<StageHistoryEntry> stageHistory, List<InterviewRound> interviews) {

    // A document written before a field existed omits it, and the projection then yields null.
    public JobJourney {
        stageHistory = stageHistory == null ? List.of() : stageHistory;
        interviews = interviews == null ? List.of() : interviews;
    }
}
