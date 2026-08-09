package com.jobtracker.core.service;

import com.jobtracker.core.dto.CreateInterviewRequest;
import com.jobtracker.core.dto.InterviewResponse;
import com.jobtracker.core.dto.InterviewerRequest;
import com.jobtracker.core.dto.UpdateInterviewRequest;
import com.jobtracker.core.exception.JobNotFoundException;
import com.jobtracker.core.model.*;
import com.jobtracker.core.repository.JobDetailRepository;
import com.jobtracker.core.repository.JobRepository;
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
import static org.mockito.Mockito.*;

class InterviewServiceTests {

    @Mock
    private JobRepository jobs;

    @Mock
    private JobDetailRepository jobDetails;

    private InterviewService interviewService;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        interviewService = new InterviewService(jobs, jobDetails);
    }

    // findJourneysByOwnerId returns the projection, not the whole document.
    private JobJourney journey(JobDetail detail) {
        return new JobJourney(detail.getJobId(), detail.getStageHistory(), detail.getInterviews());
    }

    private Job newJob(User owner) {
        Job job = new Job("Acme", "Engineer", owner, SourceCategory.SELF_APPLIED, null, null, null, null);
        ReflectionTestUtils.setField(job, "id", 10L);
        return job;
    }

    private JobDetail newDetail() {
        return new JobDetail(10L, 1L, new byte[0], "");
    }

    private InterviewRound round(Instant when, InterviewType type) {
        return new InterviewRound(when, type, null, null, List.of());
    }

    @Test
    void createInterviewEmbedsTheRoundAndAdvancesStageWhenFurther() {
        User owner = new User("alice", "hash");
        Job job = newJob(owner);
        JobDetail detail = newDetail();
        when(jobs.findByIdAndOwnerId(10L, 1L)).thenReturn(Optional.of(job));
        when(jobDetails.findByJobIdAndOwnerId(10L, 1L)).thenReturn(Optional.of(detail));

        Instant when = Instant.parse("2026-08-01T18:00:00Z");
        var request = new CreateInterviewRequest(10L, Stage.INTERVIEW_STAGE, when,
                InterviewType.SYSTEM_DESIGN, "https://meet.example/abc", "123 Main St, NYC",
                List.of(new InterviewerRequest("Jordan Lee", "https://linkedin.com/in/jordanlee")));

        InterviewResponse response = interviewService.createInterview(1L, request);

        assertThat(response.jobId()).isEqualTo(10L);
        assertThat(response.company()).isEqualTo("Acme");
        assertThat(response.roundId()).isNotBlank();
        assertThat(response.interviewDateTime()).isEqualTo(when);
        assertThat(response.interviewType()).isEqualTo(InterviewType.SYSTEM_DESIGN);
        assertThat(response.meetingLink()).isEqualTo("https://meet.example/abc");
        assertThat(response.location()).isEqualTo("123 Main St, NYC");
        assertThat(response.interviewers()).hasSize(1);
        assertThat(response.interviewers().get(0).name()).isEqualTo("Jordan Lee");
        assertThat(response.interviewers().get(0).linkedInUrl()).isEqualTo("https://linkedin.com/in/jordanlee");

        assertThat(detail.getInterviews()).hasSize(1);
        assertThat(job.getCurrentStage()).isEqualTo(Stage.INTERVIEW_STAGE);
        verify(jobs).save(job);
    }

    @Test
    void createInterviewRecordsAStageEntryOnlyWhenTheStageActuallyMoves() {
        User owner = new User("bob", "hash");
        Job job = newJob(owner);
        job.advanceStageIfFurther(Stage.OFFER_STAGE);
        JobDetail detail = newDetail();
        when(jobs.findByIdAndOwnerId(10L, 1L)).thenReturn(Optional.of(job));
        when(jobDetails.findByJobIdAndOwnerId(10L, 1L)).thenReturn(Optional.of(detail));

        var request = new CreateInterviewRequest(10L, Stage.INTERVIEW_REQUEST, Instant.now(),
                InterviewType.BEHAVIOR, null, null, null);

        interviewService.createInterview(1L, request);

        assertThat(job.getCurrentStage()).isEqualTo(Stage.OFFER_STAGE);
        assertThat(detail.getStageHistory()).isEmpty();
    }

    @Test
    void createInterviewThrowsJobNotFoundExceptionForAnotherUsersJob() {
        when(jobs.findByIdAndOwnerId(10L, 999L)).thenReturn(Optional.empty());

        var request = new CreateInterviewRequest(10L, Stage.INTERVIEW_STAGE, Instant.now(),
                InterviewType.BEHAVIOR, null, null, null);

        assertThatThrownBy(() -> interviewService.createInterview(999L, request))
                .isInstanceOf(JobNotFoundException.class);
    }

    @Test
    void updateInterviewChangesFieldsWithoutTouchingJobStage() {
        User owner = new User("carol", "hash");
        Job job = newJob(owner);
        job.advanceStageIfFurther(Stage.INTERVIEW_STAGE);
        JobDetail detail = newDetail();
        InterviewRound existing = round(Instant.parse("2026-08-01T12:00:00Z"), InterviewType.VALUES);
        detail.addInterview(existing);
        when(jobDetails.findByOwnerIdAndInterviewsRoundId(1L, existing.getRoundId())).thenReturn(Optional.of(detail));
        when(jobs.findByIdAndOwnerId(10L, 1L)).thenReturn(Optional.of(job));

        Instant newTime = Instant.parse("2026-08-05T15:30:00Z");
        var request = new UpdateInterviewRequest(newTime, InterviewType.BEHAVIOR,
                "https://meet.example/xyz", null, List.of(new InterviewerRequest("Priya Shah", null)));

        InterviewResponse response = interviewService.updateInterview(1L, existing.getRoundId(), request);

        assertThat(response.interviewDateTime()).isEqualTo(newTime);
        assertThat(response.interviewType()).isEqualTo(InterviewType.BEHAVIOR);
        assertThat(response.interviewers()).hasSize(1);
        assertThat(response.interviewers().get(0).name()).isEqualTo("Priya Shah");
        assertThat(job.getCurrentStage()).isEqualTo(Stage.INTERVIEW_STAGE);
        verify(jobs, never()).save(any());
    }

    @Test
    void updateInterviewThrowsJobNotFoundExceptionForAnotherUsersRound() {
        when(jobDetails.findByOwnerIdAndInterviewsRoundId(999L, "missing-round")).thenReturn(Optional.empty());

        var request = new UpdateInterviewRequest(Instant.now(), InterviewType.BEHAVIOR, null, null, null);

        assertThatThrownBy(() -> interviewService.updateInterview(999L, "missing-round", request))
                .isInstanceOf(JobNotFoundException.class);
    }

    @Test
    void listInterviewsReturnsOnlyCallersInterviews() {
        User owner = new User("dave", "hash");
        Job job = newJob(owner);
        JobDetail detail = newDetail();
        detail.addInterview(round(Instant.parse("2026-08-01T12:00:00Z"), InterviewType.VALUES));
        when(jobDetails.findJourneysByOwnerId(1L)).thenReturn(List.of(journey(detail)));
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(job));

        List<InterviewResponse> result = interviewService.listInterviews(1L);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).interviewType()).isEqualTo(InterviewType.VALUES);
        assertThat(result.get(0).company()).isEqualTo("Acme");
    }

    @Test
    void deleteInterviewRemovesTheRoundButKeepsTheStageHistory() {
        User owner = new User("erin", "hash");
        Job job = newJob(owner);
        job.advanceStageIfFurther(Stage.INTERVIEW_STAGE);
        JobDetail detail = newDetail();
        detail.recordStage(Stage.RESUME_CHECK, Instant.parse("2026-07-01T00:00:00Z"), null);
        detail.recordStage(Stage.INTERVIEW_STAGE, Instant.parse("2026-07-02T00:00:00Z"), null);
        InterviewRound existing = round(Instant.parse("2026-08-01T12:00:00Z"), InterviewType.BEHAVIOR);
        detail.addInterview(existing);
        when(jobDetails.findByOwnerIdAndInterviewsRoundId(1L, existing.getRoundId())).thenReturn(Optional.of(detail));
        when(jobs.findByIdAndOwnerId(10L, 1L)).thenReturn(Optional.of(job));

        interviewService.deleteInterview(1L, existing.getRoundId());

        assertThat(detail.getInterviews()).isEmpty();
        // Removing a calendar entry must not erase a pipeline transition.
        assertThat(detail.getStageHistory()).hasSize(2);
        assertThat(job.getCurrentStage()).isEqualTo(Stage.INTERVIEW_STAGE);
        verify(jobDetails).save(detail);
    }

    @Test
    void deleteInterviewLeavesTheJobStageAlone() {
        User owner = new User("heidi", "hash");
        Job job = newJob(owner);
        job.advanceStageIfFurther(Stage.INTERVIEW_STAGE);
        JobDetail detail = newDetail();
        detail.recordStage(Stage.RESUME_CHECK, Instant.parse("2026-07-01T00:00:00Z"), null);
        InterviewRound existing = round(Instant.parse("2026-08-01T12:00:00Z"), InterviewType.BEHAVIOR);
        detail.addInterview(existing);
        when(jobDetails.findByOwnerIdAndInterviewsRoundId(1L, existing.getRoundId())).thenReturn(Optional.of(detail));

        interviewService.deleteInterview(1L, existing.getRoundId());

        // The transition happened and its history entry survives, so removing the round doesn't undo it.
        assertThat(job.getCurrentStage()).isEqualTo(Stage.INTERVIEW_STAGE);
        verify(jobs, never()).save(any());
    }

    @Test
    void deleteInterviewLeavesAClosedJobFinalized() {
        User owner = new User("nina", "hash");
        Job job = newJob(owner);
        // Closed via the domain rule: REJECTED forces FINALIZED.
        job.applyUpdate("Acme", "Engineer", SourceCategory.SELF_APPLIED, null, null, null, null,
                Stage.INTERVIEW_STAGE, Outcome.REJECTED);
        JobDetail detail = newDetail();
        detail.recordStage(Stage.RESUME_CHECK, Instant.parse("2026-07-01T00:00:00Z"), null);
        detail.recordStage(Stage.INTERVIEW_STAGE, Instant.parse("2026-07-02T00:00:00Z"), null);
        detail.recordStage(Stage.FINALIZED, Instant.parse("2026-07-03T00:00:00Z"), null);
        InterviewRound existing = round(Instant.parse("2026-08-01T12:00:00Z"), InterviewType.BEHAVIOR);
        detail.addInterview(existing);
        when(jobDetails.findByOwnerIdAndInterviewsRoundId(1L, existing.getRoundId())).thenReturn(Optional.of(detail));
        when(jobs.findByIdAndOwnerId(10L, 1L)).thenReturn(Optional.of(job));

        interviewService.deleteInterview(1L, existing.getRoundId());

        // Dropping out of FINALIZED while the outcome stays REJECTED is the inconsistent state F52 forbids.
        assertThat(job.getCurrentStage()).isEqualTo(Stage.FINALIZED);
        assertThat(job.getOutcome()).isEqualTo(Outcome.REJECTED);
    }

    @Test
    void deleteInterviewThrowsJobNotFoundExceptionForAnotherUsersRound() {
        when(jobDetails.findByOwnerIdAndInterviewsRoundId(999L, "missing-round")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> interviewService.deleteInterview(999L, "missing-round"))
                .isInstanceOf(JobNotFoundException.class);

        verify(jobDetails, never()).save(any(JobDetail.class));
    }

    @Test
    void listUpcomingInterviewsKeepsOnlyRoundsInsideTheWindow() {
        User owner = new User("frank", "hash");
        Job job = newJob(owner);
        JobDetail detail = newDetail();
        Instant soon = Instant.now().plusSeconds(3600);
        detail.addInterview(round(soon, InterviewType.BEHAVIOR));
        detail.addInterview(round(Instant.now().minusSeconds(3600), InterviewType.VALUES));
        detail.addInterview(round(Instant.now().plusSeconds(60L * 60 * 24 * 30), InterviewType.CULTURE_FIT));
        when(jobDetails.findJourneysByOwnerId(1L)).thenReturn(List.of(journey(detail)));
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(job));

        List<InterviewResponse> result = interviewService.listUpcomingInterviews(1L);

        // Past rounds and anything beyond 72 hours are excluded.
        assertThat(result).hasSize(1);
        assertThat(result.get(0).interviewType()).isEqualTo(InterviewType.BEHAVIOR);
    }

    @Test
    void listUpcomingInterviewsReturnsEmptyListWhenNoneInWindow() {
        when(jobDetails.findJourneysByOwnerId(1L)).thenReturn(List.of());

        List<InterviewResponse> result = interviewService.listUpcomingInterviews(1L);

        assertThat(result).isEmpty();
    }

    @Test
    void createInterviewSavesTheDocumentExactlyOnce() {
        User owner = new User("grace", "hash");
        Job job = newJob(owner);
        JobDetail detail = newDetail();
        when(jobs.findByIdAndOwnerId(10L, 1L)).thenReturn(Optional.of(job));
        when(jobDetails.findByJobIdAndOwnerId(10L, 1L)).thenReturn(Optional.of(detail));

        var request = new CreateInterviewRequest(10L, Stage.INTERVIEW_STAGE, Instant.now(),
                InterviewType.BEHAVIOR, null, null,
                List.of(new InterviewerRequest("Jordan Lee", null)));

        interviewService.createInterview(1L, request);

        // The round and its stage entry are both applied before the single save.
        verify(jobDetails, times(1)).save(any(JobDetail.class));
    }
}
