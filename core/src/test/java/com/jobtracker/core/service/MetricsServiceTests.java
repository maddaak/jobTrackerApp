package com.jobtracker.core.service;

import com.jobtracker.core.dto.MetricsResponse;
import com.jobtracker.core.dto.SankeyLink;
import com.jobtracker.core.model.*;
import com.jobtracker.core.repository.JobDetailRepository;
import com.jobtracker.core.repository.JobRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.entry;
import static org.mockito.Mockito.when;

class MetricsServiceTests {

    private static final Instant T0 = Instant.parse("2026-01-01T00:00:00Z");

    @Mock
    private JobRepository jobs;

    @Mock
    private JobDetailRepository jobDetails;

    private MetricsService metricsService;

    private final AtomicLong nextJobId = new AtomicLong(0);

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        metricsService = new MetricsService(jobs, jobDetails);
    }

    private Job newJob(User owner, SourceCategory source, Stage stage, Outcome outcome) {
        return newJob(owner, source, stage, outcome, "Acme");
    }

    private Job newJob(User owner, SourceCategory source, Stage stage, Outcome outcome, String company) {
        Job job = new Job(company, "Engineer", owner, source, null, null, null, null);
        job.applyUpdate(company, "Engineer", source, null, null, null, null, stage, outcome);
        ReflectionTestUtils.setField(job, "id", nextJobId.incrementAndGet());
        return job;
    }

    // Walks the pipeline up to `furthest`, then adds a terminal FINALIZED on closed jobs so tests
    // prove it's excluded from "furthest reached".
    // findJourneysByOwnerId returns the projection, not the whole document.
    private JobJourney journey(JobDetail detail) {
        return new JobJourney(detail.getJobId(), detail.getStageHistory(), detail.getInterviews());
    }

    // Mirrors what findJourneysByOwnerId returns: the projection, not the whole document.
    private JobJourney detail(Job job, Stage furthest, Outcome outcome, InterviewRound... rounds) {
        JobDetail detail = new JobDetail(job.getId(), 1L, null, null);
        Instant at = T0;
        for (Stage stage : Stage.values()) {
            if (stage == Stage.FINALIZED) {
                break;
            }
            detail.recordStage(stage, at, null);
            at = at.plusSeconds(60);
            if (stage == furthest) {
                break;
            }
        }
        if (outcome != Outcome.ACTIVE) {
            detail.recordStage(Stage.FINALIZED, at, null);
        }
        for (InterviewRound round : rounds) {
            detail.addInterview(round);
        }
        return new JobJourney(detail.getJobId(), detail.getStageHistory(), detail.getInterviews());
    }

    private InterviewRound round(InterviewType type) {
        return round(type, T0);
    }

    // Explicit interviewDateTime lets a test drive the data-driven Sankey order via timestamps.
    private InterviewRound round(InterviewType type, Instant interviewDateTime) {
        return new InterviewRound(interviewDateTime, type, null, null, List.of());
    }

    @Test
    void funnelCountsJobsThatReachedEachStageOrFurther() {
        User owner = new User("alice", "hash");
        SourceCategory source = SourceCategory.SELF_APPLIED;
        Job resumeCheck = newJob(owner, source, Stage.RESUME_CHECK, Outcome.ACTIVE);
        Job interviewStage = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.ACTIVE);
        Job offerExtended = newJob(owner, source, Stage.OFFER_STAGE, Outcome.REJECTED);
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L))
                .thenReturn(List.of(resumeCheck, interviewStage, offerExtended));
        when(jobDetails.findJourneysByOwnerId(1L)).thenReturn(List.of(
                detail(resumeCheck, Stage.RESUME_CHECK, Outcome.ACTIVE),
                detail(interviewStage, Stage.INTERVIEW_STAGE, Outcome.ACTIVE),
                detail(offerExtended, Stage.OFFER_STAGE, Outcome.REJECTED)));

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
        SourceCategory source = SourceCategory.SELF_APPLIED;
        Job rejectedAtResume = newJob(owner, source, Stage.RESUME_CHECK, Outcome.REJECTED);
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(rejectedAtResume));
        when(jobDetails.findJourneysByOwnerId(1L))
                .thenReturn(List.of(detail(rejectedAtResume, Stage.RESUME_CHECK, Outcome.REJECTED)));

        MetricsResponse response = metricsService.getMetrics(1L);

        assertThat(linkValue(response, "RESUME_CHECK", "REJECTED")).isEqualTo(1);
        // No interview request node when there are no rounds and it never reached one.
        assertThat(linkValue(response, "RESUME_CHECK", "INTERVIEW_REQUEST")).isEqualTo(0);
        assertThat(response.sankeyLinks()).hasSize(1);
    }

    @Test
    void sankeyInterviewJourneyThroughRoundsAndPanelToAcceptedOffer() {
        User owner = new User("dave", "hash");
        SourceCategory source = SourceCategory.SELF_APPLIED;
        Job accepted = newJob(owner, source, Stage.OFFER_STAGE, Outcome.OFFER_ACCEPTED);
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(accepted));
        // Increasing timestamps so the data-driven order places SYSTEM_DESIGN before PANEL.
        when(jobDetails.findJourneysByOwnerId(1L)).thenReturn(List.of(
                detail(accepted, Stage.OFFER_STAGE, Outcome.OFFER_ACCEPTED,
                        round(InterviewType.SYSTEM_DESIGN, T0),
                        round(InterviewType.PANEL_BEHAVIOR, T0.plusSeconds(3600)))));

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
    // Driven off the enum so a panel type added later is covered without touching this test.
    void sankeyCollapsesEveryPanelTypeIntoTheSinglePanelNode() {
        User owner = new User("dave", "hash");
        SourceCategory source = SourceCategory.SELF_APPLIED;
        Job accepted = newJob(owner, source, Stage.OFFER_STAGE, Outcome.OFFER_ACCEPTED);
        List<InterviewType> panelTypes = Arrays.stream(InterviewType.values())
                .filter(type -> type.name().startsWith("PANEL"))
                .toList();
        InterviewRound[] rounds = new InterviewRound[panelTypes.size()];
        for (int i = 0; i < panelTypes.size(); i++) {
            rounds[i] = round(panelTypes.get(i), T0.plusSeconds(3600L * i));
        }
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(accepted));
        when(jobDetails.findJourneysByOwnerId(1L)).thenReturn(List.of(
                detail(accepted, Stage.OFFER_STAGE, Outcome.OFFER_ACCEPTED, rounds)));

        MetricsResponse response = metricsService.getMetrics(1L);

        assertThat(linkValue(response, "INTERVIEW_REQUEST", "PANEL")).isEqualTo(1);
        assertThat(linkValue(response, "PANEL", "OFFER")).isEqualTo(1);
        // Every panel round collapses onto one node, so the whole journey is these four links and nothing else.
        assertThat(response.sankeyLinks()).hasSize(4);
        assertThat(response.sankeyLinks())
                .noneMatch(link -> link.source().startsWith("PANEL_") || link.target().startsWith("PANEL_"));
    }

    @Test
    void sankeyRoundOrderIsDrivenByEventTimestampsNotCanonicalOrder() {
        User owner = new User("grace", "hash");
        SourceCategory source = SourceCategory.SELF_APPLIED;
        // Both jobs run BEHAVIOR before SYSTEM_DESIGN; canonical order is the reverse, so timestamps must win.
        Job jobA = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.REJECTED);
        Job jobB = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.REJECTED);
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(jobA, jobB));
        when(jobDetails.findJourneysByOwnerId(1L)).thenReturn(List.of(
                detail(jobA, Stage.INTERVIEW_STAGE, Outcome.REJECTED,
                        round(InterviewType.BEHAVIOR, T0), round(InterviewType.SYSTEM_DESIGN, T0.plusSeconds(3600))),
                detail(jobB, Stage.INTERVIEW_STAGE, Outcome.REJECTED,
                        round(InterviewType.BEHAVIOR, T0), round(InterviewType.SYSTEM_DESIGN, T0.plusSeconds(3600)))));

        MetricsResponse response = metricsService.getMetrics(1L);

        // Data-driven order: BEHAVIOR before SYSTEM_DESIGN, both jobs contribute.
        assertThat(linkValue(response, "INTERVIEW_REQUEST", "BEHAVIOR")).isEqualTo(2);
        assertThat(linkValue(response, "BEHAVIOR", "SYSTEM_DESIGN")).isEqualTo(2);
        assertThat(linkValue(response, "SYSTEM_DESIGN", "BEHAVIOR")).isEqualTo(0);

        // Reversing the timestamps reverses the emitted order.
        when(jobDetails.findJourneysByOwnerId(1L)).thenReturn(List.of(
                detail(jobA, Stage.INTERVIEW_STAGE, Outcome.REJECTED,
                        round(InterviewType.SYSTEM_DESIGN, T0), round(InterviewType.BEHAVIOR, T0.plusSeconds(3600))),
                detail(jobB, Stage.INTERVIEW_STAGE, Outcome.REJECTED,
                        round(InterviewType.SYSTEM_DESIGN, T0), round(InterviewType.BEHAVIOR, T0.plusSeconds(3600)))));

        MetricsResponse reversed = metricsService.getMetrics(1L);

        assertThat(linkValue(reversed, "INTERVIEW_REQUEST", "SYSTEM_DESIGN")).isEqualTo(2);
        assertThat(linkValue(reversed, "SYSTEM_DESIGN", "BEHAVIOR")).isEqualTo(2);
        assertThat(linkValue(reversed, "BEHAVIOR", "SYSTEM_DESIGN")).isEqualTo(0);
    }

    @Test
    void sankeySkipsInterviewRoundsWithNoType() {
        User owner = new User("frank", "hash");
        SourceCategory source = SourceCategory.SELF_APPLIED;
        Job job = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.REJECTED);
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(job));
        // A scheduled interview with no chosen type must not crash and must add no type node.
        when(jobDetails.findJourneysByOwnerId(1L)).thenReturn(List.of(
                detail(job, Stage.INTERVIEW_STAGE, Outcome.REJECTED, round(null))));

        MetricsResponse response = metricsService.getMetrics(1L);

        assertThat(linkValue(response, "RESUME_CHECK", "INTERVIEW_REQUEST")).isEqualTo(1);
        assertThat(linkValue(response, "INTERVIEW_REQUEST", "REJECTED")).isEqualTo(1);
        assertThat(response.sankeyLinks()).hasSize(2);
    }

    @Test
    void activeJobStillAtResumeCheckFlowsToInProgress() {
        User owner = new User("carol", "hash");
        SourceCategory source = SourceCategory.SELF_APPLIED;
        Job resumeCheck = newJob(owner, source, Stage.RESUME_CHECK, Outcome.ACTIVE);
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(resumeCheck));
        when(jobDetails.findJourneysByOwnerId(1L))
                .thenReturn(List.of(detail(resumeCheck, Stage.RESUME_CHECK, Outcome.ACTIVE)));

        MetricsResponse response = metricsService.getMetrics(1L);

        assertThat(linkValue(response, "RESUME_CHECK", "IN_PROGRESS")).isEqualTo(1);
        assertThat(response.sankeyLinks()).hasSize(1);
    }

    @Test
    void sankeyActiveJobsFlowToInProgressSoNodeTotalsCountEveryJob() {
        User owner = new User("ivan", "hash");
        SourceCategory source = SourceCategory.SELF_APPLIED;
        // Every job gets a terminal, so Resume Check's outgoing links must sum to the full job count.
        Job activeOne = newJob(owner, source, Stage.RESUME_CHECK, Outcome.ACTIVE, "Acme");
        Job activeTwo = newJob(owner, source, Stage.RESUME_CHECK, Outcome.ACTIVE, "Globex");
        Job rejected = newJob(owner, source, Stage.RESUME_CHECK, Outcome.REJECTED, "Initech");
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(activeOne, activeTwo, rejected));
        when(jobDetails.findJourneysByOwnerId(1L)).thenReturn(List.of(
                detail(activeOne, Stage.RESUME_CHECK, Outcome.ACTIVE),
                detail(activeTwo, Stage.RESUME_CHECK, Outcome.ACTIVE),
                detail(rejected, Stage.RESUME_CHECK, Outcome.REJECTED)));

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
        SourceCategory source = SourceCategory.SELF_APPLIED;
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
        SourceCategory source = SourceCategory.SELF_APPLIED;
        Job job = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.ACTIVE);
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(job));
        when(jobDetails.findJourneysByOwnerId(1L)).thenReturn(List.of(
                detail(job, Stage.INTERVIEW_STAGE, Outcome.ACTIVE,
                        round(InterviewType.TECHNICAL_PHONE_SCREEN),
                        round(InterviewType.SYSTEM_DESIGN),
                        round(InterviewType.SYSTEM_DESIGN))));

        MetricsResponse response = metricsService.getMetrics(1L);

        assertThat(interviewRoundCountFor(response, InterviewType.TECHNICAL_PHONE_SCREEN)).isEqualTo(1);
        assertThat(interviewRoundCountFor(response, InterviewType.SYSTEM_DESIGN)).isEqualTo(2);
        assertThat(interviewRoundCountFor(response, InterviewType.BEHAVIOR)).isEqualTo(0);
    }

    @Test
    void companiesByNodeMapsEachNodeToTheDistinctCompaniesThatFlowThroughIt() {
        User owner = new User("heidi", "hash");
        SourceCategory source = SourceCategory.SELF_APPLIED;
        // Only Acme has a SYSTEM_DESIGN round, so only Acme should appear under that node.
        Job acme = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.REJECTED, "Acme");
        Job globex = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.REJECTED, "Globex");
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(acme, globex));
        when(jobDetails.findJourneysByOwnerId(1L)).thenReturn(List.of(
                detail(acme, Stage.INTERVIEW_STAGE, Outcome.REJECTED, round(InterviewType.SYSTEM_DESIGN, T0)),
                detail(globex, Stage.INTERVIEW_STAGE, Outcome.REJECTED)));

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
        SourceCategory source = SourceCategory.SELF_APPLIED;
        // Two jobs at the same company must count it twice, not dedupe to one entry.
        Job cortexOne = newJob(owner, source, Stage.RESUME_CHECK, Outcome.REJECTED, "Cortex");
        Job cortexTwo = newJob(owner, source, Stage.RESUME_CHECK, Outcome.REJECTED, "Cortex");
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(cortexOne, cortexTwo));
        when(jobDetails.findJourneysByOwnerId(1L)).thenReturn(List.of(
                detail(cortexOne, Stage.RESUME_CHECK, Outcome.REJECTED),
                detail(cortexTwo, Stage.RESUME_CHECK, Outcome.REJECTED)));

        MetricsResponse response = metricsService.getMetrics(1L);

        assertThat(response.companiesByNode().get("RESUME_CHECK"))
                .containsOnly(entry("Cortex", 2));
        assertThat(response.companiesByNode().get("REJECTED"))
                .containsOnly(entry("Cortex", 2));
    }

    @Test
    void reopeningAfterAFinalizeCountsOnlyTheLiveAttempt() {
        User owner = new User("erin", "hash");
        SourceCategory source = SourceCategory.SELF_APPLIED;
        // Presumed ghosted after silence, then the company replied, so it is back at Interview Request and active.
        Job reopened = newJob(owner, source, Stage.INTERVIEW_REQUEST, Outcome.ACTIVE);
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(reopened));

        Instant base = Instant.parse("2026-07-29T00:00:00Z");
        JobDetail detail = new JobDetail(reopened.getId(), 1L, null, null);
        detail.recordStage(Stage.RESUME_CHECK, base, null);
        detail.recordStage(Stage.INTERVIEW_REQUEST, base.plusSeconds(60), null);
        detail.recordStage(Stage.INTERVIEW_STAGE, base.plusSeconds(120), null);
        detail.recordStage(Stage.FINALIZED, base.plusSeconds(180), null);
        detail.recordStage(Stage.WAITING_INTERVIEW_RESULTS, base.plusSeconds(240), null);
        detail.recordStage(Stage.INTERVIEW_REQUEST, base.plusSeconds(300), null);
        when(jobDetails.findJourneysByOwnerId(1L)).thenReturn(List.of(journey(detail)));

        MetricsResponse response = metricsService.getMetrics(1L);

        assertThat(countFor(response, Stage.RESUME_CHECK)).isEqualTo(1);
        assertThat(countFor(response, Stage.INTERVIEW_REQUEST)).isEqualTo(1);
        // Interview Stage belongs to the retracted attempt, Waiting Results was stepped back down.
        assertThat(countFor(response, Stage.INTERVIEW_STAGE)).isEqualTo(0);
        assertThat(countFor(response, Stage.WAITING_INTERVIEW_RESULTS)).isEqualTo(0);
        assertThat(outcomeCountFor(response, Outcome.REJECTED)).isEqualTo(0);
        assertThat(linkValue(response, "INTERVIEW_REQUEST", "IN_PROGRESS")).isEqualTo(1);
        assertThat(response.sankeyLinks()).extracting(SankeyLink::target).doesNotContain("REJECTED");
    }

    @Test
    void aStillClosedJobKeepsItsFullHistory() {
        User owner = new User("frank", "hash");
        SourceCategory source = SourceCategory.SELF_APPLIED;
        Job rejected = newJob(owner, source, Stage.FINALIZED, Outcome.REJECTED);
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(rejected));

        Instant base = Instant.parse("2026-07-29T00:00:00Z");
        JobDetail detail = new JobDetail(rejected.getId(), 1L, null, null);
        detail.recordStage(Stage.RESUME_CHECK, base, null);
        detail.recordStage(Stage.INTERVIEW_REQUEST, base.plusSeconds(60), null);
        detail.recordStage(Stage.INTERVIEW_STAGE, base.plusSeconds(120), null);
        detail.recordStage(Stage.FINALIZED, base.plusSeconds(180), null);
        when(jobDetails.findJourneysByOwnerId(1L)).thenReturn(List.of(journey(detail)));

        MetricsResponse response = metricsService.getMetrics(1L);

        assertThat(countFor(response, Stage.INTERVIEW_STAGE)).isEqualTo(1);
        assertThat(linkValue(response, "INTERVIEW_REQUEST", "REJECTED")).isEqualTo(1);
    }

    @Test
    void steppingAJobBackDownWithoutFinalizingCountsItAtItsCurrentStage() {
        User owner = new User("gina", "hash");
        SourceCategory source = SourceCategory.SELF_APPLIED;
        Job steppedBack = newJob(owner, source, Stage.INTERVIEW_REQUEST, Outcome.ACTIVE);
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(steppedBack));

        Instant base = Instant.parse("2026-07-29T00:00:00Z");
        JobDetail detail = new JobDetail(steppedBack.getId(), 1L, null, null);
        detail.recordStage(Stage.RESUME_CHECK, base, null);
        detail.recordStage(Stage.INTERVIEW_REQUEST, base.plusSeconds(60), null);
        detail.recordStage(Stage.INTERVIEW_STAGE, base.plusSeconds(120), null);
        detail.recordStage(Stage.INTERVIEW_REQUEST, base.plusSeconds(180), null);
        when(jobDetails.findJourneysByOwnerId(1L)).thenReturn(List.of(journey(detail)));

        MetricsResponse response = metricsService.getMetrics(1L);

        assertThat(countFor(response, Stage.INTERVIEW_REQUEST)).isEqualTo(1);
        assertThat(countFor(response, Stage.INTERVIEW_STAGE)).isEqualTo(0);
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
