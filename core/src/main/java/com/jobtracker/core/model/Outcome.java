package com.jobtracker.core.model;

public enum Outcome {
    ACTIVE,
    OFFER_ACCEPTED,
    OFFER_DECLINED,
    REJECTED,
    GHOSTED,
    WITHDRAWN,
    // The employer closed the req: not a rejection, not the candidate walking away.
    POSITION_CLOSED,
    // A hiring freeze or a pause on either side. Not closed, so the job keeps its stage and resumes in place.
    PAUSED;

    // Offer outcomes excluded: they stay at OFFER_STAGE, which the Sankey reads to route them.
    public boolean closesPipeline() {
        return this == REJECTED || this == GHOSTED || this == WITHDRAWN || this == POSITION_CLOSED;
    }
}
