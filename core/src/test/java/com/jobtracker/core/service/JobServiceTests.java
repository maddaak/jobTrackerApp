package com.jobtracker.core.service;

import com.jobtracker.core.dto.CreateJobRequest;
import com.jobtracker.core.dto.JobDetailResponse;
import com.jobtracker.core.dto.JobSummaryResponse;
import com.jobtracker.core.dto.UpdateJobRequest;
import com.jobtracker.core.exception.JobNotFoundException;
import com.jobtracker.core.model.*;
import com.jobtracker.core.repository.JobRepository;
import com.jobtracker.core.repository.SourceRepository;
import com.jobtracker.core.repository.StageEventRepository;
import com.jobtracker.core.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class JobServiceTests {

    @Mock
    private JobRepository jobs;

    @Mock
    private SourceRepository sources;

    @Mock
    private StageEventRepository stageEvents;

    @Mock
    private UserRepository users;

    @Mock
    private JobDetailService jobDetails;

    private JobService jobService;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        jobService = new JobService(jobs, sources, stageEvents, users, jobDetails);
    }

    @Test
    void createJobSavesSourceJobAndInitialStageEvent() {
        User owner = new User("alice", "hash");
        Source source = new Source(SourceCategory.REFERRAL_APPLIED);
        when(users.getReferenceById(1L)).thenReturn(owner);
        when(sources.save(any(Source.class))).thenReturn(source);

        var request = new CreateJobRequest("Acme", "Backend Engineer",
                SourceCategory.REFERRAL_APPLIED, "https://acme.com/jobs/1",
                Location.REMOTE, 150000, 180000, "spoke to Kim");

        Job savedJob = new Job("Acme", "Backend Engineer", owner, source,
                "https://acme.com/jobs/1", Location.REMOTE, 150000, 180000, "spoke to Kim");
        when(jobs.save(any(Job.class))).thenReturn(savedJob);
        when(stageEvents.save(any(StageEvent.class)))
                .thenReturn(new StageEvent(savedJob, Stage.RESUME_CHECK, Instant.now(), null));

        JobDetailResponse response = jobService.createJob(1L, request);

        assertThat(response.company()).isEqualTo("Acme");
        assertThat(response.role()).isEqualTo("Backend Engineer");
        assertThat(response.sourceCategory()).isEqualTo(SourceCategory.REFERRAL_APPLIED);
        assertThat(response.currentStage()).isEqualTo(Stage.RESUME_CHECK);
        assertThat(response.outcome()).isEqualTo(Outcome.ACTIVE);
        assertThat(response.compMin()).isEqualTo(150000);
        assertThat(response.compMax()).isEqualTo(180000);
        assertThat(response.notes()).isEqualTo("spoke to Kim");
        assertThat(response.stageEvents()).hasSize(1);
        assertThat(response.stageEvents().get(0).stage()).isEqualTo(Stage.RESUME_CHECK);
    }

    @Test
    void listJobsReturnsOnlyOwnersJobs() {
        User owner = new User("bob", "hash");
        Source source = new Source(SourceCategory.SELF_APPLIED);
        Job job = new Job("Globex", "SRE", owner, source, null, null, null, null, null);
        when(jobs.findByOwnerIdWithSourceOrderByCreatedAtDesc(2L)).thenReturn(List.of(job));

        var result = jobService.listJobs(2L);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).company()).isEqualTo("Globex");
        assertThat(result.get(0).sourceCategory()).isEqualTo(SourceCategory.SELF_APPLIED);
    }

    @Test
    void getJobReturnsJobWithStageEventsWhenOwnedByCaller() {
        User owner = new User("carol", "hash");
        Source source = new Source(SourceCategory.LINKEDIN_OUTREACH);
        Job job = new Job("Initech", "PM", owner, source, null, Location.NYC_HYBRID, null, null, null);
        when(jobs.findByIdAndOwnerId(5L, 3L)).thenReturn(Optional.of(job));
        when(stageEvents.findByJobIdOrderByEnteredAtAsc(5L))
                .thenReturn(List.of(new StageEvent(job, Stage.RESUME_CHECK, Instant.now(), null)));

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
        Source source = new Source(SourceCategory.SELF_APPLIED);
        Job job = new Job("OldCo", "Old Role", owner, source, null, Location.REMOTE, null, null, null);
        when(jobs.findByIdAndOwnerId(10L, 1L)).thenReturn(Optional.of(job));

        var request = new UpdateJobRequest("NewCo", "New Role", SourceCategory.REFERRAL_APPLIED,
                "https://newco.com/jobs/1", Location.NYC_HYBRID, 100000, 120000, "updated notes",
                Stage.RESUME_CHECK, Outcome.ACTIVE, null);

        JobSummaryResponse response = jobService.updateJob(1L, 10L, request);

        assertThat(response.company()).isEqualTo("NewCo");
        assertThat(response.role()).isEqualTo("New Role");
        assertThat(response.sourceCategory()).isEqualTo(SourceCategory.REFERRAL_APPLIED);
        assertThat(response.location()).isEqualTo(Location.NYC_HYBRID);
        assertThat(response.compMin()).isEqualTo(100000);
        assertThat(response.compMax()).isEqualTo(120000);
        assertThat(response.notes()).isEqualTo("updated notes");
        verify(jobs).save(job);
    }

    @Test
    void updateJobChangesStageAndAppendsNewStageEvent() {
        User owner = new User("erin", "hash");
        Source source = new Source(SourceCategory.SELF_APPLIED);
        Job job = new Job("Acme", "Engineer", owner, source, null, null, null, null, null);
        when(jobs.findByIdAndOwnerId(10L, 1L)).thenReturn(Optional.of(job));

        var request = new UpdateJobRequest("Acme", "Engineer", SourceCategory.SELF_APPLIED,
                null, null, null, null, null, Stage.INTERVIEW_REQUEST, Outcome.ACTIVE, null);

        jobService.updateJob(1L, 10L, request);

        ArgumentCaptor<StageEvent> captor = ArgumentCaptor.forClass(StageEvent.class);
        verify(stageEvents).save(captor.capture());
        assertThat(captor.getValue().getStage()).isEqualTo(Stage.INTERVIEW_REQUEST);
    }

    @Test
    void updateJobDoesNotAppendStageEventWhenStageUnchanged() {
        User owner = new User("frank", "hash");
        Source source = new Source(SourceCategory.SELF_APPLIED);
        Job job = new Job("Acme", "Engineer", owner, source, null, null, null, null, null);
        when(jobs.findByIdAndOwnerId(10L, 1L)).thenReturn(Optional.of(job));

        var request = new UpdateJobRequest("Acme", "Engineer", SourceCategory.SELF_APPLIED,
                null, null, null, null, null, Stage.RESUME_CHECK, Outcome.ACTIVE, null);

        jobService.updateJob(1L, 10L, request);

        verify(stageEvents, never()).save(any(StageEvent.class));
    }

    @Test
    void updateJobClearsRejectedReasonWhenOutcomeIsNotRejected() {
        User owner = new User("grace", "hash");
        Source source = new Source(SourceCategory.SELF_APPLIED);
        Job job = new Job("Acme", "Engineer", owner, source, null, null, null, null, null);
        when(jobs.findByIdAndOwnerId(10L, 1L)).thenReturn(Optional.of(job));

        var request = new UpdateJobRequest("Acme", "Engineer", SourceCategory.SELF_APPLIED,
                null, null, null, null, null, Stage.RESUME_CHECK, Outcome.ACTIVE, "should be cleared");

        JobSummaryResponse response = jobService.updateJob(1L, 10L, request);

        assertThat(response.rejectedReason()).isNull();
    }

    @Test
    void updateJobKeepsRejectedReasonWhenOutcomeIsRejected() {
        User owner = new User("heidi", "hash");
        Source source = new Source(SourceCategory.SELF_APPLIED);
        Job job = new Job("Acme", "Engineer", owner, source, null, null, null, null, null);
        when(jobs.findByIdAndOwnerId(10L, 1L)).thenReturn(Optional.of(job));

        var request = new UpdateJobRequest("Acme", "Engineer", SourceCategory.SELF_APPLIED,
                null, null, null, null, null, Stage.RESUME_CHECK, Outcome.REJECTED, "not a fit");

        JobSummaryResponse response = jobService.updateJob(1L, 10L, request);

        assertThat(response.rejectedReason()).isEqualTo("not a fit");
    }

    @Test
    void updateJobUpdatesSourceCategoryOnExistingSource() {
        User owner = new User("ivan", "hash");
        Source source = new Source(SourceCategory.SELF_APPLIED);
        Job job = new Job("Acme", "Engineer", owner, source, null, null, null, null, null);
        when(jobs.findByIdAndOwnerId(10L, 1L)).thenReturn(Optional.of(job));

        var request = new UpdateJobRequest("Acme", "Engineer", SourceCategory.EMAIL_OUTREACH,
                null, null, null, null, null, Stage.RESUME_CHECK, Outcome.ACTIVE, null);

        jobService.updateJob(1L, 10L, request);

        assertThat(job.getSource().getCategory()).isEqualTo(SourceCategory.EMAIL_OUTREACH);
        verify(sources, never()).save(any(Source.class));
    }

    @Test
    void updateJobThrowsJobNotFoundExceptionForAnotherUsersJob() {
        when(jobs.findByIdAndOwnerId(10L, 999L)).thenReturn(Optional.empty());

        var request = new UpdateJobRequest("Acme", "Engineer", SourceCategory.SELF_APPLIED,
                null, null, null, null, null, Stage.RESUME_CHECK, Outcome.ACTIVE, null);

        assertThatThrownBy(() -> jobService.updateJob(999L, 10L, request))
                .isInstanceOf(JobNotFoundException.class);
    }

    @Test
    void deleteJobDeletesStageEventsThenJob() {
        User owner = new User("judy", "hash");
        Source source = new Source(SourceCategory.SELF_APPLIED);
        Job job = new Job("Acme", "Engineer", owner, source, null, null, null, null, null);
        when(jobs.findByIdAndOwnerId(5L, 3L)).thenReturn(Optional.of(job));

        jobService.deleteJob(3L, 5L);

        verify(stageEvents).deleteByJobId(job.getId());
        verify(jobs).delete(job);
        verify(jobDetails).deleteDetail(job.getId());
    }

    @Test
    void deleteJobThrowsJobNotFoundExceptionForAnotherUsersJob() {
        when(jobs.findByIdAndOwnerId(5L, 999L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> jobService.deleteJob(999L, 5L))
                .isInstanceOf(JobNotFoundException.class);

        verify(stageEvents, never()).deleteByJobId(any());
        verify(jobs, never()).delete(any());
    }
}
