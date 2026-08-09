package com.jobtracker.core.service;

import com.jobtracker.core.dto.CreateJobRequest;
import com.jobtracker.core.dto.JobDetailResponse;
import com.jobtracker.core.dto.JobSummaryResponse;
import com.jobtracker.core.dto.UpdateJobRequest;
import com.jobtracker.core.exception.JobNotFoundException;
import com.jobtracker.core.model.*;
import com.jobtracker.core.repository.JobDetailRepository;
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

    private JobService jobService;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        jobService = new JobService(jobs, users, jobDetailRepo, jobDetailService);
        // updateJob creates the document when one is missing, so a stage change never drops its entry.
        when(jobDetailService.createDetail(anyLong(), anyLong(), any()))
                .thenAnswer(i -> new JobDetail(i.getArgument(0), i.getArgument(1), new byte[0], ""));
    }

    // findJourneysByOwnerId returns the projection, not the whole document.
    private JobJourney journey(JobDetail detail) {
        return new JobJourney(detail.getJobId(), detail.getStageHistory(), detail.getInterviews());
    }

    private Job job(User owner, SourceCategory source, String company, String role, Long id) {
        Job job = new Job(company, role, owner, source, null, null, null, null);
        ReflectionTestUtils.setField(job, "id", id);
        return job;
    }

    @Test
    void createJobSavesJobAndRecordsTheInitialStageOnTheDetailDocument() {
        User owner = new User("alice", "hash");
        SourceCategory source = SourceCategory.REFERRAL_APPLIED;
        when(users.getReferenceById(1L)).thenReturn(owner);

        var request = new CreateJobRequest("Acme", "Backend Engineer",
                SourceCategory.REFERRAL_APPLIED, "https://acme.com/jobs/1",
                Location.REMOTE, 150000, 180000, "spoke to Kim");

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
        detail.addInterview(new InterviewRound(base, InterviewType.SYSTEM_DESIGN, null, null, List.of()));
        detail.addInterview(new InterviewRound(base.plusSeconds(3600), InterviewType.BEHAVIOR, null, null,
                List.of(new Interviewer("Jordan Lee", null))));
        when(jobDetailRepo.findJourneysByOwnerId(2L)).thenReturn(List.of(journey(detail)));

        var result = jobService.listJobs(2L);

        var latest = result.get(0).latestInterview();
        assertThat(latest.interviewType()).isEqualTo(InterviewType.BEHAVIOR);
        assertThat(latest.roundCount()).isEqualTo(2);
        assertThat(latest.interviewers()).extracting("name").containsExactly("Jordan Lee");
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
                "https://newco.com/jobs/1", Location.NYC_HYBRID, 100000, 120000,
                Stage.RESUME_CHECK, Outcome.ACTIVE);

        JobSummaryResponse response = jobService.updateJob(1L, 10L, request);

        assertThat(response.company()).isEqualTo("NewCo");
        assertThat(response.role()).isEqualTo("New Role");
        assertThat(response.sourceCategory()).isEqualTo(SourceCategory.REFERRAL_APPLIED);
        assertThat(response.location()).isEqualTo(Location.NYC_HYBRID);
        assertThat(response.compMin()).isEqualTo(100000);
        assertThat(response.compMax()).isEqualTo(120000);
        verify(jobs).save(job);
    }

    @Test
    void updateJobForcesAClosedOutcomeToTheTerminalStage() {
        User owner = new User("frank", "hash");
        Job job = job(owner, SourceCategory.SELF_APPLIED, "Acme", "Engineer", 10L);
        when(jobs.findByIdAndOwnerId(10L, 1L)).thenReturn(Optional.of(job));

        // A direct PATCH that closes the job but leaves it mid-pipeline; the funnel would otherwise
        // keep counting it as live at Interview Stage.
        var request = new UpdateJobRequest("Acme", "Engineer", SourceCategory.SELF_APPLIED,
                null, null, null, null, Stage.INTERVIEW_STAGE, Outcome.GHOSTED);

        JobSummaryResponse response = jobService.updateJob(1L, 10L, request);

        assertThat(response.currentStage()).isEqualTo(Stage.FINALIZED);
        assertThat(job.getCurrentStage()).isEqualTo(Stage.FINALIZED);
    }

    @Test
    void updateJobLeavesAnOfferOutcomeAtItsOfferStage() {
        User owner = new User("gina", "hash");
        Job job = job(owner, SourceCategory.SELF_APPLIED, "Acme", "Engineer", 10L);
        when(jobs.findByIdAndOwnerId(10L, 1L)).thenReturn(Optional.of(job));

        // Accepted offers stay at OFFER_STAGE; the Sankey reads that stage to route them via OFFER.
        var request = new UpdateJobRequest("Acme", "Engineer", SourceCategory.SELF_APPLIED,
                null, null, null, null, Stage.OFFER_STAGE, Outcome.OFFER_ACCEPTED);

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
                null, null, null, null, Stage.INTERVIEW_REQUEST, Outcome.ACTIVE);

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
                null, null, null, null, Stage.RESUME_CHECK, Outcome.ACTIVE);

        jobService.updateJob(1L, 10L, request);

        verify(jobDetailRepo, never()).save(any(JobDetail.class));
    }

    @Test
    void updateJobUpdatesSourceCategory() {
        User owner = new User("ivan", "hash");
        Job job = job(owner, SourceCategory.SELF_APPLIED, "Acme", "Engineer", 10L);
        when(jobs.findByIdAndOwnerId(10L, 1L)).thenReturn(Optional.of(job));

        var request = new UpdateJobRequest("Acme", "Engineer", SourceCategory.EMAIL_OUTREACH,
                null, null, null, null, Stage.RESUME_CHECK, Outcome.ACTIVE);

        jobService.updateJob(1L, 10L, request);

        assertThat(job.getSourceCategory()).isEqualTo(SourceCategory.EMAIL_OUTREACH);
    }

    @Test
    void updateJobThrowsJobNotFoundExceptionForAnotherUsersJob() {
        when(jobs.findByIdAndOwnerId(10L, 999L)).thenReturn(Optional.empty());

        var request = new UpdateJobRequest("Acme", "Engineer", SourceCategory.SELF_APPLIED,
                null, null, null, null, Stage.RESUME_CHECK, Outcome.ACTIVE);

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
    void deleteJobThrowsJobNotFoundExceptionForAnotherUsersJob() {
        when(jobs.findByIdAndOwnerId(5L, 999L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> jobService.deleteJob(999L, 5L))
                .isInstanceOf(JobNotFoundException.class);
    }
}
