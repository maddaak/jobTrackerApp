package com.jobtracker.core.model;

public enum Outcome {
    ACTIVE,
    OFFER_ACCEPTED,
    OFFER_DECLINED,
    REJECTED,
    GHOSTED,
    WITHDRAWN;

    // Offer outcomes excluded: they stay at OFFER_STAGE, which the Sankey reads to route them.
    public boolean closesPipeline() {
        return this == REJECTED || this == GHOSTED || this == WITHDRAWN;
    }
}
