package com.jobtracker.core.service;

import com.jobtracker.core.dto.MetricsResponse;
import com.jobtracker.core.dto.SankeyLink;
import com.jobtracker.core.model.*;
import com.jobtracker.core.repository.JobRepository;
import com.jobtracker.core.repository.StageEventRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.entry;
import static org.mockito.Mockito.when;

class MetricsServiceTests {

    @Mock
    private JobRepository jobs;

    @Mock
    private StageEventRepository stageEvents;

    private MetricsService metricsService;

    private final AtomicLong nextJobId = new AtomicLong(0);

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        metricsService = new MetricsService(jobs, stageEvents);
    }

    private Job newJob(User owner, Source source, Stage stage, Outcome outcome) {
        return newJob(owner, source, stage, outcome, "Acme");
    }

    private Job newJob(User owner, Source source, Stage stage, Outcome outcome, String company) {
        Job job = new Job(company, "Engineer", owner, source, null, null, null, null, null);
        job.applyUpdate(company, "Engineer", null, null, null, null, null, null, stage, outcome);
        ReflectionTestUtils.setField(job, "id", nextJobId.incrementAndGet());
        return job;
    }

    // Adds a terminal FINALIZED event on closed jobs so tests prove it's excluded from "furthest reached".
    private List<StageEvent> stageHistory(Job job, Stage furthest, Outcome outcome) {
        List<StageEvent> events = new ArrayList<>();
        for (Stage stage : Stage.values()) {
            if (stage == Stage.FINALIZED) {
                break;
            }
            events.add(new StageEvent(job, stage, Instant.now(), null));
            if (stage == furthest) {
                break;
            }
        }
        if (outcome != Outcome.ACTIVE) {
            events.add(new StageEvent(job, Stage.FINALIZED, Instant.now(), null));
        }
        return events;
    }

    private StageEvent newInterviewRound(Job job, InterviewType type) {
        StageEvent event = new StageEvent(job, Stage.INTERVIEW_STAGE, Instant.now(), null);
        event.applyInterviewDetails(Instant.now(), type, null, null, Collections.emptyList());
        return event;
    }

    // Explicit interviewDateTime lets a test drive the data-driven Sankey order via timestamps.
    private StageEvent newInterviewRound(Job job, InterviewType type, Instant interviewDateTime) {
        StageEvent event = new StageEvent(job, Stage.INTERVIEW_STAGE, Instant.now(), null);
        event.applyInterviewDetails(interviewDateTime, type, null, null, Collections.emptyList());
        return event;
    }

    @Test
    void funnelCountsJobsThatReachedEachStageOrFurther() {
        User owner = new User("alice", "hash");
        Source source = new Source(SourceCategory.SELF_APPLIED);
        Job resumeCheck = newJob(owner, source, Stage.RESUME_CHECK, Outcome.ACTIVE);
        Job interviewStage = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.ACTIVE);
        Job offerExtended = newJob(owner, source, Stage.OFFER_STAGE, Outcome.REJECTED);
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(resumeCheck, interviewStage, offerExtended));

        List<StageEvent> history = new ArrayList<>();
        history.addAll(stageHistory(resumeCheck, Stage.RESUME_CHECK, Outcome.ACTIVE));
        history.addAll(stageHistory(interviewStage, Stage.INTERVIEW_STAGE, Outcome.ACTIVE));
        history.addAll(stageHistory(offerExtended, Stage.OFFER_STAGE, Outcome.REJECTED));
        when(stageEvents.findAllByJobOwnerId(1L)).thenReturn(history);

        MetricsResponse response = metricsService.getMetrics(1L);

        assertThat(response.funnel()).hasSize(5);
        assertThat(response.funnel()).extracting("stage").doesNotContain(Stage.FINALIZED);
        assertThat(countFor(response, Stage.RESUME_CHECK)).isEqualTo(3);
        assertThat(countFor(response, Stage.INTERVIEW_STAGE)).isEqualTo(2);
        assertThat(countFor(response, Stage.OFFER_STAGE)).isEqualTo(1);
    }

    @Test
    void sankeyRejectedAtResumeCheckWithNoRoundsFlowsStraightToRejected() {
        User owner = new User("bob", "hash");
        Source source = new Source(SourceCategory.SELF_APPLIED);
        Job rejectedAtResume = newJob(owner, source, Stage.RESUME_CHECK, Outcome.REJECTED);
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(rejectedAtResume));
        when(stageEvents.findAllByJobOwnerId(1L))
                .thenReturn(stageHistory(rejectedAtResume, Stage.RESUME_CHECK, Outcome.REJECTED));

        MetricsResponse response = metricsService.getMetrics(1L);

        assertThat(linkValue(response, "RESUME_CHECK", "REJECTED")).isEqualTo(1);
        // No interview request node when there are no rounds and it never reached one.
        assertThat(linkValue(response, "RESUME_CHECK", "INTERVIEW_REQUEST")).isEqualTo(0);
        assertThat(response.sankeyLinks()).hasSize(1);
    }

    @Test
    void sankeyInterviewJourneyThroughRoundsAndPanelToAcceptedOffer() {
        User owner = new User("dave", "hash");
        Source source = new Source(SourceCategory.SELF_APPLIED);
        Job accepted = newJob(owner, source, Stage.OFFER_STAGE, Outcome.OFFER_ACCEPTED);
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(accepted));
        // Increasing timestamps so the data-driven order places SYSTEM_DESIGN before PANEL.
        Instant base = Instant.parse("2026-01-01T00:00:00Z");
        List<StageEvent> history = new ArrayList<>(stageHistory(accepted, Stage.OFFER_STAGE, Outcome.OFFER_ACCEPTED));
        history.add(newInterviewRound(accepted, InterviewType.SYSTEM_DESIGN, base));
        history.add(newInterviewRound(accepted, InterviewType.PANEL_BEHAVIOR, base.plusSeconds(3600)));
        when(stageEvents.findAllByJobOwnerId(1L)).thenReturn(history);

        MetricsResponse response = metricsService.getMetrics(1L);

        assertThat(linkValue(response, "RESUME_CHECK", "INTERVIEW_REQUEST")).isEqualTo(1);
        assertThat(linkValue(response, "INTERVIEW_REQUEST", "SYSTEM_DESIGN")).isEqualTo(1);
        assertThat(linkValue(response, "SYSTEM_DESIGN", "PANEL")).isEqualTo(1);
        assertThat(linkValue(response, "PANEL", "OFFER")).isEqualTo(1);
        assertThat(linkValue(response, "OFFER", "ACCEPTED")).isEqualTo(1);
        // No phantom links: exactly the five links on the path, and no panel enum name leaks through.
        assertThat(response.sankeyLinks()).hasSize(5);
        assertThat(response.sankeyLinks())
                .noneMatch(link -> link.source().equals("PANEL_BEHAVIOR") || link.target().equals("PANEL_BEHAVIOR"));
        assertThat(response.sankeyLinks())
                .noneMatch(link -> link.source().equals("FINALIZED") || link.target().equals("FINALIZED"));
    }

    @Test
    void sankeyRoundOrderIsDrivenByEventTimestampsNotCanonicalOrder() {
        User owner = new User("grace", "hash");
        Source source = new Source(SourceCategory.SELF_APPLIED);
        // Both jobs run BEHAVIOR before SYSTEM_DESIGN; canonical order is the reverse, so timestamps must win.
        Job jobA = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.REJECTED);
        Job jobB = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.REJECTED);
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(jobA, jobB));
        Instant base = Instant.parse("2026-01-01T00:00:00Z");
        List<StageEvent> history = new ArrayList<>();
        history.addAll(stageHistory(jobA, Stage.INTERVIEW_STAGE, Outcome.REJECTED));
        history.addAll(stageHistory(jobB, Stage.INTERVIEW_STAGE, Outcome.REJECTED));
        history.add(newInterviewRound(jobA, InterviewType.BEHAVIOR, base));
        history.add(newInterviewRound(jobA, InterviewType.SYSTEM_DESIGN, base.plusSeconds(3600)));
        history.add(newInterviewRound(jobB, InterviewType.BEHAVIOR, base));
        history.add(newInterviewRound(jobB, InterviewType.SYSTEM_DESIGN, base.plusSeconds(3600)));
        when(stageEvents.findAllByJobOwnerId(1L)).thenReturn(history);

        MetricsResponse response = metricsService.getMetrics(1L);

        // Data-driven order: BEHAVIOR before SYSTEM_DESIGN, both jobs contribute.
        assertThat(linkValue(response, "INTERVIEW_REQUEST", "BEHAVIOR")).isEqualTo(2);
        assertThat(linkValue(response, "BEHAVIOR", "SYSTEM_DESIGN")).isEqualTo(2);
        assertThat(linkValue(response, "SYSTEM_DESIGN", "BEHAVIOR")).isEqualTo(0);

        // Reversing the timestamps reverses the emitted order.
        List<StageEvent> reversedHistory = new ArrayList<>();
        reversedHistory.addAll(stageHistory(jobA, Stage.INTERVIEW_STAGE, Outcome.REJECTED));
        reversedHistory.addAll(stageHistory(jobB, Stage.INTERVIEW_STAGE, Outcome.REJECTED));
        reversedHistory.add(newInterviewRound(jobA, InterviewType.SYSTEM_DESIGN, base));
        reversedHistory.add(newInterviewRound(jobA, InterviewType.BEHAVIOR, base.plusSeconds(3600)));
        reversedHistory.add(newInterviewRound(jobB, InterviewType.SYSTEM_DESIGN, base));
        reversedHistory.add(newInterviewRound(jobB, InterviewType.BEHAVIOR, base.plusSeconds(3600)));
        when(stageEvents.findAllByJobOwnerId(1L)).thenReturn(reversedHistory);

        MetricsResponse reversed = metricsService.getMetrics(1L);

        assertThat(linkValue(reversed, "INTERVIEW_REQUEST", "SYSTEM_DESIGN")).isEqualTo(2);
        assertThat(linkValue(reversed, "SYSTEM_DESIGN", "BEHAVIOR")).isEqualTo(2);
        assertThat(linkValue(reversed, "BEHAVIOR", "SYSTEM_DESIGN")).isEqualTo(0);
    }

    @Test
    void sankeySkipsInterviewRoundsWithNoType() {
        User owner = new User("frank", "hash");
        Source source = new Source(SourceCategory.SELF_APPLIED);
        Job job = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.REJECTED);
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(job));
        // A scheduled interview with no chosen type must not crash and must add no type node.
        List<StageEvent> history = new ArrayList<>(stageHistory(job, Stage.INTERVIEW_STAGE, Outcome.REJECTED));
        history.add(newInterviewRound(job, null));
        when(stageEvents.findAllByJobOwnerId(1L)).thenReturn(history);

        MetricsResponse response = metricsService.getMetrics(1L);

        assertThat(linkValue(response, "RESUME_CHECK", "INTERVIEW_REQUEST")).isEqualTo(1);
        assertThat(linkValue(response, "INTERVIEW_REQUEST", "REJECTED")).isEqualTo(1);
        assertThat(response.sankeyLinks()).hasSize(2);
    }

    @Test
    void activeJobStillAtResumeCheckFlowsToInProgress() {
        User owner = new User("carol", "hash");
        Source source = new Source(SourceCategory.SELF_APPLIED);
        Job resumeCheck = newJob(owner, source, Stage.RESUME_CHECK, Outcome.ACTIVE);
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(resumeCheck));
        when(stageEvents.findAllByJobOwnerId(1L))
                .thenReturn(stageHistory(resumeCheck, Stage.RESUME_CHECK, Outcome.ACTIVE));

        MetricsResponse response = metricsService.getMetrics(1L);

        assertThat(linkValue(response, "RESUME_CHECK", "IN_PROGRESS")).isEqualTo(1);
        assertThat(response.sankeyLinks()).hasSize(1);
    }

    @Test
    void sankeyActiveJobsFlowToInProgressSoNodeTotalsCountEveryJob() {
        User owner = new User("ivan", "hash");
        Source source = new Source(SourceCategory.SELF_APPLIED);
        // Every job gets a terminal, so Resume Check's outgoing links must sum to the full job count.
        Job activeOne = newJob(owner, source, Stage.RESUME_CHECK, Outcome.ACTIVE, "Acme");
        Job activeTwo = newJob(owner, source, Stage.RESUME_CHECK, Outcome.ACTIVE, "Globex");
        Job rejected = newJob(owner, source, Stage.RESUME_CHECK, Outcome.REJECTED, "Initech");
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(activeOne, activeTwo, rejected));
        List<StageEvent> history = new ArrayList<>();
        history.addAll(stageHistory(activeOne, Stage.RESUME_CHECK, Outcome.ACTIVE));
        history.addAll(stageHistory(activeTwo, Stage.RESUME_CHECK, Outcome.ACTIVE));
        history.addAll(stageHistory(rejected, Stage.RESUME_CHECK, Outcome.REJECTED));
        when(stageEvents.findAllByJobOwnerId(1L)).thenReturn(history);

        MetricsResponse response = metricsService.getMetrics(1L);

        assertThat(linkValue(response, "RESUME_CHECK", "IN_PROGRESS")).isEqualTo(2);
        assertThat(linkValue(response, "RESUME_CHECK", "REJECTED")).isEqualTo(1);
        long resumeCheckOutgoing = response.sankeyLinks().stream()
                .filter(link -> link.source().equals("RESUME_CHECK"))
                .mapToLong(SankeyLink::value)
                .sum();
        assertThat(resumeCheckOutgoing).isEqualTo(3);
        // Active companies are listed under the IN_PROGRESS node, each with one job.
        assertThat(response.companiesByNode().get("IN_PROGRESS"))
                .containsOnly(entry("Acme", 1), entry("Globex", 1));
    }

    @Test
    void outcomeCountsExcludeActiveAndCountEachTerminalOutcome() {
        User owner = new User("erin", "hash");
        Source source = new Source(SourceCategory.SELF_APPLIED);
        Job rejected = newJob(owner, source, Stage.OFFER_STAGE, Outcome.REJECTED);
        Job rejectedAgain = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.REJECTED);
        Job active = newJob(owner, source, Stage.RESUME_CHECK, Outcome.ACTIVE);
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(rejected, rejectedAgain, active));

        MetricsResponse response = metricsService.getMetrics(1L);

        assertThat(response.outcomeCounts()).extracting("outcome")
                .doesNotContain(Outcome.ACTIVE);
        assertThat(outcomeCountFor(response, Outcome.REJECTED)).isEqualTo(2);
        assertThat(outcomeCountFor(response, Outcome.GHOSTED)).isEqualTo(0);
    }

    @Test
    void interviewRoundCountsGroupScheduledRoundsByType() {
        User owner = new User("frank", "hash");
        Source source = new Source(SourceCategory.SELF_APPLIED);
        Job job = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.ACTIVE);
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(job));
        when(stageEvents.findAllByJobOwnerId(1L)).thenReturn(List.of(
                newInterviewRound(job, InterviewType.TECHNICAL_PHONE_SCREEN),
                newInterviewRound(job, InterviewType.SYSTEM_DESIGN),
                newInterviewRound(job, InterviewType.SYSTEM_DESIGN)));

        MetricsResponse response = metricsService.getMetrics(1L);

        assertThat(interviewRoundCountFor(response, InterviewType.TECHNICAL_PHONE_SCREEN)).isEqualTo(1);
        assertThat(interviewRoundCountFor(response, InterviewType.SYSTEM_DESIGN)).isEqualTo(2);
        assertThat(interviewRoundCountFor(response, InterviewType.BEHAVIOR)).isEqualTo(0);
    }

    @Test
    void companiesByNodeMapsEachNodeToTheDistinctCompaniesThatFlowThroughIt() {
        User owner = new User("heidi", "hash");
        Source source = new Source(SourceCategory.SELF_APPLIED);
        // Only Acme has a SYSTEM_DESIGN round, so only Acme should appear under that node.
        Job acme = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.REJECTED, "Acme");
        Job globex = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.REJECTED, "Globex");
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(acme, globex));
        List<StageEvent> history = new ArrayList<>();
        history.addAll(stageHistory(acme, Stage.INTERVIEW_STAGE, Outcome.REJECTED));
        history.addAll(stageHistory(globex, Stage.INTERVIEW_STAGE, Outcome.REJECTED));
        Instant base = Instant.parse("2026-01-01T00:00:00Z");
        history.add(newInterviewRound(acme, InterviewType.SYSTEM_DESIGN, base));
        when(stageEvents.findAllByJobOwnerId(1L)).thenReturn(history);

        MetricsResponse response = metricsService.getMetrics(1L);

        assertThat(response.companiesByNode().get("RESUME_CHECK"))
                .containsOnly(entry("Acme", 1), entry("Globex", 1));
        assertThat(response.companiesByNode().get("INTERVIEW_REQUEST"))
                .containsOnly(entry("Acme", 1), entry("Globex", 1));
        assertThat(response.companiesByNode().get("SYSTEM_DESIGN"))
                .containsOnly(entry("Acme", 1));
        assertThat(response.companiesByNode().get("REJECTED"))
                .containsOnly(entry("Acme", 1), entry("Globex", 1));
    }

    @Test
    void companiesByNodeCountsMultipleJobsAtTheSameCompany() {
        User owner = new User("judy", "hash");
        Source source = new Source(SourceCategory.SELF_APPLIED);
        // Two jobs at the same company must count it twice, not dedupe to one entry.
        Job cortexOne = newJob(owner, source, Stage.RESUME_CHECK, Outcome.REJECTED, "Cortex");
        Job cortexTwo = newJob(owner, source, Stage.RESUME_CHECK, Outcome.REJECTED, "Cortex");
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(cortexOne, cortexTwo));
        List<StageEvent> history = new ArrayList<>();
        history.addAll(stageHistory(cortexOne, Stage.RESUME_CHECK, Outcome.REJECTED));
        history.addAll(stageHistory(cortexTwo, Stage.RESUME_CHECK, Outcome.REJECTED));
        when(stageEvents.findAllByJobOwnerId(1L)).thenReturn(history);

        MetricsResponse response = metricsService.getMetrics(1L);

        assertThat(response.companiesByNode().get("RESUME_CHECK"))
                .containsOnly(entry("Cortex", 2));
        assertThat(response.companiesByNode().get("REJECTED"))
                .containsOnly(entry("Cortex", 2));
    }

    private long interviewRoundCountFor(MetricsResponse response, InterviewType type) {
        return response.interviewRoundCounts().stream()
                .filter(r -> r.interviewType() == type)
                .findFirst()
                .map(r -> r.count())
                .orElseThrow();
    }

    private long countFor(MetricsResponse response, Stage stage) {
        return response.funnel().stream()
                .filter(f -> f.stage() == stage)
                .findFirst()
                .map(f -> f.count())
                .orElseThrow();
    }

    private long outcomeCountFor(MetricsResponse response, Outcome outcome) {
        return response.outcomeCounts().stream()
                .filter(o -> o.outcome() == outcome)
                .findFirst()
                .map(o -> o.count())
                .orElseThrow();
    }

    private long linkValue(MetricsResponse response, String source, String target) {
        return response.sankeyLinks().stream()
                .filter((SankeyLink link) -> link.source().equals(source) && link.target().equals(target))
                .findFirst()
                .map(SankeyLink::value)
                .orElse(0L);
    }
}
