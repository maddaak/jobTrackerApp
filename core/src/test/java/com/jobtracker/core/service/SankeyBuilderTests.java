package com.jobtracker.core.service;

import com.jobtracker.core.dto.SankeyPath;
import com.jobtracker.core.model.InterviewRound;
import com.jobtracker.core.model.InterviewType;
import com.jobtracker.core.model.Job;
import com.jobtracker.core.model.JobLink;
import com.jobtracker.core.model.JobRelation;
import com.jobtracker.core.model.Outcome;
import com.jobtracker.core.model.SourceCategory;
import com.jobtracker.core.model.Stage;
import com.jobtracker.core.model.User;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class SankeyBuilderTests {

    // An unlisted type used to rank after Panel, so a take-home with no ordering job drew past the loop.
    @Test
    void everyRoundTypeRanksWithinItsPhaseAndPanelComesLast() {
        for (InterviewType earlier : InterviewType.values()) {
            for (InterviewType later : InterviewType.values()) {
                if (earlier.phase().ordinal() >= later.phase().ordinal()) {
                    continue;
                }
                assertThat(SankeyBuilder.canonicalRank(SankeyBuilder.roundNode(earlier)))
                        .as("%s before %s", earlier, later)
                        .isLessThan(SankeyBuilder.canonicalRank(SankeyBuilder.roundNode(later)));
            }
        }
    }

    // The web sorts each column by this list, so a node missing from it would land anywhere.
    @Test
    void theNodeOrderPlacesEveryNodeDrawnWithOpenEndingsAboveClosedOnes() {
        List<Job> jobs = new ArrayList<>();
        Map<Long, List<InterviewRound>> rounds = new HashMap<>();
        Map<Long, Stage> furthest = new HashMap<>();
        Instant start = Instant.parse("2026-08-01T15:00:00Z");
        for (Outcome outcome : Outcome.values()) {
            Job job = new Job("Initech", "Engineer", new User("owner", "hash"), SourceCategory.SELF_APPLIED,
                    null, null, null, null);
            job.applyUpdate("Initech", "Engineer", SourceCategory.SELF_APPLIED, null, null, null, null,
                    Stage.OFFER_STAGE, null, outcome);
            ReflectionTestUtils.setField(job, "id", (long) jobs.size() + 1);
            jobs.add(job);
            furthest.put(job.getId(), Stage.OFFER_STAGE);
            List<InterviewRound> faced = new ArrayList<>();
            for (InterviewType type : InterviewType.values()) {
                faced.add(new InterviewRound(start.plusSeconds(3600L * faced.size()), null, type, null, null, List.of()));
            }
            rounds.put(job.getId(), faced);
        }

        SankeyBuilder.SankeyData data = SankeyBuilder.build(jobs, Map.of(), furthest, rounds, start.plusSeconds(86400));

        List<String> order = data.nodeOrder();
        data.links().forEach(link -> assertThat(order).contains(link.source(), link.target()));
        assertThat(order).doesNotHaveDuplicates();
        assertThat(order.indexOf("IN_PROGRESS")).isLessThan(order.indexOf("REJECTED"));
        assertThat(order.indexOf("OFFER")).isLessThan(order.indexOf("IN_PROGRESS"));
        assertThat(order.indexOf("RESUME_CHECK")).isZero();
    }

    // The routes are what the chart traces a hovered stage's jobs along, so they must add up to the links.
    @Test
    void theRoutesCountEveryJobOnceAndAddUpToEveryLink() {
        Instant start = Instant.parse("2026-08-01T15:00:00Z");
        List<Job> jobs = new ArrayList<>();
        Map<Long, Stage> furthest = new HashMap<>();
        Map<Long, List<InterviewRound>> rounds = new HashMap<>();
        // Two jobs take the same route to an offer; a third is rejected after a screen.
        for (Outcome outcome : List.of(Outcome.ACTIVE, Outcome.ACTIVE, Outcome.REJECTED)) {
            Job job = new Job("Initech", "Engineer", new User("owner", "hash"), SourceCategory.SELF_APPLIED,
                    null, null, null, null);
            Stage stage = outcome == Outcome.ACTIVE ? Stage.OFFER_STAGE : Stage.INTERVIEW_STAGE;
            job.applyUpdate("Initech", "Engineer", SourceCategory.SELF_APPLIED, null, null, null, null, stage, null, outcome);
            ReflectionTestUtils.setField(job, "id", (long) jobs.size() + 1);
            jobs.add(job);
            furthest.put(job.getId(), stage);
            rounds.put(job.getId(), List.of(new InterviewRound(start, null, InterviewType.RECRUITER_PHONE_SCREEN, null, null, List.of())));
        }

        SankeyBuilder.SankeyData data = SankeyBuilder.build(jobs, Map.of(), furthest, rounds, start.plusSeconds(86400));

        assertThat(data.paths()).extracting(SankeyPath::jobs).containsExactlyInAnyOrder(2L, 1L);
        assertThat(data.paths()).filteredOn(path -> path.nodes().contains("OFFER")).singleElement()
                .satisfies(path -> assertThat(path.nodes())
                        .containsExactly("RESUME_CHECK", "INTERVIEW_REQUEST", "RECRUITER_PHONE_SCREEN", "OFFER", "IN_PROGRESS"));
        Map<String, Long> fromRoutes = new HashMap<>();
        for (SankeyPath path : data.paths()) {
            for (int i = 0; i + 1 < path.nodes().size(); i++) {
                fromRoutes.merge(path.nodes().get(i) + "->" + path.nodes().get(i + 1), path.jobs(), Long::sum);
            }
        }
        data.links().forEach(link -> assertThat(fromRoutes.get(link.source() + "->" + link.target()))
                .as("%s to %s", link.source(), link.target()).isEqualTo(link.value()));
    }

    // Rejected after the screen with an onsite still on the calendar: the journey ended at the screen.
    @Test
    void aRoundStillBookedIsNotDrawn() {
        Instant now = Instant.parse("2026-08-01T15:00:00Z");
        Job job = new Job("Initech", "Engineer", new User("owner", "hash"), SourceCategory.SELF_APPLIED,
                null, null, null, null);
        job.applyUpdate("Initech", "Engineer", SourceCategory.SELF_APPLIED, null, null, null, null,
                Stage.INTERVIEW_STAGE, null, Outcome.REJECTED);
        ReflectionTestUtils.setField(job, "id", 1L);
        List<InterviewRound> rounds = List.of(
                new InterviewRound(now.minusSeconds(86400), null, InterviewType.TECHNICAL_PHONE_SCREEN, null, null, List.of()),
                new InterviewRound(now.plusSeconds(86400), null, InterviewType.SYSTEM_DESIGN, null, null, List.of()));

        SankeyBuilder.SankeyData data = SankeyBuilder.build(List.of(job), Map.of(), Map.of(1L, Stage.INTERVIEW_STAGE),
                Map.of(1L, rounds), now);

        assertThat(data.paths()).singleElement().satisfies(path -> assertThat(path.nodes())
                .containsExactly("RESUME_CHECK", "INTERVIEW_REQUEST", "TECHNICAL_PHONE_SCREEN", "REJECTED"));
    }

    // Screens on the first posting, a manager screen on its repost, then the panel and offer on the third: one
    // pursuit, so one journey through all of it, not two dead ends beside a route that starts at the panel.
    @Test
    void aChainOfRepostsIsOneJourneyThroughEveryPostingsRounds() {
        Instant now = Instant.parse("2026-10-10T15:00:00Z");
        Job first = posting(1L, Stage.FINALIZED, Outcome.POSITION_CLOSED);
        Job second = posting(2L, Stage.FINALIZED, Outcome.POSITION_CLOSED);
        Job third = posting(3L, Stage.OFFER_STAGE, Outcome.ACTIVE);
        Map<Long, List<JobLink>> links = Map.of(
                1L, List.of(new JobLink(2L, JobRelation.REPLACED_BY)),
                2L, List.of(new JobLink(1L, JobRelation.REPLACES), new JobLink(3L, JobRelation.REPLACED_BY)),
                3L, List.of(new JobLink(2L, JobRelation.REPLACES)));
        Map<Long, List<InterviewRound>> rounds = Map.of(
                1L, List.of(round(InterviewType.RECRUITER_PHONE_SCREEN, now.minus(Duration.ofDays(60))),
                        round(InterviewType.TECHNICAL_PHONE_SCREEN, now.minus(Duration.ofDays(52)))),
                2L, List.of(round(InterviewType.HIRING_MANAGER_SCREEN, now.minus(Duration.ofDays(40)))),
                3L, List.of(round(InterviewType.PANEL_CODING, now.minus(Duration.ofDays(5)))));

        // Newest first, as the service hands them over.
        SankeyBuilder.SankeyData data = SankeyBuilder.build(List.of(third, second, first), links,
                Map.of(1L, Stage.WAITING_INTERVIEW_RESULTS, 2L, Stage.INTERVIEW_STAGE, 3L, Stage.OFFER_STAGE),
                rounds, now);

        assertThat(data.paths()).singleElement().satisfies(path -> {
            assertThat(path.nodes()).containsExactly("RESUME_CHECK", "INTERVIEW_REQUEST", "RECRUITER_PHONE_SCREEN",
                    "TECHNICAL_PHONE_SCREEN", "HIRING_MANAGER_SCREEN", "PANEL", "OFFER", "IN_PROGRESS");
            assertThat(path.jobs()).isEqualTo(1);
            assertThat(path.applications()).singleElement()
                    .satisfies(journey -> {
                        assertThat(journey.jobId()).isEqualTo(3L);
                        assertThat(journey.postings()).isEqualTo(3);
                    });
        });
    }

    // Rows added out of order (an import, or the old posting backfilled later) still end where the newest stands.
    @Test
    void aChainEndsWhereItsNewestPostingStandsWhateverOrderTheRowsWereAdded() {
        Instant now = Instant.parse("2026-10-10T15:00:00Z");
        Job old = posting(1L, Stage.RESUME_CHECK, Outcome.POSITION_CLOSED);
        Job repost = posting(2L, Stage.RESUME_CHECK, Outcome.ACTIVE);
        Map<Long, List<JobLink>> links = Map.of(
                1L, List.of(new JobLink(2L, JobRelation.REPLACED_BY)),
                2L, List.of(new JobLink(1L, JobRelation.REPLACES)));

        // The old posting was added last, so it comes first.
        SankeyBuilder.SankeyData data = SankeyBuilder.build(List.of(old, repost), links,
                Map.of(1L, Stage.RESUME_CHECK, 2L, Stage.RESUME_CHECK), Map.of(), now);

        assertThat(data.paths()).singleElement().satisfies(path -> {
            assertThat(path.nodes()).containsExactly("RESUME_CHECK", "IN_PROGRESS");
            assertThat(path.applications()).singleElement().satisfies(journey -> assertThat(journey.jobId()).isEqualTo(2L));
        });
    }

    // Related is another role at the same place, not a repost, so each keeps its own journey.
    @Test
    void relatedJobsKeepTheirOwnJourneys() {
        Instant now = Instant.parse("2026-10-10T15:00:00Z");
        Job one = posting(1L, Stage.RESUME_CHECK, Outcome.REJECTED);
        Job other = posting(2L, Stage.RESUME_CHECK, Outcome.ACTIVE);
        Map<Long, List<JobLink>> links = Map.of(
                1L, List.of(new JobLink(2L, JobRelation.RELATED)),
                2L, List.of(new JobLink(1L, JobRelation.RELATED)));

        SankeyBuilder.SankeyData data = SankeyBuilder.build(List.of(other, one), links, Map.of(), Map.of(), now);

        assertThat(data.paths()).extracting(SankeyPath::jobs).containsExactlyInAnyOrder(1L, 1L);
    }

    private static Job posting(long id, Stage stage, Outcome outcome) {
        Job job = new Job("Initech", "Engineer", new User("owner", "hash"), SourceCategory.SELF_APPLIED,
                null, null, null, null);
        job.applyUpdate("Initech", "Engineer", SourceCategory.SELF_APPLIED, null, null, null, null, stage, null, outcome);
        ReflectionTestUtils.setField(job, "id", id);
        return job;
    }

    private static InterviewRound round(InterviewType type, Instant at) {
        return new InterviewRound(at, null, type, null, null, List.of());
    }
}
