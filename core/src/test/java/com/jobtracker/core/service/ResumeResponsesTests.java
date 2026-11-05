package com.jobtracker.core.service;

import com.jobtracker.core.dto.ResumeResponseRate;
import com.jobtracker.core.model.Job;
import com.jobtracker.core.model.JobResume;
import com.jobtracker.core.model.Outcome;
import com.jobtracker.core.model.SourceCategory;
import com.jobtracker.core.model.Stage;
import com.jobtracker.core.model.User;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class ResumeResponsesTests {

    private static Job job(long id) {
        Job job = new Job("Initech", "Engineer", new User("owner", "hash"), SourceCategory.SELF_APPLIED,
                null, null, null, null);
        job.restoreState(Stage.RESUME_CHECK, null, Outcome.ACTIVE, Instant.parse("2026-10-01T00:00:00Z"));
        ReflectionTestUtils.setField(job, "id", id);
        return job;
    }

    // A reply is anything from the recruiter reaching out onward, even when the job later closed.
    @Test
    void countsApplicationsAndRepliesPerResumeMostRepliesFirst() {
        List<Job> jobs = List.of(job(1), job(2), job(3), job(4), job(5));
        List<JobResume> sent = List.of(new JobResume(1L, "backend.pdf"), new JobResume(2L, "backend.pdf"),
                new JobResume(3L, "general.pdf"), new JobResume(4L, "general.pdf"), new JobResume(5L, "general.pdf"));
        Map<Long, Stage> furthest = Map.of(1L, Stage.RESUME_CHECK, 2L, Stage.INTERVIEW_REQUEST,
                3L, Stage.OFFER_STAGE, 4L, Stage.INTERVIEW_STAGE, 5L, Stage.RESUME_CHECK);

        assertThat(MetricsService.resumeResponses(jobs, sent, furthest)).containsExactly(
                new ResumeResponseRate("general.pdf", 3, 2),
                new ResumeResponseRate("backend.pdf", 2, 1));
    }

    // A document left by a job in another season, or a deleted one, must not count.
    @Test
    void onlyCountsTheJobsBeingShown() {
        assertThat(MetricsService.resumeResponses(List.of(job(1)),
                List.of(new JobResume(1L, "a.pdf"), new JobResume(99L, "a.pdf")), Map.of()))
                .containsExactly(new ResumeResponseRate("a.pdf", 1, 0));
    }
}
