package com.jobtracker.core.service;

import com.jobtracker.core.dto.CreateInterviewRequest;
import com.jobtracker.core.dto.InterviewResponse;
import com.jobtracker.core.dto.InterviewerRequest;
import com.jobtracker.core.dto.UpdateInterviewRequest;
import com.jobtracker.core.exception.JobNotFoundException;
import com.jobtracker.core.model.*;
import com.jobtracker.core.repository.JobRepository;
import com.jobtracker.core.repository.StageEventRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

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
    private StageEventRepository stageEvents;

    private InterviewService interviewService;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        interviewService = new InterviewService(jobs, stageEvents);
    }

    private Job newJob(User owner, Source source) {
        return new Job("Acme", "Engineer", owner, source, null, null, null, null, null);
    }

    @Test
    void createInterviewSavesStageEventAndAdvancesStageWhenFurther() {
        User owner = new User("alice", "hash");
        Source source = new Source(SourceCategory.SELF_APPLIED);
        Job job = newJob(owner, source);
        when(jobs.findByIdAndOwnerId(10L, 1L)).thenReturn(Optional.of(job));
        when(stageEvents.save(any(StageEvent.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        Instant when = Instant.parse("2026-08-01T18:00:00Z");
        var request = new CreateInterviewRequest(10L, Stage.INTERVIEW_STAGE, when,
                InterviewType.SYSTEM_DESIGN, "https://meet.example/abc", "123 Main St, NYC",
                List.of(new InterviewerRequest("Jordan Lee", "https://linkedin.com/in/jordanlee")));

        InterviewResponse response = interviewService.createInterview(1L, request);

        assertThat(response.jobId()).isEqualTo(job.getId());
        assertThat(response.company()).isEqualTo("Acme");
        assertThat(response.stage()).isEqualTo(Stage.INTERVIEW_STAGE);
        assertThat(response.interviewDateTime()).isEqualTo(when);
        assertThat(response.interviewType()).isEqualTo(InterviewType.SYSTEM_DESIGN);
        assertThat(response.meetingLink()).isEqualTo("https://meet.example/abc");
        assertThat(response.location()).isEqualTo("123 Main St, NYC");
        assertThat(response.interviewers()).hasSize(1);
        assertThat(response.interviewers().get(0).name()).isEqualTo("Jordan Lee");
        assertThat(response.interviewers().get(0).linkedInUrl()).isEqualTo("https://linkedin.com/in/jordanlee");
        assertThat(job.getCurrentStage()).isEqualTo(Stage.INTERVIEW_STAGE);
        verify(jobs).save(job);
    }

    @Test
    void createInterviewDoesNotRegressStageWhenJobAlreadyFurtherAlong() {
        User owner = new User("bob", "hash");
        Source source = new Source(SourceCategory.SELF_APPLIED);
        Job job = newJob(owner, source);
        job.advanceStageIfFurther(Stage.OFFER_STAGE);
        when(jobs.findByIdAndOwnerId(10L, 1L)).thenReturn(Optional.of(job));
        when(stageEvents.save(any(StageEvent.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        var request = new CreateInterviewRequest(10L, Stage.INTERVIEW_REQUEST, Instant.now(),
                null, null, null, null);

        interviewService.createInterview(1L, request);

        assertThat(job.getCurrentStage()).isEqualTo(Stage.OFFER_STAGE);
    }

    @Test
    void createInterviewThrowsJobNotFoundExceptionForAnotherUsersJob() {
        when(jobs.findByIdAndOwnerId(10L, 999L)).thenReturn(Optional.empty());

        var request = new CreateInterviewRequest(10L, Stage.INTERVIEW_STAGE, Instant.now(),
                null, null, null, null);

        assertThatThrownBy(() -> interviewService.createInterview(999L, request))
                .isInstanceOf(JobNotFoundException.class);
    }

    @Test
    void updateInterviewChangesFieldsWithoutTouchingJobStage() {
        User owner = new User("carol", "hash");
        Source source = new Source(SourceCategory.SELF_APPLIED);
        Job job = newJob(owner, source);
        job.advanceStageIfFurther(Stage.INTERVIEW_STAGE);
        StageEvent event = new StageEvent(job, Stage.INTERVIEW_STAGE, Instant.now(), null);
        when(stageEvents.findByIdAndJob_Owner_Id(7L, 1L)).thenReturn(Optional.of(event));

        Instant newTime = Instant.parse("2026-08-05T15:30:00Z");
        var request = new UpdateInterviewRequest(newTime, InterviewType.BEHAVIOR,
                "https://meet.example/xyz", null, List.of(new InterviewerRequest("Priya Shah", null)));

        InterviewResponse response = interviewService.updateInterview(1L, 7L, request);

        assertThat(response.interviewDateTime()).isEqualTo(newTime);
        assertThat(response.interviewType()).isEqualTo(InterviewType.BEHAVIOR);
        assertThat(response.interviewers()).hasSize(1);
        assertThat(response.interviewers().get(0).name()).isEqualTo("Priya Shah");
        assertThat(job.getCurrentStage()).isEqualTo(Stage.INTERVIEW_STAGE);
        verify(jobs, never()).save(any());
    }

    @Test
    void updateInterviewThrowsJobNotFoundExceptionForAnotherUsersStageEvent() {
        when(stageEvents.findByIdAndJob_Owner_Id(7L, 999L)).thenReturn(Optional.empty());

        var request = new UpdateInterviewRequest(Instant.now(), null, null, null, null);

        assertThatThrownBy(() -> interviewService.updateInterview(999L, 7L, request))
                .isInstanceOf(JobNotFoundException.class);
    }

    @Test
    void listInterviewsReturnsOnlyCallersInterviews() {
        User owner = new User("dave", "hash");
        Source source = new Source(SourceCategory.SELF_APPLIED);
        Job job = newJob(owner, source);
        StageEvent event = new StageEvent(job, Stage.INTERVIEW_STAGE, Instant.now(), null);
        event.applyInterviewDetails(Instant.now(), InterviewType.VALUES, null, null, List.of());
        when(stageEvents.findAllWithJobAndInterviewersByJobOwnerId(1L)).thenReturn(List.of(event));

        List<InterviewResponse> result = interviewService.listInterviews(1L);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).interviewType()).isEqualTo(InterviewType.VALUES);
    }

    @Test
    void deleteInterviewRemovesTheStageEvent() {
        User owner = new User("erin", "hash");
        Source source = new Source(SourceCategory.SELF_APPLIED);
        Job job = newJob(owner, source);
        StageEvent event = new StageEvent(job, Stage.INTERVIEW_STAGE, Instant.now(), null);
        when(stageEvents.findByIdAndJob_Owner_Id(7L, 1L)).thenReturn(Optional.of(event));

        interviewService.deleteInterview(1L, 7L);

        verify(stageEvents).delete(event);
    }

    @Test
    void deleteInterviewThrowsJobNotFoundExceptionForAnotherUsersStageEvent() {
        when(stageEvents.findByIdAndJob_Owner_Id(7L, 999L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> interviewService.deleteInterview(999L, 7L))
                .isInstanceOf(JobNotFoundException.class);

        verify(stageEvents, never()).delete(any(StageEvent.class));
    }

    @Test
    void listUpcomingInterviewsQueriesTheWindowWithoutWritingToMongo() {
        User owner = new User("frank", "hash");
        Source source = new Source(SourceCategory.SELF_APPLIED);
        Job job = newJob(owner, source);
        StageEvent event = new StageEvent(job, Stage.INTERVIEW_STAGE, Instant.now(), null);
        event.applyInterviewDetails(Instant.parse("2026-08-01T12:00:00Z"), InterviewType.BEHAVIOR, null, null, List.of());
        when(stageEvents.findUpcomingWithInterviewersByJobOwnerId(eq(1L), any(Instant.class), any(Instant.class)))
                .thenReturn(List.of(event));

        List<InterviewResponse> result = interviewService.listUpcomingInterviews(1L);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).interviewType()).isEqualTo(InterviewType.BEHAVIOR);
    }

    @Test
    void listUpcomingInterviewsReturnsEmptyListWhenNoneInWindow() {
        when(stageEvents.findUpcomingWithInterviewersByJobOwnerId(eq(1L), any(Instant.class), any(Instant.class)))
                .thenReturn(List.of());

        List<InterviewResponse> result = interviewService.listUpcomingInterviews(1L);

        assertThat(result).isEmpty();
    }

    @Test
    void createInterviewSavesTheStageEventExactlyOnce() {
        User owner = new User("grace", "hash");
        Source source = new Source(SourceCategory.SELF_APPLIED);
        Job job = newJob(owner, source);
        when(jobs.findByIdAndOwnerId(10L, 1L)).thenReturn(Optional.of(job));
        when(stageEvents.save(any(StageEvent.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var request = new CreateInterviewRequest(10L, Stage.INTERVIEW_STAGE, Instant.now(),
                InterviewType.BEHAVIOR, null, null,
                List.of(new InterviewerRequest("Jordan Lee", null)));

        interviewService.createInterview(1L, request);

        // Details are set before the single save, so the stage event is persisted exactly once.
        verify(stageEvents, times(1)).save(any(StageEvent.class));
    }
}
