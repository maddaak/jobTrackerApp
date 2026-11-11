package com.jobtracker.core.service;

import com.jobtracker.core.dto.ContactRequest;
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
import java.util.List;
import java.util.Map;

@Service
public class JobDetailService {

    private final JobRepository jobs;
    private final JobDetailRepository jobDetails;
    private final JobLinkService jobLinkService;

    public JobDetailService(JobRepository jobs, JobDetailRepository jobDetails, JobLinkService jobLinkService) {
        this.jobs = jobs;
        this.jobDetails = jobDetails;
        this.jobLinkService = jobLinkService;
    }

    public JobDetailDocumentResponse getDetail(Long ownerId, Long jobId) {
        requireOwnedJob(ownerId, jobId);
        return loadDetail(ownerId, jobId);
    }

    // Skips the ownership query when the caller already holds an ownership-checked job.
    public JobDetailDocumentResponse getDetail(Job ownedJob) {
        return loadDetail(ownedJob.getOwner().getId(), ownedJob.getId());
    }

    private JobDetailDocumentResponse loadDetail(Long ownerId, Long jobId) {
        return jobDetails.findByJobId(jobId)
                .map(detail -> toResponse(ownerId, detail))
                .orElse(new JobDetailDocumentResponse(jobId, "", "", null, null, null, List.of(), Map.of(), List.of(), null));
    }

    // Created with the job so every job has a document for its stage history from the start.
    public JobDetail createDetail(Long jobId, Long ownerId, String notes) {
        JobDetail detail = new JobDetail(jobId, ownerId);
        detail.setNotes(notes);
        return jobDetails.save(detail);
    }

    public JobDetailDocumentResponse updateDetail(Long ownerId, Long jobId, UpdateJobDetailRequest request) {
        Job job = requireOwnedJob(ownerId, jobId);
        try {
            return toResponse(ownerId, saveDetail(job, request));
        } catch (DuplicateKeyException race) {
            // Lost a first-save race on the jobId unique index; retry against the now-existing doc.
            return toResponse(ownerId, saveDetail(job, request));
        }
    }

    private JobDetail saveDetail(Job job, UpdateJobDetailRequest request) {
        JobDetail detail = jobDetails.findByJobId(job.getId())
                .orElseGet(() -> new JobDetail(job.getId(), job.getOwner().getId()));
        // Every field: null means leave alone, "" means clear, so a caller sends only what it changes.
        if (request.jdText() != null) {
            detail.setJdTextCompressed(Gzip.compress(request.jdText()));
        }
        if (request.interviewNotes() != null) {
            detail.setInterviewNotes(request.interviewNotes());
        }
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
        if (request.contacts() != null) {
            detail.setContacts(request.contacts().stream().map(ContactRequest::toContact).toList());
        }
        if (request.sentResume() != null) {
            detail.setSentResume(request.sentResume());
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

    private JobDetailDocumentResponse toResponse(Long ownerId, JobDetail detail) {
        return new JobDetailDocumentResponse(
                detail.getJobId(), Gzip.decompress(detail.getJdTextCompressed()), detail.getInterviewNotes(),
                detail.getRecommendedResume(), detail.getNotes(), detail.getRejectedReason(),
                jobLinkService.resolve(ownerId, detail.getRelatedJobs()), detail.getAiResults(), detail.getContacts(),
                detail.getSentResume());
    }
}
