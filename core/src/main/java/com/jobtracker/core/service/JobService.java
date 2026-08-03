package com.jobtracker.core.service;

import com.jobtracker.core.dto.CreateJobRequest;
import com.jobtracker.core.dto.JobDetailResponse;
import com.jobtracker.core.dto.JobSummaryResponse;
import com.jobtracker.core.dto.InterviewerResponse;
import com.jobtracker.core.dto.LatestInterviewSummary;
import com.jobtracker.core.dto.StageEventResponse;
import com.jobtracker.core.dto.UpdateJobRequest;
import com.jobtracker.core.exception.JobNotFoundException;
import com.jobtracker.core.model.Job;
import com.jobtracker.core.model.Outcome;
import com.jobtracker.core.model.Source;
import com.jobtracker.core.model.Stage;
import com.jobtracker.core.model.StageEvent;
import com.jobtracker.core.model.User;
import com.jobtracker.core.repository.JobRepository;
import com.jobtracker.core.repository.SourceRepository;
import com.jobtracker.core.repository.StageEventRepository;
import com.jobtracker.core.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class JobService {

    private final JobRepository jobs;
    private final SourceRepository sources;
    private final StageEventRepository stageEvents;
    private final UserRepository users;
    private final JobDetailService jobDetails;

    public JobService(JobRepository jobs, SourceRepository sources,
            StageEventRepository stageEvents, UserRepository users, JobDetailService jobDetails) {
        this.jobs = jobs;
        this.sources = sources;
        this.stageEvents = stageEvents;
        this.users = users;
        this.jobDetails = jobDetails;
    }

    @Transactional
    public JobDetailResponse createJob(Long ownerId, CreateJobRequest request) {
        User owner = users.getReferenceById(ownerId);
        Source source = sources.save(new Source(request.sourceCategory()));
        Job job = jobs.save(new Job(request.company(), request.role(), owner, source,
                request.url(), request.location(), request.compMin(), request.compMax(), request.notes()));
        StageEvent initialEvent = stageEvents.save(
                new StageEvent(job, Stage.RESUME_CHECK, Instant.now(), null));

        return toDetailResponse(job, List.of(initialEvent));
    }

    public List<JobSummaryResponse> listJobs(Long ownerId) {
        // Fetch-joins source so buildSummaryResponse's job.getSource() fires no per-job select.
        List<Job> ownerJobs = jobs.findByOwnerIdWithSourceOrderByCreatedAtDesc(ownerId);
        // One batched query for all interview history instead of 2-3 per job.
        Map<Long, List<StageEvent>> interviewsByJobId = stageEvents
                .findAllWithInterviewersByJobOwnerId(ownerId).stream()
                .collect(Collectors.groupingBy(e -> e.getJob().getId()));
        return ownerJobs.stream()
                .map(job -> toSummaryResponse(job, interviewsByJobId.getOrDefault(job.getId(), List.of())))
                .toList();
    }

    public JobDetailResponse getJob(Long ownerId, Long jobId) {
        Job job = jobs.findByIdAndOwnerId(jobId, ownerId).orElseThrow(JobNotFoundException::new);
        List<StageEvent> events = stageEvents.findByJobIdOrderByEnteredAtAsc(jobId);
        return toDetailResponse(job, events);
    }

    @Transactional
    public JobSummaryResponse updateJob(Long ownerId, Long jobId, UpdateJobRequest request) {
        Job job = jobs.findByIdAndOwnerId(jobId, ownerId).orElseThrow(JobNotFoundException::new);

        Stage previousStage = job.getCurrentStage();
        String effectiveRejectedReason =
                request.outcome() == Outcome.REJECTED ? request.rejectedReason() : null;

        job.getSource().setCategory(request.sourceCategory());
        job.applyUpdate(request.company(), request.role(), request.url(), request.location(),
                request.compMin(), request.compMax(), request.notes(), effectiveRejectedReason,
                request.currentStage(), request.outcome());
        jobs.save(job);

        if (request.currentStage() != previousStage) {
            stageEvents.save(new StageEvent(job, request.currentStage(), Instant.now(), null));
        }

        return toSummaryResponse(job);
    }

    @Transactional
    public void deleteJob(Long ownerId, Long jobId) {
        Job job = jobs.findByIdAndOwnerId(jobId, ownerId).orElseThrow(JobNotFoundException::new);
        Source source = job.getSource();
        stageEvents.deleteByJobId(job.getId());
        jobs.delete(job);
        // Each job owns a dedicated Source; flush the job delete first so the FK is gone before it.
        jobs.flush();
        sources.delete(source);
        // JobDetail lives in Mongo, outside this transaction, so delete it explicitly.
        jobDetails.deleteDetail(job.getId());
    }

    // Single-job path (create/update): targeted queries are fine since it never runs per-row.
    private JobSummaryResponse toSummaryResponse(Job job) {
        LatestInterviewSummary latestInterview = stageEvents
                .findTopByJobIdAndInterviewDateTimeIsNotNullOrderByInterviewDateTimeDesc(job.getId())
                .map(e -> buildLatestInterviewSummary(e, stageEvents.countByJobIdAndInterviewDateTimeIsNotNull(job.getId())))
                .orElse(null);
        return buildSummaryResponse(job, latestInterview);
    }

    // List path: interviewEvents is a slice of listJobs' batched query, so this fires zero queries.
    private JobSummaryResponse toSummaryResponse(Job job, List<StageEvent> interviewEvents) {
        LatestInterviewSummary latestInterview = interviewEvents.stream()
                .max(Comparator.comparing(StageEvent::getInterviewDateTime))
                .map(e -> buildLatestInterviewSummary(e, (long) interviewEvents.size()))
                .orElse(null);
        return buildSummaryResponse(job, latestInterview);
    }

    private LatestInterviewSummary buildLatestInterviewSummary(StageEvent e, long roundCount) {
        return new LatestInterviewSummary(e.getId(), e.getInterviewDateTime(), e.getInterviewType(), roundCount,
                e.getMeetingLink(), e.getLocation(), e.getInterviewers().stream()
                        .map(i -> new InterviewerResponse(i.getId(), i.getName(), i.getLinkedInUrl()))
                        .toList());
    }

    private JobSummaryResponse buildSummaryResponse(Job job, LatestInterviewSummary latestInterview) {
        return new JobSummaryResponse(
                job.getId(), job.getCompany(), job.getRole(),
                job.getSource().getCategory(),
                job.getCurrentStage(), job.getOutcome(), job.getUrl(), job.getLocation(),
                job.getCompMin(), job.getCompMax(), job.getRejectedReason(), job.getNotes(), job.getCreatedAt(),
                latestInterview);
    }

    private JobDetailResponse toDetailResponse(Job job, List<StageEvent> events) {
        List<StageEventResponse> eventResponses = events.stream()
                .map(e -> new StageEventResponse(e.getStage(), e.getEnteredAt(), e.getNote()))
                .toList();
        return new JobDetailResponse(
                job.getId(), job.getCompany(), job.getRole(),
                job.getSource().getCategory(),
                job.getCurrentStage(), job.getOutcome(), job.getUrl(), job.getLocation(),
                job.getCompMin(), job.getCompMax(), job.getRejectedReason(), job.getNotes(), job.getCreatedAt(),
                eventResponses);
    }
}
