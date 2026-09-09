package com.jobtracker.core.service;

import com.jobtracker.core.dto.JobLinkResponse;
import com.jobtracker.core.exception.InvalidJobLinkException;
import com.jobtracker.core.exception.JobNotFoundException;
import com.jobtracker.core.model.Job;
import com.jobtracker.core.model.JobDetail;
import com.jobtracker.core.model.JobLink;
import com.jobtracker.core.model.JobRelation;
import com.jobtracker.core.repository.JobDetailRepository;
import com.jobtracker.core.repository.JobRepository;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class JobLinkService {

    private final JobRepository jobs;
    private final JobDetailRepository jobDetails;

    public JobLinkService(JobRepository jobs, JobDetailRepository jobDetails) {
        this.jobs = jobs;
        this.jobDetails = jobDetails;
    }

    public List<JobLinkResponse> link(Long ownerId, Long jobId, Long targetJobId, JobRelation relation) {
        if (jobId.equals(targetJobId)) {
            throw new InvalidJobLinkException("a job cannot be linked to itself");
        }
        // Both owned, so a guessed target id can't attach another user's job.
        requireOwnedJob(ownerId, jobId);
        requireOwnedJob(ownerId, targetJobId);

        // linkTo replaces rather than appends, so a rollback has to put back what was replaced.
        JobRelation replaced = currentRelation(jobId, targetJobId);
        writeEdge(ownerId, jobId, targetJobId, relation);
        try {
            writeEdge(ownerId, targetJobId, jobId, relation.inverse());
        } catch (RuntimeException e) {
            // No transaction across two documents, so undo the first rather than leave a one-sided link.
            if (replaced == null) {
                removeEdge(ownerId, jobId, targetJobId);
            } else {
                writeEdge(ownerId, jobId, targetJobId, replaced);
            }
            throw e;
        }
        return linksOf(ownerId, jobId);
    }

    public List<JobLinkResponse> unlink(Long ownerId, Long jobId, Long targetJobId) {
        requireOwnedJob(ownerId, jobId);
        // Target end first: if the second write fails the link is still listed here, so retrying heals it.
        removeEdge(ownerId, targetJobId, jobId);
        removeEdge(ownerId, jobId, targetJobId);
        return linksOf(ownerId, jobId);
    }

    // Delete cascade: only the edge goes, never the job on the other end.
    public void removeLinksTo(Long ownerId, Long jobId) {
        for (JobDetail detail : jobDetails.findByOwnerIdAndRelatedJobsJobId(ownerId, jobId)) {
            detail.unlinkFrom(jobId);
            jobDetails.save(detail);
        }
    }

    // One query; the table already holds its jobs and uses the map overload.
    public List<JobLinkResponse> resolve(Long ownerId, List<JobLink> links) {
        List<Long> targetIds = links.stream().map(JobLink::getJobId).toList();
        Map<Long, Job> targetsById = jobs.findAllById(targetIds).stream()
                .filter(job -> job.getOwner().getId().equals(ownerId))
                .collect(Collectors.toMap(Job::getId, Function.identity()));
        return resolve(links, targetsById);
    }

    // A missing target is a deleted job; drop the dangling edge.
    public List<JobLinkResponse> resolve(List<JobLink> links, Map<Long, Job> targetsById) {
        return links.stream()
                .map(link -> {
                    Job target = targetsById.get(link.getJobId());
                    return target == null ? null : new JobLinkResponse(
                            target.getId(), target.getCompany(), target.getRole(), link.getRelation());
                })
                .filter(Objects::nonNull)
                .toList();
    }

    private List<JobLinkResponse> linksOf(Long ownerId, Long jobId) {
        List<JobLink> links = jobDetails.findByJobId(jobId).map(JobDetail::getRelatedJobs).orElse(List.of());
        return resolve(ownerId, links);
    }

    private void writeEdge(Long ownerId, Long jobId, Long otherJobId, JobRelation relation) {
        JobDetail detail = jobDetails.findByJobId(jobId)
                .orElseGet(() -> new JobDetail(jobId, ownerId, Gzip.compress(""), ""));
        detail.linkTo(otherJobId, relation);
        jobDetails.save(detail);
    }

    private JobRelation currentRelation(Long jobId, Long otherJobId) {
        return jobDetails.findByJobId(jobId).stream()
                .flatMap(detail -> detail.getRelatedJobs().stream())
                .filter(link -> link.getJobId().equals(otherJobId))
                .map(JobLink::getRelation)
                .findFirst()
                .orElse(null);
    }

    // Owner-scoped: a guessed target id must not reach another user's document.
    private void removeEdge(Long ownerId, Long jobId, Long otherJobId) {
        jobDetails.findByJobIdAndOwnerId(jobId, ownerId).ifPresent(detail -> {
            detail.unlinkFrom(otherJobId);
            jobDetails.save(detail);
        });
    }

    private Job requireOwnedJob(Long ownerId, Long jobId) {
        return jobs.findByIdAndOwnerId(jobId, ownerId).orElseThrow(JobNotFoundException::new);
    }
}
