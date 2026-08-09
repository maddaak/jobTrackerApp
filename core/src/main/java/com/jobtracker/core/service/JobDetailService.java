package com.jobtracker.core.service;

import com.jobtracker.core.dto.JobDetailDocumentResponse;
import com.jobtracker.core.dto.UpdateJobDetailRequest;
import com.jobtracker.core.exception.JobNotFoundException;
import com.jobtracker.core.model.Job;
import com.jobtracker.core.model.JobDetail;
import com.jobtracker.core.model.Outcome;
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
        return loadDetail(jobId);
    }

    // Skips the ownership query when the caller already holds an ownership-checked job.
    public JobDetailDocumentResponse getDetail(Job ownedJob) {
        return loadDetail(ownedJob.getId());
    }

    private JobDetailDocumentResponse loadDetail(Long jobId) {
        return jobDetails.findByJobId(jobId)
                .map(this::toResponse)
                .orElse(new JobDetailDocumentResponse(jobId, "", "", null, null, null));
    }

    // Created with the job so every job has a document for its stage history from the start.
    public JobDetail createDetail(Long jobId, Long ownerId, String notes) {
        JobDetail detail = new JobDetail(jobId, ownerId, Gzip.compress(""), "");
        detail.setNotes(notes);
        return jobDetails.save(detail);
    }

    public JobDetailDocumentResponse updateDetail(Long ownerId, Long jobId, UpdateJobDetailRequest request) {
        Job job = requireOwnedJob(ownerId, jobId);
        try {
            return toResponse(saveDetail(job, request));
        } catch (DuplicateKeyException race) {
            // Lost a first-save race on the jobId unique index; retry against the now-existing doc.
            return toResponse(saveDetail(job, request));
        }
    }

    private JobDetail saveDetail(Job job, UpdateJobDetailRequest request) {
        JobDetail detail = jobDetails.findByJobId(job.getId())
                .orElseGet(() -> new JobDetail(job.getId(), job.getOwner().getId(), Gzip.compress(""), ""));
        detail.update(Gzip.compress(request.jdText()), request.interviewNotes());
        // null means leave alone, "" means clear: AddJobForm's follow-up save sends neither.
        if (request.recommendedResume() != null) {
            detail.setRecommendedResume(request.recommendedResume());
        }
        if (request.notes() != null) {
            detail.setNotes(request.notes());
        }
        // Enforced here, not in the UI, so a direct PUT can't strand a reason on an active job.
        if (request.rejectedReason() != null) {
            detail.setRejectedReason(job.getOutcome() == Outcome.REJECTED ? request.rejectedReason() : null);
        }
        return jobDetails.save(detail);
    }

    // Called from the job-delete cascade, where ownership is already verified.
    public void deleteDetail(Long jobId) {
        jobDetails.deleteByJobId(jobId);
    }

    private Job requireOwnedJob(Long ownerId, Long jobId) {
        return jobs.findByIdAndOwnerId(jobId, ownerId).orElseThrow(JobNotFoundException::new);
    }

    private JobDetailDocumentResponse toResponse(JobDetail detail) {
        return new JobDetailDocumentResponse(
                detail.getJobId(), Gzip.decompress(detail.getJdTextCompressed()), detail.getInterviewNotes(),
                detail.getRecommendedResume(), detail.getNotes(), detail.getRejectedReason());
    }
}
