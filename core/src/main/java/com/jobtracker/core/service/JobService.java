package com.jobtracker.core.service;

import com.jobtracker.core.dto.CreateJobRequest;
import com.jobtracker.core.dto.JobDetailResponse;
import com.jobtracker.core.dto.JobSummaryResponse;
import com.jobtracker.core.dto.InterviewerResponse;
import com.jobtracker.core.dto.LatestInterviewSummary;
import com.jobtracker.core.dto.StageEventResponse;
import com.jobtracker.core.dto.UpdateJobRequest;
import com.jobtracker.core.exception.JobNotFoundException;
import com.jobtracker.core.model.InterviewRound;
import com.jobtracker.core.model.Job;
import com.jobtracker.core.model.JobDetail;
import com.jobtracker.core.model.JobJourney;
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

    public JobService(JobRepository jobs, UserRepository users, JobDetailRepository jobDetails,
            JobDetailService jobDetailService) {
        this.jobs = jobs;
        this.users = users;
        this.jobDetails = jobDetails;
        this.jobDetailService = jobDetailService;
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
        return ownerJobs.stream()
                .map(job -> {
                    JobJourney journey = detailsByJobId.get(job.getId());
                    return buildSummaryResponse(job,
                            latestInterview(journey == null ? List.of() : journey.interviews()));
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
    public void deleteJob(Long ownerId, Long jobId) {
        Job job = jobs.findByIdAndOwnerId(jobId, ownerId).orElseThrow(JobNotFoundException::new);
        jobs.delete(job);
        // JobDetail lives in Mongo, outside this transaction, so delete it explicitly.
        jobDetailService.deleteDetail(job.getId());
    }

    private JobSummaryResponse toSummaryResponse(Job job) {
        List<InterviewRound> rounds = jobDetails.findByJobId(job.getId())
                .map(JobDetail::getInterviews)
                .orElse(List.of());
        return buildSummaryResponse(job, latestInterview(rounds));
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

    private JobSummaryResponse buildSummaryResponse(Job job, LatestInterviewSummary latestInterview) {
        return new JobSummaryResponse(
                job.getId(), job.getCompany(), job.getRole(), job.getSourceCategory(),
                job.getCurrentStage(), job.getOutcome(), job.getUrl(), job.getLocation(),
                job.getCompMin(), job.getCompMax(), job.getCreatedAt(), latestInterview);
    }

    private JobDetailResponse toDetailResponse(Job job, List<StageHistoryEntry> history) {
        List<StageEventResponse> eventResponses = history.stream()
                .sorted(Comparator.comparing(StageHistoryEntry::getEnteredAt))
                .map(e -> new StageEventResponse(e.getStage(), e.getEnteredAt(), e.getNote()))
                .toList();
        return new JobDetailResponse(
                job.getId(), job.getCompany(), job.getRole(), job.getSourceCategory(),
                job.getCurrentStage(), job.getOutcome(), job.getUrl(), job.getLocation(),
                job.getCompMin(), job.getCompMax(), job.getCreatedAt(), eventResponses);
    }
}
