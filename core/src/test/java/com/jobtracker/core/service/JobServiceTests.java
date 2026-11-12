package com.jobtracker.core.service;

import com.jobtracker.core.dto.CreateJobRequest;
import com.jobtracker.core.dto.JobDetailResponse;
import com.jobtracker.core.dto.JobSummaryResponse;
import com.jobtracker.core.dto.UpdateJobRequest;
import com.jobtracker.core.exception.InvalidStageHistoryException;
import com.jobtracker.core.exception.JobNotFoundException;
import com.jobtracker.core.exception.StageEntryNotFoundException;
import com.jobtracker.core.model.*;
import com.jobtracker.core.repository.JobDetailRepository;
import com.jobtracker.core.repository.JobRepository;
import com.jobtracker.core.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

class JobServiceTests {

    @Mock
    private JobRepository jobs;

    @Mock
    private UserRepository users;

    @Mock
    private JobDetailRepository jobDetailRepo;

    @Mock
    private JobDetailService jobDetailService;

    @Mock
    private JobImageService jobImageService;

    @Mock
    private SeasonService seasons;

    private JobService jobService;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        when(seasons.inView(any())).thenReturn(job -> true);
        jobService = new JobService(jobs, users, jobDetailRepo, jobDetailService, new JobLinkService(jobs, jobDetailRepo, seasons),
                jobImageService, seasons, Clock.systemUTC());
        // updateJob creates the document when one is missing, so a stage change never drops its entry.
        when(jobDetailService.createDetail(anyLong(), anyLong(), any()))
                .thenAnswer(i -> new JobDetail(i.getArgument(0), i.getArgument(1), new byte[0], ""));
    }

    // findJourneysByOwnerId returns the projection, not the whole document.
    private JobJourney journey(JobDetail detail) {
        return new JobJourney(detail.getJobId(), detail.getStageHistory(), detail.getInterviews(), detail.getRelatedJobs());
    }

    private Job job(User owner, SourceCategory source, String company, String role, Long id) {
        Job job = new Job(company, role, owner, source, null, null, null, null);
        ReflectionTestUtils.setField(job, "id", id);
        return job;
    }

    // The mis-click this undoes: forward to Interview Stage, then back.
    private JobDetail historyWithAMisclick(Job job) {
        JobDetail detail = new JobDetail(job.getId(), 1L, new byte[0], "");
        detail.recordStage(Stage.RESUME_CHECK, Instant.parse("2026-08-25T23:00:00Z"), null);
        detail.recordStage(Stage.INTERVIEW_REQUEST, Instant.parse("2026-08-26T20:24:00Z"), null);
        detail.recordStage(Stage.INTERVIEW_STAGE, Instant.parse("2026-08-26T20:24:30Z"), null);
        detail.recordStage(Stage.INTERVIEW_REQUEST, Instant.parse("2026-08-26T20:25:00Z"), null);
        return detail;
    }

    @Test
    void deleteStageEventDropsTheNamedEntryAndRewindsToWhatTheHistoryNowEndsOn() {
        User owner = new User("alice", "hash");
        Job job = job(owner, SourceCategory.SELF_APPLIED, "Globex", "Detection Engineer", 7L);
        ReflectionTestUtils.setField(job, "currentStage", Stage.INTERVIEW_STAGE);
        when(jobs.findByIdAndOwnerId(7L, 1L)).thenReturn(Optional.of(job));
        when(jobDetailRepo.findByJobId(7L)).thenReturn(Optional.of(historyWithAMisclick(job)));

        var remaining = jobService.deleteStageEvent(1L, 7L, Instant.parse("2026-08-26T20:24:30Z"), Stage.INTERVIEW_STAGE);

        assertThat(remaining).extracting("stage")
                .containsExactly(Stage.RESUME_CHECK, Stage.INTERVIEW_REQUEST, Stage.INTERVIEW_REQUEST);
        // The dropdown reads this, so it has to follow the trail rather than keep the deleted stage.
        assertThat(job.getCurrentStage()).isEqualTo(Stage.INTERVIEW_REQUEST);
        verify(jobs).save(job);
    }

    @Test
    void deleteStageEventKeepsAClosedJobFinalizedRatherThanRewindingIt() {
        User owner = new User("alice", "hash");
        Job job = job(owner, SourceCategory.SELF_APPLIED, "Globex", "Detection Engineer", 7L);
        ReflectionTestUtils.setField(job, "outcome", Outcome.REJECTED);
        ReflectionTestUtils.setField(job, "currentStage", Stage.FINALIZED);
        when(jobs.findByIdAndOwnerId(7L, 1L)).thenReturn(Optional.of(job));
        when(jobDetailRepo.findByJobId(7L)).thenReturn(Optional.of(historyWithAMisclick(job)));

        jobService.deleteStageEvent(1L, 7L, Instant.parse("2026-08-26T20:24:30Z"), Stage.INTERVIEW_STAGE);

        assertThat(job.getCurrentStage()).isEqualTo(Stage.FINALIZED);
    }

    @Test
    void deleteStageEventReportsAnEntryThatIsNoLongerThere() {
        // A stale modal must not be told the delete succeeded.
        User owner = new User("alice", "hash");
        Job job = job(owner, SourceCategory.SELF_APPLIED, "Globex", "Detection Engineer", 7L);
        when(jobs.findByIdAndOwnerId(7L, 1L)).thenReturn(Optional.of(job));
        when(jobDetailRepo.findByJobId(7L)).thenReturn(Optional.of(historyWithAMisclick(job)));

        assertThatThrownBy(() -> jobService.deleteStageEvent(1L, 7L, Instant.parse("2020-01-01T00:00:00Z"), null))
                .isInstanceOf(StageEntryNotFoundException.class);
        verify(jobDetailRepo, never()).save(any(JobDetail.class));
        verify(jobs, never()).save(any(Job.class));
    }

    @Test
    void deleteStageEventRemovesOneEntryWhenTwoShareATimestamp() {
        // Mongo stores milliseconds, so a migrated history can carry two entries at the same instant.
        User owner = new User("alice", "hash");
        Job job = job(owner, SourceCategory.SELF_APPLIED, "Globex", "Detection Engineer", 7L);
        Instant shared = Instant.parse("2026-08-25T23:00:00Z");
        JobDetail detail = new JobDetail(7L, 1L, new byte[0], "");
        detail.recordStage(Stage.RESUME_CHECK, shared, null);
        detail.recordStage(Stage.INTERVIEW_REQUEST, shared, null);
        when(jobs.findByIdAndOwnerId(7L, 1L)).thenReturn(Optional.of(job));
        when(jobDetailRepo.findByJobId(7L)).thenReturn(Optional.of(detail));

        var remaining = jobService.deleteStageEvent(1L, 7L, shared, Stage.RESUME_CHECK);

        // The stage says which of the two entries the clicked row stood for.
        assertThat(remaining).extracting("stage").containsExactly(Stage.INTERVIEW_REQUEST);
        assertThat(job.getCurrentStage()).isEqualTo(Stage.INTERVIEW_REQUEST);
    }

    @Test
    void deleteStageEventPicksTheOtherEntryWhenTheStageSaysSo() {
        User owner = new User("alice", "hash");
        Job job = job(owner, SourceCategory.SELF_APPLIED, "Globex", "Detection Engineer", 7L);
        Instant shared = Instant.parse("2026-08-25T23:00:00Z");
        JobDetail detail = new JobDetail(7L, 1L, new byte[0], "");
        detail.recordStage(Stage.RESUME_CHECK, shared, null);
        detail.recordStage(Stage.INTERVIEW_REQUEST, shared, null);
        when(jobs.findByIdAndOwnerId(7L, 1L)).thenReturn(Optional.of(job));
        when(jobDetailRepo.findByJobId(7L)).thenReturn(Optional.of(detail));

        var remaining = jobService.deleteStageEvent(1L, 7L, shared, Stage.INTERVIEW_REQUEST);

        assertThat(remaining).extracting("stage").containsExactly(Stage.RESUME_CHECK);
    }

    @Test
    void deleteStageEventRefusesToEmptyTheHistory() {
        User owner = new User("alice", "hash");
        Job job = job(owner, SourceCategory.SELF_APPLIED, "Globex", "Detection Engineer", 7L);
        JobDetail detail = new JobDetail(7L, 1L, new byte[0], "");
        detail.recordStage(Stage.RESUME_CHECK, Instant.parse("2026-08-25T23:00:00Z"), null);
        when(jobs.findByIdAndOwnerId(7L, 1L)).thenReturn(Optional.of(job));
        when(jobDetailRepo.findByJobId(7L)).thenReturn(Optional.of(detail));

        assertThatThrownBy(() -> jobService.deleteStageEvent(1L, 7L, Instant.parse("2026-08-25T23:00:00Z"), Stage.RESUME_CHECK))
                .isInstanceOf(InvalidStageHistoryException.class);
    }

    @Test
    void deleteStageEventRejectsAJobTheCallerDoesNotOwn() {
        when(jobs.findByIdAndOwnerId(7L, 1L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> jobService.deleteStageEvent(1L, 7L, Instant.parse("2026-08-25T23:00:00Z"), Stage.RESUME_CHECK))
                .isInstanceOf(JobNotFoundException.class);
    }

    @Test
    void createJobSavesJobAndRecordsTheInitialStageOnTheDetailDocument() {
        User owner = new User("alice", "hash");
        SourceCategory source = SourceCategory.REFERRAL_APPLIED;
        when(users.getReferenceById(1L)).thenReturn(owner);

        var request = new CreateJobRequest("Acme", "Backend Engineer",
                SourceCategory.REFERRAL_APPLIED, "https://acme.com/jobs/1",
                Location.REMOTE, "Austin, TX", 150000, 180000, "spoke to Kim", null, null, null);

        Job savedJob = new Job("Acme", "Backend Engineer", owner, source,
                "https://acme.com/jobs/1", Location.REMOTE, 150000, 180000);
        ReflectionTestUtils.setField(savedJob, "id", 7L);
        when(jobs.save(any(Job.class))).thenReturn(savedJob);
        when(jobDetailService.createDetail(anyLong(), anyLong(), anyString()))
                .thenReturn(new JobDetail(7L, 1L, new byte[0], ""));

        JobDetailResponse response = jobService.createJob(1L, request);

        assertThat(response.company()).isEqualTo("Acme");
        assertThat(response.role()).isEqualTo("Backend Engineer");
        assertThat(response.sourceCategory()).isEqualTo(SourceCategory.REFERRAL_APPLIED);
        assertThat(response.currentStage()).isEqualTo(Stage.RESUME_CHECK);
        assertThat(response.outcome()).isEqualTo(Outcome.ACTIVE);
        assertThat(response.compMin()).isEqualTo(150000);
        assertThat(response.compMax()).isEqualTo(180000);
        assertThat(response.stageEvents()).hasSize(1);
        assertThat(response.stageEvents().get(0).stage()).isEqualTo(Stage.RESUME_CHECK);
        // Notes now live on the document, created eagerly with the job.
        verify(jobDetailService).createDetail(7L, 1L, "spoke to Kim");
        verify(jobs).save(org.mockito.ArgumentMatchers.<Job>argThat(saved -> "Austin, TX".equals(saved.getCity())));
    }

    @Test
    void aJobARecruiterReachedOutAboutStartsContactedWithApplicationStillInItsHistory() {
        User owner = new User("alice", "hash");
        when(users.getReferenceById(1L)).thenReturn(owner);
        Job savedJob = new Job("Acme", "Backend Engineer", owner, SourceCategory.LINKEDIN_OUTREACH, null, null, null, null);
        ReflectionTestUtils.setField(savedJob, "id", 7L);
        when(jobs.save(any(Job.class))).thenReturn(savedJob);
        when(jobDetailService.createDetail(anyLong(), anyLong(), any()))
                .thenReturn(new JobDetail(7L, 1L, new byte[0], ""));

        var request = new CreateJobRequest("Acme", "Backend Engineer", SourceCategory.LINKEDIN_OUTREACH,
                null, null, null, null, null, null, Stage.INTERVIEW_REQUEST, null, null);
        JobDetailResponse response = jobService.createJob(1L, request);

        assertThat(response.currentStage()).isEqualTo(Stage.INTERVIEW_REQUEST);
        assertThat(response.stageEvents()).extracting("stage")
                .containsExactly(Stage.RESUME_CHECK, Stage.INTERVIEW_REQUEST);
    }

    @Test
    void aNewJobSavesItsDescriptionAndRecommendedResumeInTheSameRequest() {
        User owner = new User("alice", "hash");
        when(users.getReferenceById(1L)).thenReturn(owner);
        Job savedJob = new Job("Acme", "Backend Engineer", owner, SourceCategory.SELF_APPLIED, null, null, null, null);
        ReflectionTestUtils.setField(savedJob, "id", 7L);
        when(jobs.save(any(Job.class))).thenReturn(savedJob);
        JobDetail detail = new JobDetail(7L, 1L, new byte[0], "");
        when(jobDetailService.createDetail(anyLong(), anyLong(), any())).thenReturn(detail);

        jobService.createJob(1L, new CreateJobRequest("Acme", "Backend Engineer", SourceCategory.SELF_APPLIED,
                null, null, null, null, null, null, null, "We are hiring.", "Backend_Resume.pdf"));

        assertThat(Gzip.decompress(detail.getJdTextCompressed())).isEqualTo("We are hiring.");
        assertThat(detail.getRecommendedResume()).isEqualTo("Backend_Resume.pdf");
        verify(jobDetailRepo).save(detail);
    }

    @Test
    void listJobsReturnsOnlyOwnersJobs() {
        User owner = new User("bob", "hash");
        Job job = job(owner, SourceCategory.SELF_APPLIED, "Globex", "SRE", 1L);
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(2L)).thenReturn(List.of(job));

        var result = jobService.listJobs(2L);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).company()).isEqualTo("Globex");
        assertThat(result.get(0).sourceCategory()).isEqualTo(SourceCategory.SELF_APPLIED);
    }

    @Test
    void listJobsDerivesTheLatestInterviewFromTheEmbeddedRounds() {
        User owner = new User("bob", "hash");
        Job job = job(owner, SourceCategory.SELF_APPLIED, "Globex", "SRE", 1L);
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(2L)).thenReturn(List.of(job));

        Instant base = Instant.parse("2026-01-01T00:00:00Z");
        JobDetail detail = new JobDetail(1L, 2L, new byte[0], "");
        detail.addInterview(new InterviewRound(base, null, InterviewType.SYSTEM_DESIGN, null, null, List.of()));
        detail.addInterview(new InterviewRound(base.plusSeconds(3600), null, InterviewType.BEHAVIOR, null, null,
                List.of(new Interviewer("Jordan Lee", null))));
        when(jobDetailRepo.findJourneysByOwnerId(2L)).thenReturn(List.of(journey(detail)));

        var result = jobService.listJobs(2L);

        var latest = result.get(0).latestInterview();
        assertThat(latest.interviewType()).isEqualTo(InterviewType.BEHAVIOR);
        assertThat(latest.roundCount()).isEqualTo(2);
        assertThat(latest.interviewers()).extracting("name").containsExactly("Jordan Lee");
    }

    private JobDetail withRounds(InterviewType... types) {
        JobDetail detail = new JobDetail(1L, 2L, new byte[0], "");
        Instant at = Instant.parse("2026-01-01T00:00:00Z");
        for (InterviewType type : types) {
            detail.addInterview(new InterviewRound(at, null, type, null, null, List.of()));
            at = at.plusSeconds(86400);
        }
        return detail;
    }

    @Test
    void anUndraggedCardSitsAtItsFurthestRoundNotItsLatest() {
        Job job = job(new User("bob", "hash"), SourceCategory.SELF_APPLIED, "Globex", "SRE", 1L);
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(2L)).thenReturn(List.of(job));
        // A debrief after the panel must not slide the card back to Initial Screen.
        when(jobDetailRepo.findJourneysByOwnerId(2L)).thenReturn(List.of(journey(withRounds(
                InterviewType.RECRUITER_PHONE_SCREEN, InterviewType.PANEL_CODING, InterviewType.RECRUITER_DEBRIEF))));

        JobSummaryResponse summary = jobService.listJobs(2L).get(0);

        assertThat(summary.boardPhase()).isEqualTo(InterviewPhase.PANEL);
        assertThat(summary.interviewPhase()).isNull();
    }

    @Test
    void aDraggedPhaseWinsOverTheRounds() {
        Job job = job(new User("bob", "hash"), SourceCategory.SELF_APPLIED, "Globex", "SRE", 1L);
        job.applyUpdate("Globex", "SRE", SourceCategory.SELF_APPLIED, null, null, null, null,
                Stage.INTERVIEW_STAGE, InterviewPhase.MID_ROUNDS, Outcome.ACTIVE);
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(2L)).thenReturn(List.of(job));
        when(jobDetailRepo.findJourneysByOwnerId(2L)).thenReturn(List.of(journey(withRounds(InterviewType.PANEL_CODING))));

        JobSummaryResponse summary = jobService.listJobs(2L).get(0);

        assertThat(summary.boardPhase()).isEqualTo(InterviewPhase.MID_ROUNDS);
        assertThat(summary.interviewPhase()).isEqualTo(InterviewPhase.MID_ROUNDS);
    }

    @Test
    void anUnrelatedEditDoesNotFreezeAnUndraggedCard() {
        // Save a salary change sending back what the summary showed, then log a panel round.
        Job job = job(new User("bob", "hash"), SourceCategory.SELF_APPLIED, "Globex", "SRE", 1L);
        JobDetail detail = withRounds(InterviewType.RECRUITER_PHONE_SCREEN);
        when(jobs.findByIdAndOwnerId(1L, 2L)).thenReturn(Optional.of(job));
        when(jobDetailRepo.findByJobId(1L)).thenReturn(Optional.of(detail));
        JobSummaryResponse shown = jobService.updateJob(2L, 1L, new UpdateJobRequest("Globex", "SRE",
                SourceCategory.SELF_APPLIED, null, null, null, null, null, Stage.INTERVIEW_STAGE, null, Outcome.ACTIVE));

        jobService.updateJob(2L, 1L, new UpdateJobRequest("Globex", "SRE", SourceCategory.SELF_APPLIED,
                null, null, null, 150000, null, shown.currentStage(), shown.interviewPhase(), shown.outcome()));
        detail.addInterview(new InterviewRound(Instant.parse("2026-02-01T00:00:00Z"), null,
                InterviewType.PANEL_CODING, null, null, List.of()));
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(2L)).thenReturn(List.of(job));
        when(jobDetailRepo.findJourneysByOwnerId(2L)).thenReturn(List.of(journey(detail)));

        assertThat(jobService.listJobs(2L).get(0).boardPhase()).isEqualTo(InterviewPhase.PANEL);
    }

    @Test
    void anUndraggedCardWithNoRoundsHasNoPhase() {
        Job job = job(new User("bob", "hash"), SourceCategory.SELF_APPLIED, "Globex", "SRE", 1L);
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(2L)).thenReturn(List.of(job));

        assertThat(jobService.listJobs(2L).get(0).boardPhase()).isNull();
    }

    @Test
    void reopeningAClosedJobReturnsItToTheLastStageItReached() {
        Job job = job(new User("bob", "hash"), SourceCategory.SELF_APPLIED, "Globex", "SRE", 1L);
        job.applyUpdate("Globex", "SRE", SourceCategory.SELF_APPLIED, null, null, null, null,
                Stage.INTERVIEW_STAGE, null, Outcome.REJECTED);
        JobDetail detail = new JobDetail(1L, 2L, new byte[0], "");
        detail.recordStage(Stage.RESUME_CHECK, Instant.parse("2026-01-01T00:00:00Z"), null);
        detail.recordStage(Stage.INTERVIEW_STAGE, Instant.parse("2026-01-05T00:00:00Z"), null);
        detail.recordStage(Stage.FINALIZED, Instant.parse("2026-01-09T00:00:00Z"), null);
        when(jobs.findByIdAndOwnerId(1L, 2L)).thenReturn(Optional.of(job));
        when(jobDetailRepo.findByJobId(1L)).thenReturn(Optional.of(detail));

        JobSummaryResponse reopened = jobService.updateJob(2L, 1L, new UpdateJobRequest("Globex", "SRE",
                SourceCategory.SELF_APPLIED, null, null, null, null, null, Stage.FINALIZED, null, Outcome.ACTIVE));

        assertThat(reopened.currentStage()).isEqualTo(Stage.INTERVIEW_STAGE);
    }

    // Unticking Waiting sends Interview Stage; a job that was only contacted must not gain one it never had.
    @Test
    void unTickingWaitingReturnsToTheStageHeldBeforeIt() {
        for (Stage before : List.of(Stage.INTERVIEW_REQUEST, Stage.INTERVIEW_STAGE)) {
            Job job = job(new User("bob", "hash"), SourceCategory.SELF_APPLIED, "Globex", "SRE", 1L);
            job.applyUpdate("Globex", "SRE", SourceCategory.SELF_APPLIED, null, null, null, null,
                    Stage.WAITING_INTERVIEW_RESULTS, null, Outcome.ACTIVE);
            JobDetail detail = new JobDetail(1L, 2L, new byte[0], "");
            detail.recordStage(Stage.RESUME_CHECK, Instant.parse("2026-01-01T00:00:00Z"), null);
            detail.recordStage(before, Instant.parse("2026-01-05T00:00:00Z"), null);
            detail.recordStage(Stage.WAITING_INTERVIEW_RESULTS, Instant.parse("2026-01-09T00:00:00Z"), null);
            when(jobs.findByIdAndOwnerId(1L, 2L)).thenReturn(Optional.of(job));
            when(jobDetailRepo.findByJobId(1L)).thenReturn(Optional.of(detail));

            JobSummaryResponse unticked = jobService.updateJob(2L, 1L, new UpdateJobRequest("Globex", "SRE",
                    SourceCategory.SELF_APPLIED, null, null, null, null, null, Stage.INTERVIEW_STAGE, null, Outcome.ACTIVE));

            assertThat(unticked.currentStage()).as("waiting after %s", before).isEqualTo(before);
            assertThat(detail.getStageHistory()).as("waiting after %s", before)
                    .extracting(StageHistoryEntry::getStage)
                    .containsExactly(Stage.RESUME_CHECK, before, Stage.WAITING_INTERVIEW_RESULTS, before);
        }
    }

    @Test
    void getJobReturnsJobWithStageHistoryWhenOwnedByCaller() {
        User owner = new User("carol", "hash");
        Job job = job(owner, SourceCategory.LINKEDIN_OUTREACH, "Initech", "PM", 5L);
        when(jobs.findByIdAndOwnerId(5L, 3L)).thenReturn(Optional.of(job));

        JobDetail detail = new JobDetail(5L, 3L, new byte[0], "");
        detail.recordStage(Stage.RESUME_CHECK, Instant.parse("2026-01-01T00:00:00Z"), null);
        when(jobDetailRepo.findByJobId(5L)).thenReturn(Optional.of(detail));

        var result = jobService.getJob(3L, 5L);

        assertThat(result.company()).isEqualTo("Initech");
        assertThat(result.stageEvents()).hasSize(1);
    }

    @Test
    void getJobThrowsNotFoundWhenNotOwnedByCaller() {
        when(jobs.findByIdAndOwnerId(5L, 999L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> jobService.getJob(999L, 5L))
                .isInstanceOf(JobNotFoundException.class);
    }

    @Test
    void updateJobAppliesFieldChangesAndReturnsUpdatedSummary() {
        User owner = new User("dave", "hash");
        Job job = job(owner, SourceCategory.SELF_APPLIED, "OldCo", "Old Role", 10L);
        when(jobs.findByIdAndOwnerId(10L, 1L)).thenReturn(Optional.of(job));

        var request = new UpdateJobRequest("NewCo", "New Role", SourceCategory.REFERRAL_APPLIED,
                "https://newco.com/jobs/1", Location.HYBRID, "  Toronto  ", 100000, 120000,
                Stage.RESUME_CHECK, null, Outcome.ACTIVE);

        JobSummaryResponse response = jobService.updateJob(1L, 10L, request);

        assertThat(response.company()).isEqualTo("NewCo");
        assertThat(response.role()).isEqualTo("New Role");
        assertThat(response.sourceCategory()).isEqualTo(SourceCategory.REFERRAL_APPLIED);
        assertThat(response.location()).isEqualTo(Location.HYBRID);
        assertThat(response.city()).isEqualTo("Toronto");
        assertThat(response.compMin()).isEqualTo(100000);
        assertThat(response.compMax()).isEqualTo(120000);
        verify(jobs).save(job);
    }

    @Test
    void updateJobForcesAClosedOutcomeToTheTerminalStage() {
        User owner = new User("frank", "hash");
        Job job = job(owner, SourceCategory.SELF_APPLIED, "Acme", "Engineer", 10L);
        when(jobs.findByIdAndOwnerId(10L, 1L)).thenReturn(Optional.of(job));

        // A direct PATCH closing the job mid-pipeline; the funnel would otherwise count it as live.
        var request = new UpdateJobRequest("Acme", "Engineer", SourceCategory.SELF_APPLIED,
                null, null, null, null, null, Stage.INTERVIEW_STAGE, null, Outcome.GHOSTED);

        JobSummaryResponse response = jobService.updateJob(1L, 10L, request);

        assertThat(response.currentStage()).isEqualTo(Stage.FINALIZED);
        assertThat(job.getCurrentStage()).isEqualTo(Stage.FINALIZED);
    }

    @Test
    void pausingAJobKeepsItsStageAndColumnSoResumingPutsItBackInPlace() {
        User owner = new User("hank", "hash");
        Job job = job(owner, SourceCategory.SELF_APPLIED, "Acme", "Engineer", 10L);
        when(jobs.findByIdAndOwnerId(10L, 1L)).thenReturn(Optional.of(job));

        var pause = new UpdateJobRequest("Acme", "Engineer", SourceCategory.SELF_APPLIED,
                null, null, null, null, null, Stage.WAITING_INTERVIEW_RESULTS, InterviewPhase.PANEL, Outcome.PAUSED);
        JobSummaryResponse paused = jobService.updateJob(1L, 10L, pause);

        assertThat(paused.currentStage()).isEqualTo(Stage.WAITING_INTERVIEW_RESULTS);
        assertThat(paused.interviewPhase()).isEqualTo(InterviewPhase.PANEL);
        assertThat(Outcome.PAUSED.closesPipeline()).isFalse();
    }

    @Test
    void updateJobLeavesAnOfferOutcomeAtItsOfferStage() {
        User owner = new User("gina", "hash");
        Job job = job(owner, SourceCategory.SELF_APPLIED, "Acme", "Engineer", 10L);
        when(jobs.findByIdAndOwnerId(10L, 1L)).thenReturn(Optional.of(job));

        // Accepted offers stay at OFFER_STAGE; the Sankey reads that stage to route them via OFFER.
        var request = new UpdateJobRequest("Acme", "Engineer", SourceCategory.SELF_APPLIED,
                null, null, null, null, null, Stage.OFFER_STAGE, null, Outcome.OFFER_ACCEPTED);

        JobSummaryResponse response = jobService.updateJob(1L, 10L, request);

        assertThat(response.currentStage()).isEqualTo(Stage.OFFER_STAGE);
    }

    @Test
    void updateJobChangesStageAndRecordsItOnTheDetailDocument() {
        User owner = new User("erin", "hash");
        Job job = job(owner, SourceCategory.SELF_APPLIED, "Acme", "Engineer", 10L);
        when(jobs.findByIdAndOwnerId(10L, 1L)).thenReturn(Optional.of(job));
        JobDetail detail = new JobDetail(10L, 1L, new byte[0], "");
        when(jobDetailRepo.findByJobId(10L)).thenReturn(Optional.of(detail));

        var request = new UpdateJobRequest("Acme", "Engineer", SourceCategory.SELF_APPLIED,
                null, null, null, null, null, Stage.INTERVIEW_REQUEST, null, Outcome.ACTIVE);

        jobService.updateJob(1L, 10L, request);

        assertThat(detail.getStageHistory()).hasSize(1);
        assertThat(detail.getStageHistory().get(0).getStage()).isEqualTo(Stage.INTERVIEW_REQUEST);
        verify(jobDetailRepo).save(detail);
    }

    @Test
    void updateJobDoesNotRecordAStageWhenTheStageIsUnchanged() {
        User owner = new User("frank", "hash");
        Job job = job(owner, SourceCategory.SELF_APPLIED, "Acme", "Engineer", 10L);
        when(jobs.findByIdAndOwnerId(10L, 1L)).thenReturn(Optional.of(job));

        var request = new UpdateJobRequest("Acme", "Engineer", SourceCategory.SELF_APPLIED,
                null, null, null, null, null, Stage.RESUME_CHECK, null, Outcome.ACTIVE);

        jobService.updateJob(1L, 10L, request);

        verify(jobDetailRepo, never()).save(any(JobDetail.class));
    }

    @Test
    void updateJobUpdatesSourceCategory() {
        User owner = new User("ivan", "hash");
        Job job = job(owner, SourceCategory.SELF_APPLIED, "Acme", "Engineer", 10L);
        when(jobs.findByIdAndOwnerId(10L, 1L)).thenReturn(Optional.of(job));

        var request = new UpdateJobRequest("Acme", "Engineer", SourceCategory.EMAIL_OUTREACH,
                null, null, null, null, null, Stage.RESUME_CHECK, null, Outcome.ACTIVE);

        jobService.updateJob(1L, 10L, request);

        assertThat(job.getSourceCategory()).isEqualTo(SourceCategory.EMAIL_OUTREACH);
    }

    @Test
    void updateJobThrowsJobNotFoundExceptionForAnotherUsersJob() {
        when(jobs.findByIdAndOwnerId(10L, 999L)).thenReturn(Optional.empty());

        var request = new UpdateJobRequest("Acme", "Engineer", SourceCategory.SELF_APPLIED,
                null, null, null, null, null, Stage.RESUME_CHECK, null, Outcome.ACTIVE);

        assertThatThrownBy(() -> jobService.updateJob(999L, 10L, request))
                .isInstanceOf(JobNotFoundException.class);
    }

    @Test
    void deleteJobDeletesTheJobAndItsDetailDocument() {
        User owner = new User("judy", "hash");
        Job job = job(owner, SourceCategory.SELF_APPLIED, "Acme", "Engineer", 5L);
        when(jobs.findByIdAndOwnerId(5L, 3L)).thenReturn(Optional.of(job));

        jobService.deleteJob(3L, 5L);

        verify(jobs).delete(job);
        verify(jobDetailService).deleteDetail(5L);
    }

    @Test
    void aFailedCascadeLeavesTheDetailDocumentRatherThanStrippingASurvivingJob() {
        Job job = job(new User("judy", "hash"), SourceCategory.SELF_APPLIED, "Acme", "Engineer", 5L);
        when(jobs.findByIdAndOwnerId(5L, 3L)).thenReturn(Optional.of(job));
        when(jobDetailRepo.findByOwnerIdAndRelatedJobsJobId(3L, 5L))
                .thenThrow(new RuntimeException("mongo unreachable"));

        // The transaction rolls the job back, so its history, notes and rounds have to still be there.
        assertThatThrownBy(() -> jobService.deleteJob(3L, 5L)).isInstanceOf(RuntimeException.class);
        verify(jobDetailService, never()).deleteDetail(anyLong());
    }

    @Test
    void deleteJobThrowsJobNotFoundExceptionForAnotherUsersJob() {
        when(jobs.findByIdAndOwnerId(5L, 999L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> jobService.deleteJob(999L, 5L))
                .isInstanceOf(JobNotFoundException.class);
    }
}
