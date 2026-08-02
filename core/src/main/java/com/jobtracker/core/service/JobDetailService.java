package com.jobtracker.core.service;

import com.jobtracker.core.dto.JobDetailDocumentResponse;
import com.jobtracker.core.dto.UpdateJobDetailRequest;
import com.jobtracker.core.exception.JobNotFoundException;
import com.jobtracker.core.model.JobDetail;
import com.jobtracker.core.repository.JobDetailRepository;
import com.jobtracker.core.repository.JobRepository;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

@Service
public class JobDetailService {

    private final JobRepository jobs;
    private final JobDetailRepository jobDetails;

    public JobDetailService(JobRepository jobs, JobDetailRepository jobDetails) {
        this.jobs = jobs;
        this.jobDetails = jobDetails;
    }

    public JobDetailDocumentResponse getDetail(Long ownerId, Long jobId) {
        requireOwnedJob(ownerId, jobId);
        return jobDetails.findByJobId(jobId)
                .map(this::toResponse)
                .orElse(new JobDetailDocumentResponse(jobId, "", "", null));
    }

    public JobDetailDocumentResponse updateDetail(Long ownerId, Long jobId, UpdateJobDetailRequest request) {
        requireOwnedJob(ownerId, jobId);
        try {
            return toResponse(saveDetail(jobId, request));
        } catch (DuplicateKeyException race) {
            // Two concurrent first-time saves for this jobId both built a new document and raced
            // on the jobId unique index. The loser retries against the now-existing document so
            // its edit merges in, instead of surfacing as a 409 that drops the write.
            return toResponse(saveDetail(jobId, request));
        }
    }

    private JobDetail saveDetail(Long jobId, UpdateJobDetailRequest request) {
        JobDetail detail = jobDetails.findByJobId(jobId)
                .orElseGet(() -> new JobDetail(jobId, Gzip.compress(""), ""));
        detail.update(Gzip.compress(request.jdText()), request.interviewNotes());
        // Preserve-if-null: a later save that omits the recommendation (sends null),
        // e.g. the details modal saving only jd/notes, must not wipe an existing value.
        if (request.recommendedResume() != null) {
            detail.setRecommendedResume(request.recommendedResume());
        }
        return jobDetails.save(detail);
    }

    // Called from the job-delete cascade after ownership is already verified there. A no-op
    // when no document exists.
    public void deleteDetail(Long jobId) {
        jobDetails.deleteByJobId(jobId);
    }

    private void requireOwnedJob(Long ownerId, Long jobId) {
        jobs.findByIdAndOwnerId(jobId, ownerId).orElseThrow(JobNotFoundException::new);
    }

    private JobDetailDocumentResponse toResponse(JobDetail detail) {
        return new JobDetailDocumentResponse(
                detail.getJobId(), Gzip.decompress(detail.getJdTextCompressed()), detail.getInterviewNotes(),
                detail.getRecommendedResume());
    }
}
