package com.jobtracker.core.service;

import com.jobtracker.core.dto.FunnelStageCount;
import com.jobtracker.core.dto.MetricsResponse;
import com.jobtracker.core.dto.OutcomeCount;
import com.jobtracker.core.dto.SankeyLink;
import com.jobtracker.core.model.*;
import com.jobtracker.core.repository.JobDetailRepository;
import com.jobtracker.core.repository.JobImageRepository;
import com.jobtracker.core.repository.JobRepository;
import com.jobtracker.core.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

// The real deletion then the real metrics over its result: the only way to see the two stores agree.
class StageDeletionMetricsTests {

    private static final Long OWNER = 1L;
    private static final Long JOB_ID = 7L;
    private static final Instant RESUME_AT = Instant.parse("2026-08-25T23:00:00Z");
    private static final Instant REQUEST_AT = Instant.parse("2026-08-26T20:24:00Z");
    private static final Instant MISCLICK_AT = Instant.parse("2026-08-26T20:24:30Z");
    private static final Instant BACK_AT = Instant.parse("2026-08-26T20:25:00Z");

    @Mock
    private JobRepository jobs;

    @Mock
    private JobDetailRepository jobDetails;

    @Mock
    private UserRepository users;

    @Mock
    private JobImageRepository jobImages;

    private JobService jobService;
    private MetricsService metricsService;

