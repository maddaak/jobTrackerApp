package com.jobtracker.core.service;

import com.jobtracker.core.dto.CreateJobRequest;
import com.jobtracker.core.dto.JobDetailResponse;
import com.jobtracker.core.dto.JobSummaryResponse;
import com.jobtracker.core.dto.InterviewerResponse;
import com.jobtracker.core.dto.JobLinkResponse;
import com.jobtracker.core.dto.LatestInterviewSummary;
import com.jobtracker.core.dto.StageEventResponse;
import com.jobtracker.core.dto.UpdateJobRequest;
import com.jobtracker.core.exception.InvalidStageHistoryException;
import com.jobtracker.core.exception.JobNotFoundException;
import com.jobtracker.core.exception.StageEntryNotFoundException;
import com.jobtracker.core.model.InterviewRound;
import com.jobtracker.core.model.Job;
import com.jobtracker.core.model.JobDetail;
import com.jobtracker.core.model.JobJourney;
import com.jobtracker.core.model.JobLink;
import com.jobtracker.core.model.Stage;
import com.jobtracker.core.model.StageHistoryEntry;
import com.jobtracker.core.model.User;
import com.jobtracker.core.repository.JobDetailRepository;
import com.jobtracker.core.repository.JobRepository;
import com.jobtracker.core.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class JobService {

    private final JobRepository jobs;
    private final UserRepository users;
    private final JobDetailRepository jobDetails;
    private final JobDetailService jobDetailService;
    private final JobLinkService jobLinkService;
    private final JobImageService jobImageService;

    public JobService(JobRepository jobs, UserRepository users, JobDetailRepository jobDetails,
            JobDetailService jobDetailService, JobLinkService jobLinkService, JobImageService jobImageService) {
        this.jobs = jobs;
        this.users = users;
        this.jobDetails = jobDetails;
        this.jobDetailService = jobDetailService;
        this.jobLinkService = jobLinkService;
        this.jobImageService = jobImageService;
    }

    @Transactional
    public JobDetailResponse createJob(Long ownerId, CreateJobRequest request) {
        User owner = users.getReferenceById(ownerId);
        Job job = jobs.save(new Job(request.company(), request.role(), owner, request.sourceCategory(),
                request.url(), request.location(), request.compMin(), request.compMax()));

        JobDetail detail = jobDetailService.createDetail(job.getId(), ownerId, request.notes());
        detail.recordStage(Stage.RESUME_CHECK, Instant.now(), null);
        jobDetails.save(detail);

        return toDetailResponse(job, detail.getStageHistory());
    }

    public List<JobSummaryResponse> listJobs(Long ownerId) {
        List<Job> ownerJobs = jobs.findByOwnerIdOrderByCreatedAtDesc(ownerId);
        // One document per job already is the per-job grouping the flat event table had to rebuild.
        Map<Long, JobJourney> detailsByJobId = jobDetails.findJourneysByOwnerId(ownerId).stream()
                .collect(Collectors.toMap(JobJourney::jobId, Function.identity(), (a, b) -> a));
        // Targets are the owner's own jobs, already loaded, so resolving costs no query.
        Map<Long, Job> jobsById = ownerJobs.stream().collect(Collectors.toMap(Job::getId, Function.identity()));
        return ownerJobs.stream()
                .map(job -> {
                    JobJourney journey = detailsByJobId.get(job.getId());
                    return buildSummaryResponse(job,
                            latestInterview(journey == null ? List.of() : journey.interviews()),
                            jobLinkService.resolve(journey == null ? List.of() : journey.relatedJobs(), jobsById));
                })
                .toList();
    }

    public JobDetailResponse getJob(Long ownerId, Long jobId) {
        Job job = jobs.findByIdAndOwnerId(jobId, ownerId).orElseThrow(JobNotFoundException::new);
        List<StageHistoryEntry> history = jobDetails.findByJobId(jobId)
                .map(JobDetail::getStageHistory)
                .orElse(List.of());
        return toDetailResponse(job, history);
    }

    @Transactional
    public JobSummaryResponse updateJob(Long ownerId, Long jobId, UpdateJobRequest request) {
        Job job = jobs.findByIdAndOwnerId(jobId, ownerId).orElseThrow(JobNotFoundException::new);

        Stage previousStage = job.getCurrentStage();
        job.applyUpdate(request.company(), request.role(), request.sourceCategory(), request.url(),
                request.location(), request.compMin(), request.compMax(),
                request.currentStage(), request.outcome());
        jobs.save(job);

        // Postgres first, then its history entry; create the document rather than drop the transition.
        if (job.getCurrentStage() != previousStage) {
            JobDetail detail = jobDetails.findByJobId(jobId)
                    .orElseGet(() -> jobDetailService.createDetail(jobId, ownerId, null));
            detail.recordStage(job.getCurrentStage(), Instant.now(), null);
            jobDetails.save(detail);
        }

        return toSummaryResponse(job);
    }

    @Transactional
    public List<StageEventResponse> deleteStageEvent(Long ownerId, Long jobId, Instant enteredAt, Stage stage) {
        Job job = jobs.findByIdAndOwnerId(jobId, ownerId).orElseThrow(JobNotFoundException::new);
        JobDetail detail = jobDetails.findByJobId(jobId).orElseThrow(JobNotFoundException::new);
        if (detail.getStageHistory().size() <= 1) {
            throw new InvalidStageHistoryException("a job must keep at least one stage history entry");
        }
        // A miss means the modal is stale; reporting 200 would show the delete as done.
        if (!detail.removeStageEntry(enteredAt, stage)) {
            throw new StageEntryNotFoundException();
        }
        // Undo the stage that entry set; Postgres before Mongo, as updateJob does.
        job.rewindStageTo(latestStage(detail.getStageHistory()));
        jobs.save(job);
        jobDetails.save(detail);
        return toStageEvents(detail.getStageHistory());
    }

    // Safe to unwrap: the size guard runs first and removeStageEntry drops a single entry.
    private Stage latestStage(List<StageHistoryEntry> history) {
        return history.stream()
                .max(Comparator.comparing(StageHistoryEntry::getEnteredAt))
                .map(StageHistoryEntry::getStage)
                .orElseThrow();
    }

    @Transactional
    public void deleteJob(Long ownerId, Long jobId) {
        Job job = jobs.findByIdAndOwnerId(jobId, ownerId).orElseThrow(JobNotFoundException::new);
        jobs.delete(job);
        // Only the edges go; the jobs on the other end stay.
        jobLinkService.removeLinksTo(ownerId, job.getId());
        // Attachments are the biggest thing a job owns, so orphaning them would leak real space.
        jobImageService.deleteAllForJob(job.getId());
        // Last, and outside this transaction: a cascade that fails after it would roll Postgres back
        // and leave the job holding none of the history, notes, or rounds this document carries.
        jobDetailService.deleteDetail(job.getId());
    }

    private JobSummaryResponse toSummaryResponse(Job job) {
        JobDetail detail = jobDetails.findByJobId(job.getId()).orElse(null);
        List<InterviewRound> rounds = detail == null ? List.of() : detail.getInterviews();
        List<JobLink> links = detail == null ? List.of() : detail.getRelatedJobs();
        return buildSummaryResponse(job, latestInterview(rounds),
                jobLinkService.resolve(job.getOwner().getId(), links));
    }

    // Takes the rounds themselves, so the projected list and a whole document both feed it.
    private LatestInterviewSummary latestInterview(List<InterviewRound> allRounds) {
        List<InterviewRound> rounds = allRounds.stream()
                .filter(round -> round.getInterviewDateTime() != null)
                .toList();
        return rounds.stream()
                .max(Comparator.comparing(InterviewRound::getInterviewDateTime))
                .map(round -> new LatestInterviewSummary(round.getRoundId(), round.getInterviewDateTime(),
                        round.getInterviewType(), rounds.size(), round.getMeetingLink(), round.getLocation(),
                        round.getInterviewers().stream()
                                .map(i -> new InterviewerResponse(i.getName(), i.getLinkedInUrl()))
                                .toList()))
                .orElse(null);
    }

    private JobSummaryResponse buildSummaryResponse(Job job, LatestInterviewSummary latestInterview,
            List<JobLinkResponse> links) {
        return new JobSummaryResponse(
                job.getId(), job.getCompany(), job.getRole(), job.getSourceCategory(),
                job.getCurrentStage(), job.getOutcome(), job.getUrl(), job.getLocation(),
                job.getCompMin(), job.getCompMax(), job.getCreatedAt(), latestInterview, links);
    }

    private List<StageEventResponse> toStageEvents(List<StageHistoryEntry> history) {
        return history.stream()
                .sorted(Comparator.comparing(StageHistoryEntry::getEnteredAt))
                .map(e -> new StageEventResponse(e.getStage(), e.getEnteredAt(), e.getNote()))
                .toList();
    }

    private JobDetailResponse toDetailResponse(Job job, List<StageHistoryEntry> history) {
        List<StageEventResponse> eventResponses = toStageEvents(history);
        return new JobDetailResponse(
                job.getId(), job.getCompany(), job.getRole(), job.getSourceCategory(),
                job.getCurrentStage(), job.getOutcome(), job.getUrl(), job.getLocation(),
                job.getCompMin(), job.getCompMax(), job.getCreatedAt(), eventResponses);
    }
}
