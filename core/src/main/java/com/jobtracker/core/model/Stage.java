package com.jobtracker.core.model;

// Ordered pipeline checkpoints; terminal results live in Outcome so the furthest Stage survives rejection.
public enum Stage {
    RESUME_CHECK,
    INTERVIEW_REQUEST,
    INTERVIEW_STAGE,
    WAITING_INTERVIEW_RESULTS,
    OFFER_STAGE,
    FINALIZED;

    // The stages an InterviewPhase refines.
    public boolean isInterviewing() {
        return this == INTERVIEW_STAGE || this == WAITING_INTERVIEW_RESULTS;
    }

    public boolean isOnBoard() {
        return this == INTERVIEW_REQUEST || isInterviewing();
    }
}
