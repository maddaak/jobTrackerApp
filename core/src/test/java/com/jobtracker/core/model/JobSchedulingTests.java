package com.jobtracker.core.model;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class JobSchedulingTests {

    private static final Instant NOW = Instant.parse("2026-08-10T12:00:00Z");

    private static Job job(Stage stage, Outcome outcome) {
        Job job = new Job("Initech", "Engineer", new User("owner", "hash"), SourceCategory.SELF_APPLIED,
                null, null, null, null);
        job.applyUpdate("Initech", "Engineer", SourceCategory.SELF_APPLIED, null, null, null, null, stage, null, outcome);
        return job;
    }

    private static InterviewRound round(String start, String end) {
        return new InterviewRound(Instant.parse(start), end == null ? null : Instant.parse(end),
                InterviewType.BEHAVIOR, null, null, List.of());
    }

    @Test
    void asksOnlyOfAnActiveJobInTheMiddleOfInterviewing() {
        for (Stage stage : Stage.values()) {
            for (Outcome outcome : Outcome.values()) {
                Job job = job(stage, outcome);
                boolean expected = job.getCurrentStage() == Stage.INTERVIEW_STAGE && outcome == Outcome.ACTIVE;
                assertThat(job.needsScheduling(null, NOW)).as("%s %s", stage, outcome).isEqualTo(expected);
            }
        }
    }

    @Test
    void clearsOnceARoundIsBookedAndComesBackOnceTheLastOneIsOver() {
        Job interviewing = job(Stage.INTERVIEW_STAGE, Outcome.ACTIVE);

        assertThat(interviewing.needsScheduling(round("2026-08-12T15:00:00Z", null), NOW)).isFalse();
        // Under way: still booked until it ends.
        assertThat(interviewing.needsScheduling(round("2026-08-10T11:30:00Z", "2026-08-10T12:30:00Z"), NOW)).isFalse();
        assertThat(interviewing.needsScheduling(round("2026-08-01T15:00:00Z", "2026-08-01T16:00:00Z"), NOW)).isTrue();
    }

    @Test
    void theLatestRoundIsTheOneThatStartsLast() {
        InterviewRound held = round("2026-08-01T15:00:00Z", null);
        InterviewRound booked = round("2026-08-20T15:00:00Z", null);

        assertThat(InterviewRound.latest(List.of(booked, held))).contains(booked);
        assertThat(InterviewRound.latest(List.of())).isEmpty();
    }
}
