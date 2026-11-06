package com.jobtracker.core.model;

import java.util.Arrays;
import java.util.Optional;

// What each saved AI result belongs to decides where it lives: on a job's document, on one of its interview
// rounds, or on the account, for answers that aren't about one job. Prep is per job and kind of round, so
// it can be read before any round is scheduled.
public enum AiKind {
    COMPANY_BRIEF("company-brief", Scope.ACCOUNT, false),
    INSIGHTS("insights", Scope.ACCOUNT, true),
    OFFER_COMPARISON("offer-comparison", Scope.ACCOUNT, true),
    INTERVIEW_PREP("prep", Scope.JOB, false),
    DEBRIEF("debrief", Scope.ROUND, false),
    FOLLOW_UP("follow-up", Scope.JOB, false),
    NEGOTIATION("negotiation", Scope.JOB, false),
    TAILORING("tailoring", Scope.JOB, false);

    public enum Scope { ACCOUNT, JOB, ROUND }

    // The name in URLs and the key results are stored under.
    private final String key;
    private final Scope scope;
    // Made from the season on screen, so each season keeps its own.
    private final boolean perSeason;

    AiKind(String key, Scope scope, boolean perSeason) {
        this.key = key;
        this.scope = scope;
        this.perSeason = perSeason;
    }

    public String key() {
        return key;
    }

    public boolean perSeason() {
        return perSeason;
    }

    public static Optional<AiKind> find(String key, Scope scope) {
        return Arrays.stream(values()).filter(kind -> kind.key.equals(key) && kind.scope == scope).findFirst();
    }
}
