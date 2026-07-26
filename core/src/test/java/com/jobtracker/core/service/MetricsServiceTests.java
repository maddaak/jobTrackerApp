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

import java.time.Instant;
import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

class MetricsServiceTests {

    @Mock
    private JobRepository jobs;

    @Mock
    private StageEventRepository stageEvents;

    private MetricsService metricsService;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        metricsService = new MetricsService(jobs, stageEvents);
    }

    private Job newJob(User owner, Source source, Stage stage, Outcome outcome) {
        Job job = new Job("Acme", "Engineer", owner, source, null, null, null, null, null);
        job.applyUpdate("Acme", "Engineer", null, null, null, null, null, null, stage, outcome);
        return job;
    }

    private StageEvent newInterviewRound(Job job, InterviewType type) {
        StageEvent event = new StageEvent(job, Stage.INTERVIEW_STAGE, Instant.now(), null);
        event.applyInterviewDetails(Instant.now(), type, null, null, Collections.emptyList());
        return event;
    }

    @Test
    void funnelCountsJobsThatReachedEachStageOrFurther() {
        User owner = new User("alice", "hash");
        Source source = new Source(SourceCategory.SELF_APPLIED);
        Job resumeCheck = newJob(owner, source, Stage.RESUME_CHECK, Outcome.ACTIVE);
        Job interviewStage = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.ACTIVE);
        Job offerExtended = newJob(owner, source, Stage.OFFER_EXTENDED, Outcome.REJECTED);
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(resumeCheck, interviewStage, offerExtended));

        MetricsResponse response = metricsService.getMetrics(1L);

        assertThat(countFor(response, Stage.RESUME_CHECK)).isEqualTo(3);
        assertThat(countFor(response, Stage.INTERVIEW_STAGE)).isEqualTo(2);
        assertThat(countFor(response, Stage.OFFER_EXTENDED)).isEqualTo(1);
        assertThat(countFor(response, Stage.NEGOTIATION)).isEqualTo(0);
    }

    @Test
    void sankeyLinksFollowFurthestStageReachedPlusTerminalOutcome() {
        User owner = new User("bob", "hash");
        Source source = new Source(SourceCategory.SELF_APPLIED);
        Job interviewStage = newJob(owner, source, Stage.INTERVIEW_STAGE, Outcome.ACTIVE);
        Job offerExtended = newJob(owner, source, Stage.OFFER_EXTENDED, Outcome.REJECTED);
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(interviewStage, offerExtended));

        MetricsResponse response = metricsService.getMetrics(1L);

        assertThat(linkValue(response, "RESUME_CHECK", "RECRUITER_CHAT_INVITE")).isEqualTo(2);
        assertThat(linkValue(response, "INTERVIEW_SCHEDULING", "INTERVIEW_STAGE")).isEqualTo(2);
        assertThat(linkValue(response, "INTERVIEW_STAGE", "WAITING_INTERVIEW_RESULTS")).isEqualTo(1);
        assertThat(linkValue(response, "OFFER_EXTENDED", "REJECTED")).isEqualTo(1);
        assertThat(linkValue(response, "OFFER_EXTENDED", "OFFER_DECLINED")).isEqualTo(0);
    }

    @Test
    void activeJobStillAtResumeCheckProducesNoLinks() {
        User owner = new User("carol", "hash");
        Source source = new Source(SourceCategory.SELF_APPLIED);
        Job resumeCheck = newJob(owner, source, Stage.RESUME_CHECK, Outcome.ACTIVE);
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(resumeCheck));

        MetricsResponse response = metricsService.getMetrics(1L);

        assertThat(response.sankeyLinks()).isEmpty();
    }

    @Test
    void outcomeCountsExcludeActiveAndCountEachTerminalOutcome() {
        User owner = new User("erin", "hash");
        Source source = new Source(SourceCategory.SELF_APPLIED);
        Job rejected = newJob(owner, source, Stage.OFFER_EXTENDED, Outcome.REJECTED);
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
        when(stageEvents.findByJob_Owner_IdAndInterviewDateTimeIsNotNull(1L)).thenReturn(List.of(
                newInterviewRound(job, InterviewType.TECHNICAL_PHONE_SCREEN),
                newInterviewRound(job, InterviewType.SYSTEM_DESIGN),
                newInterviewRound(job, InterviewType.SYSTEM_DESIGN)));

        MetricsResponse response = metricsService.getMetrics(1L);

        assertThat(interviewRoundCountFor(response, InterviewType.TECHNICAL_PHONE_SCREEN)).isEqualTo(1);
        assertThat(interviewRoundCountFor(response, InterviewType.SYSTEM_DESIGN)).isEqualTo(2);
        assertThat(interviewRoundCountFor(response, InterviewType.BEHAVIOR)).isEqualTo(0);
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