    private Job job;
    private JobDetail detail;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        JobLinkService jobLinkService = new JobLinkService(jobs, jobDetails);
        jobService = new JobService(jobs, users, jobDetails,
                new JobDetailService(jobs, jobDetails, jobLinkService), jobLinkService, new JobImageService(jobs, jobImages));
        metricsService = new MetricsService(jobs, jobDetails);
    }

    // Mis-click: forward to Interview Stage, then straight back to Interview Request.
    private void givenJobWithMisclick(Stage currentStage, Outcome outcome) {
        User owner = new User("alice", "hash");
        ReflectionTestUtils.setField(owner, "id", OWNER);
        job = new Job("Globex", "Detection Engineer", owner, SourceCategory.SELF_APPLIED,
                null, null, null, null);
        ReflectionTestUtils.setField(job, "id", JOB_ID);
        ReflectionTestUtils.setField(job, "currentStage", currentStage);
        ReflectionTestUtils.setField(job, "outcome", outcome);

        detail = new JobDetail(JOB_ID, OWNER, new byte[0], "");
        detail.recordStage(Stage.RESUME_CHECK, RESUME_AT, null);
        detail.recordStage(Stage.INTERVIEW_REQUEST, REQUEST_AT, null);
        detail.recordStage(Stage.INTERVIEW_STAGE, MISCLICK_AT, null);
        detail.recordStage(Stage.INTERVIEW_REQUEST, BACK_AT, null);

        // Answers, not fixed returns: metrics has to observe whatever the deletion left behind.
        when(jobs.findByIdAndOwnerId(JOB_ID, OWNER)).thenReturn(Optional.of(job));
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(OWNER)).thenAnswer(i -> List.of(job));
        when(jobs.save(any(Job.class))).thenAnswer(i -> i.getArgument(0));
        when(jobDetails.findByJobId(JOB_ID)).thenReturn(Optional.of(detail));
        when(jobDetails.save(any(JobDetail.class))).thenAnswer(i -> i.getArgument(0));
        when(jobDetails.findJourneysByOwnerId(OWNER)).thenAnswer(i -> List.of(new JobJourney(
                detail.getJobId(), detail.getStageHistory(), detail.getInterviews(), detail.getRelatedJobs())));
    }

    private long funnelCount(MetricsResponse response, Stage stage) {
        return response.funnel().stream()
                .filter(entry -> entry.stage() == stage)
                .mapToLong(FunnelStageCount::count)
                .findFirst()
                .orElse(0);
    }

    private long outcomeCount(MetricsResponse response, Outcome outcome) {
        return response.outcomeCounts().stream()
                .filter(entry -> entry.outcome() == outcome)
                .mapToLong(OutcomeCount::count)
                .findFirst()
                .orElse(0);
    }

    @Test
    void theFunnelStopsCountingAStageOnceItsOnlyEntryIsDeleted() {
        givenJobWithMisclick(Stage.INTERVIEW_STAGE, Outcome.ACTIVE);
        assertThat(funnelCount(metricsService.getMetrics(OWNER), Stage.INTERVIEW_STAGE))
                .as("the mis-click counts while it is still recorded")
                .isEqualTo(1);

        jobService.deleteStageEvent(OWNER, JOB_ID, MISCLICK_AT, Stage.INTERVIEW_STAGE);

        MetricsResponse after = metricsService.getMetrics(OWNER);
        assertThat(funnelCount(after, Stage.INTERVIEW_STAGE)).isZero();
        // The stages it really reached are untouched, so the job is corrected, not erased.
        assertThat(funnelCount(after, Stage.RESUME_CHECK)).isEqualTo(1);
        assertThat(funnelCount(after, Stage.INTERVIEW_REQUEST)).isEqualTo(1);
    }

    @Test
    void deletingAStageEntryLeavesTheOutcomeCountsAlone() {
        givenJobWithMisclick(Stage.INTERVIEW_STAGE, Outcome.ACTIVE);

        jobService.deleteStageEvent(OWNER, JOB_ID, MISCLICK_AT, Stage.INTERVIEW_STAGE);

        MetricsResponse after = metricsService.getMetrics(OWNER);
        assertThat(outcomeCount(after, Outcome.REJECTED)).isZero();
        assertThat(after.outcomeCounts()).allSatisfy(entry -> assertThat(entry.count()).isZero());
    }

    @Test
    void everyJobStillReachesExactlyOneSankeyTerminalAfterADeletion() {
        givenJobWithMisclick(Stage.INTERVIEW_STAGE, Outcome.ACTIVE);

        jobService.deleteStageEvent(OWNER, JOB_ID, MISCLICK_AT, Stage.INTERVIEW_STAGE);

        MetricsResponse after = metricsService.getMetrics(OWNER);
        long fromResumeCheck = after.sankeyLinks().stream()
                .filter(link -> link.source().equals(Stage.RESUME_CHECK.name()))
                .mapToLong(SankeyLink::value)
                .sum();
        // The chart's invariant: node totals equal job counts, so no job is stranded or counted twice.
        assertThat(fromResumeCheck).isEqualTo(1);
        assertThat(after.sankeyLinks()).noneMatch(link -> link.source().equals(Stage.INTERVIEW_STAGE.name())
                || link.target().equals(Stage.INTERVIEW_STAGE.name()));
    }

    @Test
    void deletingAnEntryBelowTheJobsCurrentStageDoesNotMoveTheFunnel() {
        givenJobWithMisclick(Stage.INTERVIEW_STAGE, Outcome.ACTIVE);
        ReflectionTestUtils.setField(job, "currentStage", Stage.OFFER_STAGE);
        detail.recordStage(Stage.OFFER_STAGE, Instant.parse("2026-08-27T10:00:00Z"), null);

        jobService.deleteStageEvent(OWNER, JOB_ID, REQUEST_AT, Stage.INTERVIEW_REQUEST);

        // The funnel is cumulative, so a job at Offer Stage still counts at every stage below it.
        MetricsResponse after = metricsService.getMetrics(OWNER);
        assertThat(funnelCount(after, Stage.OFFER_STAGE)).isEqualTo(1);
        assertThat(funnelCount(after, Stage.INTERVIEW_REQUEST)).isEqualTo(1);
        assertThat(job.getCurrentStage())
                .as("deleting an older entry must not rewind a job that moved on since")
                .isEqualTo(Stage.OFFER_STAGE);
    }

    // Pins a known asymmetry rather than endorsing it: rounds are recorded separately from stages.
    @Test
    void aDeletedStageDoesNotRemoveInterviewRoundsFromTheSankey() {
        givenJobWithMisclick(Stage.INTERVIEW_STAGE, Outcome.ACTIVE);
        detail.addInterview(new InterviewRound(Instant.parse("2026-08-26T20:24:40Z"),
                InterviewType.SYSTEM_DESIGN, null, null, List.of()));

        jobService.deleteStageEvent(OWNER, JOB_ID, MISCLICK_AT, Stage.INTERVIEW_STAGE);

        MetricsResponse after = metricsService.getMetrics(OWNER);
        assertThat(funnelCount(after, Stage.INTERVIEW_STAGE))
                .as("the funnel follows the stage the user rewound to")
                .isZero();
        assertThat(after.sankeyLinks())
                .as("the round still happened, so the chart still routes through it")
                .anyMatch(link -> link.target().equals(InterviewType.SYSTEM_DESIGN.name()));
    }

    @Test
    void aClosedJobKeepsItsTerminalAndStaysFinalizedAfterADeletion() {
        givenJobWithMisclick(Stage.FINALIZED, Outcome.REJECTED);
        detail.recordStage(Stage.FINALIZED, Instant.parse("2026-08-27T10:00:00Z"), null);

        jobService.deleteStageEvent(OWNER, JOB_ID, MISCLICK_AT, Stage.INTERVIEW_STAGE);

        assertThat(job.getCurrentStage()).isEqualTo(Stage.FINALIZED);
        MetricsResponse after = metricsService.getMetrics(OWNER);
        assertThat(outcomeCount(after, Outcome.REJECTED)).isEqualTo(1);
        assertThat(after.sankeyLinks()).anyMatch(link -> link.target().equals(Outcome.REJECTED.name()));
        // FINALIZED is excluded from "furthest reached", so the close never inflates the funnel.
        assertThat(funnelCount(after, Stage.INTERVIEW_STAGE)).isZero();
        assertThat(funnelCount(after, Stage.INTERVIEW_REQUEST)).isEqualTo(1);
    }
}
