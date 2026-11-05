package com.jobtracker.core.service;

import com.jobtracker.core.dto.InterviewRoundCount;
import com.jobtracker.core.dto.RoundJobRef;
import com.jobtracker.core.dto.MetricsResponse;
import com.jobtracker.core.dto.MetricsSummary;
import com.jobtracker.core.dto.SankeyLink;
import com.jobtracker.core.dto.SankeyPath;
import com.jobtracker.core.model.*;
import com.jobtracker.core.repository.JobDetailRepository;
import com.jobtracker.core.repository.JobRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.InstanceOfAssertFactories.list;
import static org.assertj.core.api.Assertions.entry;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

class MetricsServiceTests {

    private static final Instant T0 = Instant.parse("2026-01-01T00:00:00Z");
    // Pinned, so what counts as held or upcoming can't shift mid-test.
    private static final Instant NOW = Instant.now();

    @Mock
    private JobRepository jobs;

    @Mock
    private JobDetailRepository jobDetails;

    @Mock
    private SeasonService seasons;

    private MetricsService metricsService;

    private final AtomicLong nextJobId = new AtomicLong(0);

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        when(seasons.inView(any())).thenReturn(job -> true);
        metricsService = new MetricsService(jobs, jobDetails, seasons, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private Job newJob(User owner, SourceCategory source, Stage stage, Outcome outcome) {
        return newJob(owner, source, stage, outcome, "Acme");
    }

    private Job newJob(User owner, SourceCategory source, Stage stage, Outcome outcome, String company) {
        Job job = new Job(company, "Engineer", owner, source, null, null, null, null);
        job.applyUpdate(company, "Engineer", source, null, null, null, null, stage, null, outcome);
        ReflectionTestUtils.setField(job, "id", nextJobId.incrementAndGet());
        return job;
    }

    // Adds a terminal FINALIZED on closed jobs, so tests prove it stays out of "furthest reached".
    private JobJourney journey(JobDetail detail) {
        return new JobJourney(detail.getJobId(), detail.getStageHistory(), detail.getInterviews(), detail.getRelatedJobs());
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
        return new JobJourney(detail.getJobId(), detail.getStageHistory(), detail.getInterviews(), detail.getRelatedJobs());
    }

    private InterviewRound round(InterviewType type) {
        return round(type, T0);
    }

    private InterviewRound round(InterviewType type, Instant interviewDateTime) {
        return new InterviewRound(interviewDateTime, null, type, null, null, List.of());
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
    void summaryCountsActiveJobsOnTheBoardAndSplitsRoundsAroundNow() {
        User owner = new User("alice", "hash");
        SourceCategory source = SourceCategory.SELF_APPLIED;
        Job applied = newJob(owner, source, Stage.RESUME_CHECK, Outcome.ACTIVE);
        Job contacted = newJob(owner, source, Stage.INTERVIEW_REQUEST, Outcome.ACTIVE);
        Job interviewing = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.ACTIVE);
        Job waiting = newJob(owner, source, Stage.WAITING_INTERVIEW_RESULTS, Outcome.ACTIVE);
        Job offered = newJob(owner, source, Stage.OFFER_STAGE, Outcome.ACTIVE);
        Job rejected = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.REJECTED);
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L))
                .thenReturn(List.of(applied, contacted, interviewing, waiting, offered, rejected));
        Instant now = NOW;
        when(jobDetails.findJourneysByOwnerId(1L)).thenReturn(List.of(
                detail(interviewing, Stage.INTERVIEW_STAGE, Outcome.ACTIVE,
                        round(InterviewType.RECRUITER_PHONE_SCREEN, now.minus(Duration.ofDays(3))),
                        round(InterviewType.SYSTEM_DESIGN, now.plus(Duration.ofDays(2))),
                        // Under way right now: still upcoming until it ends.
                        new InterviewRound(now.minus(Duration.ofMinutes(30)), now.plus(Duration.ofMinutes(30)),
                                InterviewType.BEHAVIOR, null, null, List.of())),
                detail(rejected, Stage.INTERVIEW_STAGE, Outcome.REJECTED,
                        round(InterviewType.TECHNICAL_PHONE_SCREEN, now.minus(Duration.ofDays(9))),
                        // A closed job's leftover round is never going to happen.
                        round(InterviewType.VALUES, now.plus(Duration.ofDays(1))))));

        MetricsSummary summary = metricsService.getMetrics(1L).summary();

        assertThat(summary.totalJobs()).isEqualTo(6);
        assertThat(summary.activeJobs()).isEqualTo(5);
        assertThat(summary.inInterviews()).isEqualTo(3);
        assertThat(summary.interviewsDone()).isEqualTo(2);
        assertThat(summary.interviewsUpcoming()).isEqualTo(2);
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
    // Regression: a node seen alone elsewhere used to average ahead of the round a job really ran first.
    void sankeyRoundOrderFollowsRealPrecedenceOverNodesThatOnlyAppearAloneElsewhere() {
        User owner = new User("henry", "hash");
        SourceCategory source = SourceCategory.SELF_APPLIED;
        Job soloDesign = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.REJECTED, "Acme");
        Job soloCodeReview = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.REJECTED, "Acme");
        Job codeReviewThenDesign = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.ACTIVE, "Astronomer");
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L))
                .thenReturn(List.of(soloDesign, soloCodeReview, codeReviewThenDesign));
        when(jobDetails.findJourneysByOwnerId(1L)).thenReturn(List.of(
                detail(soloDesign, Stage.INTERVIEW_STAGE, Outcome.REJECTED,
                        round(InterviewType.SYSTEM_DESIGN, T0)),
                detail(soloCodeReview, Stage.INTERVIEW_STAGE, Outcome.REJECTED,
                        round(InterviewType.HIRING_MANAGER_SCREEN, T0),
                        round(InterviewType.BEHAVIOR, T0.plusSeconds(3600)),
                        round(InterviewType.TECHNICAL_CODE_REVIEW, T0.plusSeconds(7200))),
                detail(codeReviewThenDesign, Stage.INTERVIEW_STAGE, Outcome.ACTIVE,
                        round(InterviewType.TECHNICAL_CODE_REVIEW, T0),
                        round(InterviewType.SYSTEM_DESIGN, T0.plusSeconds(3600)))));

        MetricsResponse response = metricsService.getMetrics(1L);

        assertThat(linkValue(response, "INTERVIEW_REQUEST", "TECHNICAL_CODE_REVIEW")).isEqualTo(1);
        assertThat(linkValue(response, "TECHNICAL_CODE_REVIEW", "SYSTEM_DESIGN")).isEqualTo(1);
        assertThat(linkValue(response, "SYSTEM_DESIGN", "TECHNICAL_CODE_REVIEW")).isEqualTo(0);
    }

    @Test
    // Regression: a per-job override emitted both directions for one pair, which d3-sankey can't render.
    void sankeyNeverEmitsBothDirectionsForAConflictingRoundPair() {
        User owner = new User("iris", "hash");
        SourceCategory source = SourceCategory.SELF_APPLIED;
        Job jobA = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.REJECTED, "Exacare AI");
        Job jobB = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.ACTIVE, "Globex");
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(jobA, jobB));
        when(jobDetails.findJourneysByOwnerId(1L)).thenReturn(List.of(
                detail(jobA, Stage.INTERVIEW_STAGE, Outcome.REJECTED,
                        round(InterviewType.RECRUITER_PHONE_SCREEN, T0),
                        round(InterviewType.SYSTEM_DESIGN, T0.plusSeconds(3600)),
                        round(InterviewType.TECHNICAL_PHONE_SCREEN, T0.plusSeconds(7200))),
                detail(jobB, Stage.INTERVIEW_STAGE, Outcome.ACTIVE,
                        round(InterviewType.RECRUITER_PHONE_SCREEN, T0),
                        round(InterviewType.TECHNICAL_PHONE_SCREEN, T0.plusSeconds(3600)),
                        round(InterviewType.BEHAVIOR, T0.plusSeconds(7200)),
                        round(InterviewType.SYSTEM_DESIGN, T0.plusSeconds(10800)))));

        MetricsResponse response = metricsService.getMetrics(1L);

        boolean designToPhone = linkValue(response, "SYSTEM_DESIGN", "TECHNICAL_PHONE_SCREEN") > 0;
        boolean phoneToDesign = linkValue(response, "TECHNICAL_PHONE_SCREEN", "SYSTEM_DESIGN") > 0;
        assertThat(designToPhone && phoneToDesign).as("both link directions present at once").isFalse();
    }

    @Test
    // A conflict resolves to the direction most jobs experienced, not an accident of hash order.
    void sankeyConflictingRoundOrderResolvesByWhichDirectionMostJobsActuallyExperienced() {
        User owner = new User("jack", "hash");
        SourceCategory source = SourceCategory.SELF_APPLIED;
        Job majorityOne = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.REJECTED, "Acme");
        Job majorityTwo = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.REJECTED, "Globex");
        Job majorityThree = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.REJECTED, "Initech");
        Job minority = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.REJECTED, "Umbrella");
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L))
                .thenReturn(List.of(majorityOne, majorityTwo, majorityThree, minority));
        when(jobDetails.findJourneysByOwnerId(1L)).thenReturn(List.of(
                detail(majorityOne, Stage.INTERVIEW_STAGE, Outcome.REJECTED,
                        round(InterviewType.SYSTEM_DESIGN, T0), round(InterviewType.TECHNICAL_PHONE_SCREEN, T0.plusSeconds(3600))),
                detail(majorityTwo, Stage.INTERVIEW_STAGE, Outcome.REJECTED,
                        round(InterviewType.SYSTEM_DESIGN, T0), round(InterviewType.TECHNICAL_PHONE_SCREEN, T0.plusSeconds(3600))),
                detail(majorityThree, Stage.INTERVIEW_STAGE, Outcome.REJECTED,
                        round(InterviewType.SYSTEM_DESIGN, T0), round(InterviewType.TECHNICAL_PHONE_SCREEN, T0.plusSeconds(3600))),
                detail(minority, Stage.INTERVIEW_STAGE, Outcome.REJECTED,
                        round(InterviewType.TECHNICAL_PHONE_SCREEN, T0), round(InterviewType.SYSTEM_DESIGN, T0.plusSeconds(3600)))));

        MetricsResponse response = metricsService.getMetrics(1L);

        assertThat(linkValue(response, "SYSTEM_DESIGN", "TECHNICAL_PHONE_SCREEN")).isEqualTo(4);
        assertThat(linkValue(response, "TECHNICAL_PHONE_SCREEN", "SYSTEM_DESIGN")).isEqualTo(0);
    }

    @Test
    void sankeyResolvesAConflictWithoutReorderingAJobThatContradictsNothing() {
        // The third job is part of no disagreement, so resolving the other two must not reorder it.
        User owner = new User("kate", "hash");
        SourceCategory source = SourceCategory.SELF_APPLIED;
        Job forward = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.REJECTED, "Acme");
        Job backward = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.REJECTED, "Globex");
        Job uninvolved = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.REJECTED, "Initech");
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L))
                .thenReturn(List.of(forward, backward, uninvolved));
        when(jobDetails.findJourneysByOwnerId(1L)).thenReturn(List.of(
                detail(forward, Stage.INTERVIEW_STAGE, Outcome.REJECTED,
                        round(InterviewType.SYSTEM_DESIGN, T0), round(InterviewType.TECHNICAL_PHONE_SCREEN, T0.plusSeconds(3600))),
                detail(backward, Stage.INTERVIEW_STAGE, Outcome.REJECTED,
                        round(InterviewType.TECHNICAL_PHONE_SCREEN, T0), round(InterviewType.SYSTEM_DESIGN, T0.plusSeconds(3600))),
                detail(uninvolved, Stage.INTERVIEW_STAGE, Outcome.REJECTED,
                        round(InterviewType.SYSTEM_DESIGN, T0), round(InterviewType.BEHAVIOR, T0.plusSeconds(3600)))));

        MetricsResponse response = metricsService.getMetrics(1L);

        assertThat(linkValue(response, "SYSTEM_DESIGN", "BEHAVIOR")).isEqualTo(1);
        assertThat(linkValue(response, "BEHAVIOR", "SYSTEM_DESIGN")).isEqualTo(0);
    }

    @Test
    void sankeyKeepsAJobsLastTwoRoundsInOrderWhenAnEarlierRoundIsContested() {
        // The contested pair must not cost the six-round job the order of its own last two rounds.
        User owner = new User("liam", "hash");
        SourceCategory source = SourceCategory.SELF_APPLIED;
        Job full = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.ACTIVE, "Acme");
        Job forwardOne = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.REJECTED, "Globex");
        Job forwardTwo = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.REJECTED, "Initech");
        Job backward = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.REJECTED, "Umbrella");
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L))
                .thenReturn(List.of(full, forwardOne, forwardTwo, backward));
        when(jobDetails.findJourneysByOwnerId(1L)).thenReturn(List.of(
                detail(full, Stage.INTERVIEW_STAGE, Outcome.ACTIVE,
                        round(InterviewType.RECRUITER_PHONE_SCREEN, T0),
                        round(InterviewType.HIRING_MANAGER_SCREEN, T0.plusSeconds(3600)),
                        round(InterviewType.TAKE_HOME_ASSIGNMENT, T0.plusSeconds(7200)),
                        round(InterviewType.TECHNICAL_CODE_REVIEW, T0.plusSeconds(10800)),
                        round(InterviewType.SYSTEM_DESIGN, T0.plusSeconds(14400)),
                        round(InterviewType.CULTURE_FIT, T0.plusSeconds(18000))),
                detail(forwardOne, Stage.INTERVIEW_STAGE, Outcome.REJECTED,
                        round(InterviewType.TECHNICAL_PHONE_SCREEN, T0), round(InterviewType.SYSTEM_DESIGN, T0.plusSeconds(3600))),
                detail(forwardTwo, Stage.INTERVIEW_STAGE, Outcome.REJECTED,
                        round(InterviewType.TECHNICAL_PHONE_SCREEN, T0), round(InterviewType.SYSTEM_DESIGN, T0.plusSeconds(3600))),
                detail(backward, Stage.INTERVIEW_STAGE, Outcome.REJECTED,
                        round(InterviewType.SYSTEM_DESIGN, T0), round(InterviewType.TECHNICAL_PHONE_SCREEN, T0.plusSeconds(3600)))));

        MetricsResponse response = metricsService.getMetrics(1L);

        assertThat(linkValue(response, "RECRUITER_PHONE_SCREEN", "HIRING_MANAGER_SCREEN")).isEqualTo(1);
        assertThat(linkValue(response, "HIRING_MANAGER_SCREEN", "TAKE_HOME_ASSIGNMENT")).isEqualTo(1);
        assertThat(linkValue(response, "TAKE_HOME_ASSIGNMENT", "TECHNICAL_CODE_REVIEW")).isEqualTo(1);
        assertThat(linkValue(response, "TECHNICAL_CODE_REVIEW", "SYSTEM_DESIGN")).isEqualTo(1);
        assertThat(linkValue(response, "SYSTEM_DESIGN", "CULTURE_FIT")).isEqualTo(1);
        assertThat(linkValue(response, "CULTURE_FIT", "SYSTEM_DESIGN")).isEqualTo(0);
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

    // A paused job waiting on a verdict was drawn as In Progress, which reads as still moving.
    @Test
    void aPausedJobEndsAtPausedNotInProgress() {
        User owner = new User("paula", "hash");
        Job paused = newJob(owner, SourceCategory.SELF_APPLIED, Stage.WAITING_INTERVIEW_RESULTS, Outcome.PAUSED);
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(paused));
        when(jobDetails.findJourneysByOwnerId(1L)).thenReturn(List.of(
                detail(paused, Stage.WAITING_INTERVIEW_RESULTS, Outcome.PAUSED, round(InterviewType.CULTURE_FIT, T0))));

        MetricsResponse response = metricsService.getMetrics(1L);

        assertThat(linkValue(response, "CULTURE_FIT", "PAUSED")).isEqualTo(1);
        assertThat(response.sankeyLinks()).extracting(SankeyLink::target).doesNotContain("IN_PROGRESS");
    }

    // In Progress means still moving, so it's for active jobs alone; every other outcome ends at a node of its own.
    @Test
    void onlyAnActiveJobEndsInProgressAndEveryOtherOutcomeEndsAtItsOwnNode() {
        User owner = new User("olga", "hash");
        for (Outcome outcome : Outcome.values()) {
            Stage stage = outcome == Outcome.OFFER_ACCEPTED || outcome == Outcome.OFFER_DECLINED
                    ? Stage.OFFER_STAGE : Stage.INTERVIEW_STAGE;
            Job job = newJob(owner, SourceCategory.SELF_APPLIED, stage, outcome);
            when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(job));
            when(jobDetails.findJourneysByOwnerId(1L)).thenReturn(List.of(detail(job, stage, outcome)));

            MetricsResponse response = metricsService.getMetrics(1L);

            List<String> targets = response.sankeyLinks().stream().map(SankeyLink::target).toList();
            assertThat(targets.contains("IN_PROGRESS")).as("%s in progress", outcome).isEqualTo(outcome == Outcome.ACTIVE);
            assertThat(response.sankeyNodeOrder()).as("%s ordered", outcome).containsAll(targets);
        }
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
        assertThat(companiesAt(response, "IN_PROGRESS"))
                .containsOnly(entry("Acme", 1), entry("Globex", 1));
    }

    @Test
    void everyPipelineClosingOutcomeGetsItsOwnSankeyTerminal() {
        User owner = new User("nadia", "hash");
        SourceCategory source = SourceCategory.SELF_APPLIED;
        for (Outcome outcome : Arrays.stream(Outcome.values()).filter(Outcome::closesPipeline).toList()) {
            Job job = newJob(owner, source, Stage.RESUME_CHECK, outcome, "Acme");
            when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(job));
            when(jobDetails.findJourneysByOwnerId(1L)).thenReturn(List.of(detail(job, Stage.RESUME_CHECK, outcome)));

            MetricsResponse response = metricsService.getMetrics(1L);

            assertThat(linkValue(response, "RESUME_CHECK", outcome.name()))
                    .as("%s terminates its own path", outcome)
                    .isEqualTo(1);
        }
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
    void aRoundFollowedByAnotherCountsAsPassedAndTheLastRoundOfARejectedJobDoesNot() {
        User owner = new User("ivan", "hash");
        SourceCategory source = SourceCategory.SELF_APPLIED;
        Job job = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.REJECTED);
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(job));
        when(jobDetails.findJourneysByOwnerId(1L)).thenReturn(List.of(
                detail(job, Stage.INTERVIEW_STAGE, Outcome.REJECTED,
                        round(InterviewType.TECHNICAL_PHONE_SCREEN, T0),
                        round(InterviewType.SYSTEM_DESIGN, T0.plusSeconds(86400)))));

        MetricsResponse response = metricsService.getMetrics(1L);

        // The screen was passed: this job went on to a System Design round after it.
        assertThat(roundCountFor(response, InterviewType.TECHNICAL_PHONE_SCREEN).passed()).isEqualTo(1);
        assertThat(roundCountFor(response, InterviewType.TECHNICAL_PHONE_SCREEN).notPassed()).isZero();
        // The job stopped on System Design, so the rejection lands there.
        assertThat(roundCountFor(response, InterviewType.SYSTEM_DESIGN).passed()).isZero();
        assertThat(roundCountFor(response, InterviewType.SYSTEM_DESIGN).notPassed()).isEqualTo(1);
    }

    // Being invited back is the pass, and a booked onsite is that invitation before it's held.
    @Test
    void aRoundFollowedByOneStillBookedCountsAsPassed() {
        User owner = new User("pia", "hash");
        Job job = newJob(owner, SourceCategory.SELF_APPLIED, Stage.INTERVIEW_STAGE, Outcome.ACTIVE);
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(job));
        when(jobDetails.findJourneysByOwnerId(1L)).thenReturn(List.of(
                detail(job, Stage.INTERVIEW_STAGE, Outcome.ACTIVE,
                        round(InterviewType.TECHNICAL_PHONE_SCREEN, T0),
                        round(InterviewType.SYSTEM_DESIGN, NOW.plus(Duration.ofDays(1))))));

        MetricsResponse response = metricsService.getMetrics(1L);

        assertThat(roundCountFor(response, InterviewType.TECHNICAL_PHONE_SCREEN).passed()).isEqualTo(1);
        assertThat(roundCountFor(response, InterviewType.SYSTEM_DESIGN).count()).isZero();
    }

    // A round still booked hasn't been faced; a job rejected before it happened stopped at the one before.
    @Test
    void aRoundNotYetHeldIsNotCountedAndTheRoundBeforeItCarriesTheRejection() {
        User owner = new User("olga", "hash");
        Job job = newJob(owner, SourceCategory.SELF_APPLIED, Stage.INTERVIEW_STAGE, Outcome.REJECTED);
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(job));
        when(jobDetails.findJourneysByOwnerId(1L)).thenReturn(List.of(
                detail(job, Stage.INTERVIEW_STAGE, Outcome.REJECTED,
                        round(InterviewType.TECHNICAL_PHONE_SCREEN, T0),
                        round(InterviewType.SYSTEM_DESIGN, NOW.plus(Duration.ofDays(1))))));

        MetricsResponse response = metricsService.getMetrics(1L);

        assertThat(roundCountFor(response, InterviewType.SYSTEM_DESIGN).count()).isZero();
        assertThat(roundCountFor(response, InterviewType.TECHNICAL_PHONE_SCREEN).passed()).isZero();
        assertThat(roundCountFor(response, InterviewType.TECHNICAL_PHONE_SCREEN).notPassed()).isEqualTo(1);
    }

    @Test
    void chronologyDecidesWhichRoundIsLastRatherThanTheStoredOrder() {
        User owner = new User("judy", "hash");
        SourceCategory source = SourceCategory.SELF_APPLIED;
        Job job = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.REJECTED);
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(job));
        // Stored newest-first, so a fix that trusted list order would blame the wrong round.
        when(jobDetails.findJourneysByOwnerId(1L)).thenReturn(List.of(
                detail(job, Stage.INTERVIEW_STAGE, Outcome.REJECTED,
                        round(InterviewType.SYSTEM_DESIGN, T0.plusSeconds(86400)),
                        round(InterviewType.TECHNICAL_PHONE_SCREEN, T0))));

        MetricsResponse response = metricsService.getMetrics(1L);

        assertThat(roundCountFor(response, InterviewType.SYSTEM_DESIGN).notPassed()).isEqualTo(1);
        assertThat(roundCountFor(response, InterviewType.TECHNICAL_PHONE_SCREEN).passed()).isEqualTo(1);
    }

    @Test
    void anOutcomeThatSaysNothingAboutThePerformanceLeavesTheRoundUnjudged() {
        User owner = new User("karl", "hash");
        SourceCategory source = SourceCategory.SELF_APPLIED;
        // Walking away or the req closing is not a round the candidate failed, and an open pipeline
        // has not judged it yet.
        for (Outcome outcome : List.of(Outcome.WITHDRAWN, Outcome.POSITION_CLOSED, Outcome.ACTIVE)) {
            nextJobId.set(0);
            Job job = newJob(owner, source, Stage.INTERVIEW_STAGE, outcome);
            when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(job));
            when(jobDetails.findJourneysByOwnerId(1L)).thenReturn(List.of(
                    detail(job, Stage.INTERVIEW_STAGE, outcome, round(InterviewType.SYSTEM_DESIGN))));

            MetricsResponse response = metricsService.getMetrics(1L);

            assertThat(roundCountFor(response, InterviewType.SYSTEM_DESIGN).count()).isEqualTo(1);
            assertThat(roundCountFor(response, InterviewType.SYSTEM_DESIGN).passed())
                    .describedAs("passed for %s", outcome).isZero();
            assertThat(roundCountFor(response, InterviewType.SYSTEM_DESIGN).notPassed())
                    .describedAs("notPassed for %s", outcome).isZero();
        }
    }

    @Test
    void reachingAnOfferPassesTheLastRound() {
        User owner = new User("lena", "hash");
        SourceCategory source = SourceCategory.SELF_APPLIED;
        Job job = newJob(owner, source, Stage.OFFER_STAGE, Outcome.OFFER_ACCEPTED);
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(job));
        when(jobDetails.findJourneysByOwnerId(1L)).thenReturn(List.of(
                detail(job, Stage.OFFER_STAGE, Outcome.OFFER_ACCEPTED, round(InterviewType.BEHAVIOR))));

        assertThat(roundCountFor(metricsService.getMetrics(1L), InterviewType.BEHAVIOR).passed()).isEqualTo(1);
    }

    @Test
    void aGhostedJobCountsItsLastRoundAsNotPassed() {
        User owner = new User("mona", "hash");
        SourceCategory source = SourceCategory.SELF_APPLIED;
        Job job = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.GHOSTED);
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(job));
        when(jobDetails.findJourneysByOwnerId(1L)).thenReturn(List.of(
                detail(job, Stage.INTERVIEW_STAGE, Outcome.GHOSTED, round(InterviewType.CULTURE_FIT))));

        assertThat(roundCountFor(metricsService.getMetrics(1L), InterviewType.CULTURE_FIT).notPassed()).isEqualTo(1);
    }

    @Test
    void eachRoundNumberNamesTheJobsBehindIt() {
        User owner = new User("nina", "hash");
        SourceCategory source = SourceCategory.SELF_APPLIED;
        Job lost = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.REJECTED, "Globex");
        Job won = newJob(owner, source, Stage.OFFER_STAGE, Outcome.OFFER_ACCEPTED, "Acme Co");
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(lost, won));
        when(jobDetails.findJourneysByOwnerId(1L)).thenReturn(List.of(
                detail(lost, Stage.INTERVIEW_STAGE, Outcome.REJECTED, round(InterviewType.SYSTEM_DESIGN)),
                detail(won, Stage.OFFER_STAGE, Outcome.OFFER_ACCEPTED, round(InterviewType.SYSTEM_DESIGN))));

        InterviewRoundCount design = roundCountFor(metricsService.getMetrics(1L), InterviewType.SYSTEM_DESIGN);

        assertThat(design.notPassedJobs()).extracting(RoundJobRef::company).containsExactly("Globex");
        assertThat(design.passedJobs()).extracting(RoundJobRef::company).containsExactly("Acme Co");
        assertThat(design.passedJobs()).extracting(RoundJobRef::role).containsExactly("Engineer");
        // The id is what lets the page link back to the row.
        assertThat(design.notPassedJobs().get(0).jobId()).isEqualTo(lost.getId());
    }

    @Test
    void twoRoundsOfOneTypeAtOneJobReadAsOneApplication() {
        User owner = new User("omar", "hash");
        SourceCategory source = SourceCategory.SELF_APPLIED;
        Job job = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.ACTIVE, "Globex");
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(job));
        // Two system designs, the first passed because a second followed it.
        when(jobDetails.findJourneysByOwnerId(1L)).thenReturn(List.of(
                detail(job, Stage.INTERVIEW_STAGE, Outcome.ACTIVE,
                        round(InterviewType.SYSTEM_DESIGN, T0),
                        round(InterviewType.SYSTEM_DESIGN, T0.plusSeconds(86400)))));

        InterviewRoundCount design = roundCountFor(metricsService.getMetrics(1L), InterviewType.SYSTEM_DESIGN);

        assertThat(design.count()).isEqualTo(2);
        assertThat(design.passedJobs()).hasSize(1);
        assertThat(design.passedJobs().get(0).times()).isEqualTo(1);
    }

    @Test
    void aPanelCountsOnceAndItsRejectionIsKnownAtThatLevel() {
        User owner = new User("pia", "hash");
        SourceCategory source = SourceCategory.SELF_APPLIED;
        Job job = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.REJECTED, "Globex");
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(job));
        when(jobDetails.findJourneysByOwnerId(1L)).thenReturn(List.of(
                detail(job, Stage.INTERVIEW_STAGE, Outcome.REJECTED,
                        round(InterviewType.PANEL_CODING, T0),
                        round(InterviewType.PANEL_SYSTEM_DESIGN, T0.plusSeconds(5400)),
                        round(InterviewType.PANEL_BEHAVIOR, T0.plusSeconds(10800)))));

        InterviewRoundCount panel = roundCountFor(metricsService.getMetrics(1L), "PANEL");

        // One panel faced, one panel lost, which is the level the result is actually known at.
        assertThat(panel.count()).isEqualTo(1);
        assertThat(panel.notPassed()).isEqualTo(1);
        assertThat(panel.passed()).isZero();
        // What this company's panel held is still recorded, just not judged interview by interview.
        assertThat(panel.notPassedJobs()).singleElement()
                .extracting(RoundJobRef::components, list(InterviewType.class))
                .containsExactly(InterviewType.PANEL_CODING, InterviewType.PANEL_SYSTEM_DESIGN,
                        InterviewType.PANEL_BEHAVIOR);
    }

    @Test
    void aPanelSplitAcrossDaysIsStillOnePanel() {
        User owner = new User("sara", "hash");
        SourceCategory source = SourceCategory.SELF_APPLIED;
        Job job = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.REJECTED, "Globex");
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(job));
        // Three slots Tuesday, three Thursday, one rejection. No decision was made in between, so a
        // calendar gap must not read as the employer inviting the candidate back.
        long day = 86400;
        when(jobDetails.findJourneysByOwnerId(1L)).thenReturn(List.of(
                detail(job, Stage.INTERVIEW_STAGE, Outcome.REJECTED,
                        round(InterviewType.PANEL_CODING, T0),
                        round(InterviewType.PANEL_SYSTEM_DESIGN, T0.plusSeconds(5400)),
                        round(InterviewType.PANEL_BEHAVIOR, T0.plusSeconds(10800)),
                        round(InterviewType.PANEL_HIRING_MANAGER_CHAT, T0.plusSeconds(2 * day)),
                        round(InterviewType.PANEL_PRODUCT_XFN, T0.plusSeconds(2 * day + 5400)),
                        round(InterviewType.PANEL_VALUES, T0.plusSeconds(2 * day + 10800)))));

        InterviewRoundCount panel = roundCountFor(metricsService.getMetrics(1L), "PANEL");

        assertThat(panel.count()).isEqualTo(1);
        assertThat(panel.notPassed()).isEqualTo(1);
        assertThat(panel.notPassedJobs()).singleElement()
                .extracting(RoundJobRef::components, list(InterviewType.class)).hasSize(6);
    }

    @Test
    void aPanelThatConvertsCountsAsOnePass() {
        User owner = new User("quinn", "hash");
        SourceCategory source = SourceCategory.SELF_APPLIED;
        Job job = newJob(owner, source, Stage.OFFER_STAGE, Outcome.OFFER_ACCEPTED, "Acme Co");
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(job));
        when(jobDetails.findJourneysByOwnerId(1L)).thenReturn(List.of(
                detail(job, Stage.OFFER_STAGE, Outcome.OFFER_ACCEPTED,
                        round(InterviewType.PANEL_CODING, T0),
                        round(InterviewType.PANEL_BEHAVIOR, T0.plusSeconds(5400)))));

        InterviewRoundCount panel = roundCountFor(metricsService.getMetrics(1L), "PANEL");

        assertThat(panel.count()).isEqualTo(1);
        assertThat(panel.passed()).isEqualTo(1);
    }

    @Test
    void panelsAcrossJobsAggregateIntoOnePassRate() {
        User owner = new User("uma", "hash");
        SourceCategory source = SourceCategory.SELF_APPLIED;
        Job won = newJob(owner, source, Stage.OFFER_STAGE, Outcome.OFFER_ACCEPTED, "Acme Co");
        Job lost = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.REJECTED, "Globex");
        Job alsoLost = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.REJECTED, "Beta");
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(won, lost, alsoLost));
        when(jobDetails.findJourneysByOwnerId(1L)).thenReturn(List.of(
                detail(won, Stage.OFFER_STAGE, Outcome.OFFER_ACCEPTED,
                        round(InterviewType.PANEL_CODING, T0), round(InterviewType.PANEL_BEHAVIOR, T0.plusSeconds(5400))),
                detail(lost, Stage.INTERVIEW_STAGE, Outcome.REJECTED,
                        round(InterviewType.PANEL_CODING, T0), round(InterviewType.PANEL_SYSTEM_DESIGN, T0.plusSeconds(5400))),
                detail(alsoLost, Stage.INTERVIEW_STAGE, Outcome.REJECTED,
                        round(InterviewType.PANEL_CODING, T0), round(InterviewType.PANEL_VALUES, T0.plusSeconds(5400)))));

        InterviewRoundCount panel = roundCountFor(metricsService.getMetrics(1L), "PANEL");

        // Three panels faced, one converted: the number the breakdown could never give.
        assertThat(panel.count()).isEqualTo(3);
        assertThat(panel.passed()).isEqualTo(1);
        assertThat(panel.notPassed()).isEqualTo(2);
        assertThat(panel.notPassedJobs()).extracting(RoundJobRef::company)
                .containsExactlyInAnyOrder("Globex", "Beta");
    }

    @Test
    void aRoundBeforeASplitPanelStillCountsAsPassed() {
        User owner = new User("tom", "hash");
        SourceCategory source = SourceCategory.SELF_APPLIED;
        Job job = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.REJECTED, "Globex");
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(job));
        long day = 86400;
        when(jobDetails.findJourneysByOwnerId(1L)).thenReturn(List.of(
                detail(job, Stage.INTERVIEW_STAGE, Outcome.REJECTED,
                        round(InterviewType.TECHNICAL_PHONE_SCREEN, T0),
                        round(InterviewType.PANEL_CODING, T0.plusSeconds(7 * day)),
                        round(InterviewType.PANEL_BEHAVIOR, T0.plusSeconds(9 * day)))));

        MetricsResponse response = metricsService.getMetrics(1L);

        // The screen is not a panel round, so the panel starting after it is a separate decision.
        assertThat(roundCountFor(response, InterviewType.TECHNICAL_PHONE_SCREEN).passed()).isEqualTo(1);
        assertThat(roundCountFor(response, "PANEL").notPassed()).isEqualTo(1);
    }

    // Non-panel rounds under 12 hours apart are one visit and share the visit's verdict; any further
    // apart, the earlier one was a separate step that the candidate got through.
    @Test
    void roundsAreOneVisitOnlyWhenUnderTwelveHoursApart() {
        record Gap(long hours, long systemDesignPassed, long systemDesignNotPassed) {
        }
        for (Gap gap : List.of(new Gap(11, 0, 1), new Gap(13, 1, 0))) {
            User owner = new User("quinn", "hash");
            Job job = newJob(owner, SourceCategory.SELF_APPLIED, Stage.INTERVIEW_STAGE, Outcome.REJECTED, "Acme Co");
            when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(job));
            when(jobDetails.findJourneysByOwnerId(1L)).thenReturn(List.of(
                    detail(job, Stage.INTERVIEW_STAGE, Outcome.REJECTED,
                            round(InterviewType.SYSTEM_DESIGN, T0),
                            round(InterviewType.BEHAVIOR, T0.plus(Duration.ofHours(gap.hours()))))));

            InterviewRoundCount systemDesign = roundCountFor(metricsService.getMetrics(1L), InterviewType.SYSTEM_DESIGN);

            assertThat(systemDesign.passed()).as("%dh apart, passed", gap.hours()).isEqualTo(gap.systemDesignPassed());
            assertThat(systemDesign.notPassed()).as("%dh apart, not passed", gap.hours()).isEqualTo(gap.systemDesignNotPassed());
        }
    }

    @Test
    void aRoundOnAnEarlierDayStillCountsAsPassedWhenAPanelFollowsIt() {
        User owner = new User("raj", "hash");
        SourceCategory source = SourceCategory.SELF_APPLIED;
        Job job = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.REJECTED, "Globex");
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(job));
        when(jobDetails.findJourneysByOwnerId(1L)).thenReturn(List.of(
                detail(job, Stage.INTERVIEW_STAGE, Outcome.REJECTED,
                        round(InterviewType.TECHNICAL_PHONE_SCREEN, T0),
                        round(InterviewType.PANEL_CODING, T0.plusSeconds(604800)),
                        round(InterviewType.PANEL_SYSTEM_DESIGN, T0.plusSeconds(610200)))));

        MetricsResponse response = metricsService.getMetrics(1L);

        // Being invited back a week later is a real decision, so the screen keeps its pass.
        assertThat(roundCountFor(response, InterviewType.TECHNICAL_PHONE_SCREEN).passed()).isEqualTo(1);
        assertThat(roundCountFor(response, "PANEL").notPassed()).isEqualTo(1);
    }

    @Test
    void eachRouteNamesTheCompaniesOnItSoAStageListsOnlyThoseThatReachedIt() {
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

        assertThat(companiesAt(response, "RESUME_CHECK"))
                .containsOnly(entry("Acme", 1), entry("Globex", 1));
        assertThat(companiesAt(response, "INTERVIEW_REQUEST"))
                .containsOnly(entry("Acme", 1), entry("Globex", 1));
        assertThat(companiesAt(response, "SYSTEM_DESIGN"))
                .containsOnly(entry("Acme", 1));
        assertThat(companiesAt(response, "REJECTED"))
                .containsOnly(entry("Acme", 1), entry("Globex", 1));
        // Two routes, one job each, so hovering a route narrows the list to its own job.
        assertThat(response.sankeyPaths()).extracting(path -> path.applications().get(0).jobId())
                .containsExactlyInAnyOrder(acme.getId(), globex.getId());
    }

    @Test
    void twoJobsAtOneCompanyStayTwoApplicationsOnTheirRoute() {
        User owner = new User("judy", "hash");
        SourceCategory source = SourceCategory.SELF_APPLIED;
        // Two jobs at the same company must stay two, each with its own id to pick it out by.
        Job cortexOne = newJob(owner, source, Stage.RESUME_CHECK, Outcome.REJECTED, "Cortex");
        Job cortexTwo = newJob(owner, source, Stage.RESUME_CHECK, Outcome.REJECTED, "Cortex");
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(cortexOne, cortexTwo));
        when(jobDetails.findJourneysByOwnerId(1L)).thenReturn(List.of(
                detail(cortexOne, Stage.RESUME_CHECK, Outcome.REJECTED),
                detail(cortexTwo, Stage.RESUME_CHECK, Outcome.REJECTED)));

        MetricsResponse response = metricsService.getMetrics(1L);

        assertThat(response.sankeyPaths()).singleElement().satisfies(path -> {
            assertThat(path.jobs()).isEqualTo(2);
            assertThat(path.applications()).extracting(SankeyPath.Application::jobId)
                    .containsExactlyInAnyOrder(cortexOne.getId(), cortexTwo.getId());
            assertThat(path.applications()).extracting(SankeyPath.Application::company).containsOnly("Cortex");
        });
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

    private InterviewRoundCount roundCountFor(MetricsResponse response, InterviewType type) {
        return roundCountFor(response, type.isPanel() ? "PANEL" : type.name());
    }

    private InterviewRoundCount roundCountFor(MetricsResponse response, String node) {
        return response.interviewRoundCounts().stream()
                .filter(r -> r.roundNode().equals(node))
                .findFirst()
                .orElseThrow();
    }

    private long interviewRoundCountFor(MetricsResponse response, InterviewType type) {
        return roundCountFor(response, type).count();
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

    // What the page lists for a stage: the companies on every route through it.
    private Map<String, Integer> companiesAt(MetricsResponse response, String node) {
        Map<String, Integer> companies = new HashMap<>();
        response.sankeyPaths().stream()
                .filter(path -> path.nodes().contains(node))
                .flatMap(path -> path.applications().stream())
                .forEach(application -> companies.merge(application.company(), 1, Integer::sum));
        return companies;
    }
}
