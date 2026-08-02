package com.jobtracker.core.model;

/**
 * Pipeline checkpoints only, in order. Terminal results live in {@link Outcome}
 * instead, so a job's furthest-reached Stage stays on record even after it's
 * rejected/ghosted/declined. The INTERVIEW_REQUEST -> INTERVIEW_STAGE ->
 * WAITING_INTERVIEW_RESULTS trio is re-entered once per interview round.
 */
public enum Stage {
    RESUME_CHECK,
    INTERVIEW_REQUEST,
    INTERVIEW_STAGE,
    WAITING_INTERVIEW_RESULTS,
    OFFER_STAGE,
    FINALIZED
}
