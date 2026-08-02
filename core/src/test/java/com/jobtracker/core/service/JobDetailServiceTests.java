package com.jobtracker.core.service;

import com.jobtracker.core.dto.JobDetailDocumentResponse;
import com.jobtracker.core.dto.UpdateJobDetailRequest;
import com.jobtracker.core.exception.JobNotFoundException;
import com.jobtracker.core.model.*;
import com.jobtracker.core.repository.JobDetailRepository;
import com.jobtracker.core.repository.JobRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class JobDetailServiceTests {

    @Mock
    private JobRepository jobs;

    @Mock
    private JobDetailRepository jobDetails;

    private JobDetailService jobDetailService;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        jobDetailService = new JobDetailService(jobs, jobDetails);
    }

    private Job newJob(User owner, Source source) {
        return new Job("Acme", "Engineer", owner, source, null, null, null, null, null);
    }

    @Test
    void getDetailReturnsBlanksWhenNoDocumentExistsYet() {
        User owner = new User("alice", "hash");
        Source source = new Source(SourceCategory.SELF_APPLIED);
        Job job = newJob(owner, source);
        when(jobs.findByIdAndOwnerId(10L, 1L)).thenReturn(Optional.of(job));
        when(jobDetails.findByJobId(10L)).thenReturn(Optional.empty());

        JobDetailDocumentResponse response = jobDetailService.getDetail(1L, 10L);

        assertThat(response.jobId()).isEqualTo(10L);
        assertThat(response.jdText()).isEmpty();
        assertThat(response.interviewNotes()).isEmpty();
    }

    @Test
    void getDetailThrowsJobNotFoundExceptionForAnotherUsersJob() {
        when(jobs.findByIdAndOwnerId(10L, 999L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> jobDetailService.getDetail(999L, 10L))
                .isInstanceOf(JobNotFoundException.class);
    }

    @Test
    void updateDetailCompressesJdTextAndDecompressesItBackOnRead() {
        User owner = new User("bob", "hash");
        Source source = new Source(SourceCategory.SELF_APPLIED);
        Job job = newJob(owner, source);
        when(jobs.findByIdAndOwnerId(10L, 1L)).thenReturn(Optional.of(job));
        when(jobDetails.findByJobId(10L)).thenReturn(Optional.empty());
        when(jobDetails.save(any(JobDetail.class))).thenAnswer(invocation -> invocation.getArgument(0));

        String longJdText = "We are hiring a Senior Engineer. ".repeat(50);
        var request = new UpdateJobDetailRequest(longJdText, "asked about system design", null);

        JobDetailDocumentResponse response = jobDetailService.updateDetail(1L, 10L, request);

        assertThat(response.jdText()).isEqualTo(longJdText);
        assertThat(response.interviewNotes()).isEqualTo("asked about system design");

        ArgumentCaptor<JobDetail> captor = ArgumentCaptor.forClass(JobDetail.class);
        verify(jobDetails).save(captor.capture());
        byte[] stored = captor.getValue().getJdTextCompressed();
        assertThat(stored.length).isLessThan(longJdText.getBytes().length);
    }

    @Test
    void updateDetailThrowsJobNotFoundExceptionForAnotherUsersJob() {
        when(jobs.findByIdAndOwnerId(10L, 999L)).thenReturn(Optional.empty());
        var request = new UpdateJobDetailRequest("text", "interview notes", null);

        assertThatThrownBy(() -> jobDetailService.updateDetail(999L, 10L, request))
                .isInstanceOf(JobNotFoundException.class);

        verify(jobDetails, never()).save(any());
    }

    @Test
    void updateDetailOverwritesAnExistingDocument() {
        User owner = new User("carol", "hash");
        Source source = new Source(SourceCategory.SELF_APPLIED);
        Job job = newJob(owner, source);
        when(jobs.findByIdAndOwnerId(10L, 1L)).thenReturn(Optional.of(job));
        JobDetail existing = new JobDetail(10L, new byte[0], "old interview notes");
        when(jobDetails.findByJobId(10L)).thenReturn(Optional.of(existing));
        when(jobDetails.save(any(JobDetail.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var request = new UpdateJobDetailRequest("new jd text", "new interview notes", null);
        JobDetailDocumentResponse response = jobDetailService.updateDetail(1L, 10L, request);

        assertThat(response.jdText()).isEqualTo("new jd text");
        assertThat(response.interviewNotes()).isEqualTo("new interview notes");
        ArgumentCaptor<JobDetail> captor = ArgumentCaptor.forClass(JobDetail.class);
        verify(jobDetails).save(captor.capture());
        assertThat(captor.getValue()).isSameAs(existing);
    }

    @Test
    void recommendedResumeIsPersistedPreservedWhenNullAndReturnedByGetDetail() {
        User owner = new User("dave", "hash");
        Source source = new Source(SourceCategory.SELF_APPLIED);
        Job job = newJob(owner, source);
        when(jobs.findByIdAndOwnerId(10L, 1L)).thenReturn(Optional.of(job));
        when(jobDetails.save(any(JobDetail.class))).thenAnswer(invocation -> invocation.getArgument(0));

        // Simulate the stored document evolving across saves.
        JobDetail stored = new JobDetail(10L, new byte[0], "");
        when(jobDetails.findByJobId(10L)).thenReturn(Optional.of(stored));

        // (a) A save with a non-null recommendedResume persists and returns it.
        var withResume = new UpdateJobDetailRequest("jd", "notes", "backend-resume.pdf");
        JobDetailDocumentResponse first = jobDetailService.updateDetail(1L, 10L, withResume);
        assertThat(first.recommendedResume()).isEqualTo("backend-resume.pdf");
        assertThat(stored.getRecommendedResume()).isEqualTo("backend-resume.pdf");

        // (b) A later save omitting it (null) must keep the previously-saved value.
        var withoutResume = new UpdateJobDetailRequest("edited jd", "edited notes", null);
        JobDetailDocumentResponse second = jobDetailService.updateDetail(1L, 10L, withoutResume);
        assertThat(second.recommendedResume()).isEqualTo("backend-resume.pdf");
        assertThat(stored.getRecommendedResume()).isEqualTo("backend-resume.pdf");

        // (c) getDetail returns the persisted recommendation.
        JobDetailDocumentResponse read = jobDetailService.getDetail(1L, 10L);
        assertThat(read.recommendedResume()).isEqualTo("backend-resume.pdf");
    }
}
