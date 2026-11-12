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
import com.jobtracker.core.model.InterviewPhase;
import com.jobtracker.core.model.InterviewRound;
import com.jobtracker.core.model.InterviewType;
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
import java.time.Clock;
import java.time.Instant;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
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
    private final SeasonService seasons;
    private final Clock clock;

    public JobService(JobRepository jobs, UserRepository users, JobDetailRepository jobDetails,
            JobDetailService jobDetailService, JobLinkService jobLinkService, JobImageService jobImageService,
            SeasonService seasons, Clock clock) {
        this.jobs = jobs;
        this.users = users;
        this.jobDetails = jobDetails;
        this.jobDetailService = jobDetailService;
        this.jobLinkService = jobLinkService;
        this.jobImageService = jobImageService;
        this.seasons = seasons;
        this.clock = clock;
    }

    @Transactional
    public JobDetailResponse createJob(Long ownerId, CreateJobRequest request) {
        User owner = users.getReferenceById(ownerId);
        Job unsaved = new Job(request.company(), request.role(), owner, request.sourceCategory(),
                request.url(), request.location(), request.compMin(), request.compMax());
        unsaved.setCity(request.city());
        unsaved.moveToSeason(seasons.seasonForNewJob(ownerId));
        Job job = jobs.save(unsaved);

        JobDetail detail = jobDetailService.createDetail(job.getId(), ownerId, request.notes());
        if (request.jdText() != null) {
            detail.setJdTextCompressed(Gzip.compress(request.jdText()));
        }
        detail.setRecommendedResume(request.recommendedResume());
        Instant now = clock.instant();
        detail.recordStage(Stage.RESUME_CHECK, now, null);
        // Recorded as a second step, so the funnel still counts the job as having applied first.
        if (request.startingStage() == Stage.INTERVIEW_REQUEST) {
            job.advanceStageIfFurther(Stage.INTERVIEW_REQUEST);
            jobs.save(job);
            detail.recordStage(Stage.INTERVIEW_REQUEST, now.plusMillis(1), null);
        }
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
                .filter(seasons.inView(ownerId))
                .map(job -> {
                    JobJourney journey = detailsByJobId.get(job.getId());
                    return buildSummaryResponse(job, journey == null ? List.of() : journey.interviews(),
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
        seasons.requireOpen(job.getSeasonId());

        Stage previousStage = job.getCurrentStage();
        job.applyUpdate(request.company(), request.role(), request.sourceCategory(), request.url(),
                request.location(), request.compMin(), request.compMax(),
                request.currentStage(), request.interviewPhase(), request.outcome());
        job.setCity(request.city());
        JobDetail detail = jobDetails.findByJobId(jobId)
                .orElseGet(() -> jobDetailService.createDetail(jobId, ownerId, null));
        // Reopening a closed job puts it back where it stood; left at Finalized, no page would show it.
        if (job.getCurrentStage() == Stage.FINALIZED && !job.getOutcome().closesPipeline()) {
            job.rewindStageTo(stageBefore(detail.getStageHistory(), EnumSet.of(Stage.FINALIZED))
                    .orElse(Stage.RESUME_CHECK));
        }
        // Unticking Waiting means "no longer waiting", not "interviewing": a job that was only contacted
        // goes back to Contacted rather than gaining an Interview Stage it never had.
        if (previousStage == Stage.WAITING_INTERVIEW_RESULTS && job.getCurrentStage() == Stage.INTERVIEW_STAGE) {
            stageBefore(detail.getStageHistory(), EnumSet.of(Stage.WAITING_INTERVIEW_RESULTS, Stage.FINALIZED))
                    .filter(earlier -> earlier.ordinal() < Stage.INTERVIEW_STAGE.ordinal())
                    .ifPresent(job::rewindStageTo);
        }
        jobs.save(job);

        // Postgres first: a failed second write costs a history entry, not a wrong stage in the grid.
        if (job.getCurrentStage() != previousStage) {
            detail.recordStage(job.getCurrentStage(), clock.instant(), null);
            jobDetails.save(detail);
        }

        return buildSummaryResponse(job, detail.getInterviews(),
                jobLinkService.resolve(ownerId, detail.getRelatedJobs()));
    }

    // Where the job stood before it entered the skipped stages: the newest entry that isn't one of them.
    private Optional<Stage> stageBefore(List<StageHistoryEntry> history, Set<Stage> skipped) {
        return history.stream()
                .filter(entry -> !skipped.contains(entry.getStage()))
                .max(Comparator.comparing(StageHistoryEntry::getEnteredAt))
                .map(StageHistoryEntry::getStage);
    }

    @Transactional
    public List<StageEventResponse> deleteStageEvent(Long ownerId, Long jobId, Instant enteredAt, Stage stage) {
        Job job = jobs.findByIdAndOwnerId(jobId, ownerId).orElseThrow(JobNotFoundException::new);
        seasons.requireOpen(job.getSeasonId());
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
        seasons.requireOpen(job.getSeasonId());
        jobs.delete(job);
        // Only the edges go; the jobs on the other end stay.
        jobLinkService.removeLinksTo(ownerId, job.getId());
        // Attachments are the biggest thing a job owns, so orphaning them would leak real space.
        jobImageService.deleteAllForJob(job.getId());
        // Last, and outside this transaction: a cascade that fails after it would roll Postgres back
        // and leave the job holding none of the history, notes, or rounds this document carries.
        jobDetailService.deleteDetail(job.getId());
    }

    // Takes the rounds themselves, so the projected list and a whole document both feed it.
    private LatestInterviewSummary latestInterview(List<InterviewRound> allRounds) {
        long dated = allRounds.stream().filter(round -> round.getInterviewDateTime() != null).count();
        return InterviewRound.latest(allRounds)
                .map(round -> new LatestInterviewSummary(round.getRoundId(), round.getInterviewDateTime(),
                        round.getInterviewEndDateTime(), round.getInterviewType(), dated,
                        round.getMeetingLink(), round.getLocation(),
                        round.getInterviewers().stream()
                                .map(i -> new InterviewerResponse(i.getName(), i.getLinkedInUrl()))
                                .toList()))
                .orElse(null);
    }

    private JobSummaryResponse buildSummaryResponse(Job job, List<InterviewRound> rounds, List<JobLinkResponse> links) {
        // Furthest, not latest: a debrief after a panel must not slide the card back to Initial Screen.
        InterviewPhase furthestRoundPhase = rounds.stream()
                .map(InterviewRound::getInterviewType)
                .filter(Objects::nonNull)
                .map(InterviewType::phase)
                .max(Comparator.naturalOrder())
                .orElse(null);
        return new JobSummaryResponse(
                job.getId(), job.getCompany(), job.getRole(), job.getSourceCategory(),
                job.getCurrentStage(), job.getInterviewPhase(), job.boardPhase(furthestRoundPhase), job.getOutcome(),
                job.getUrl(), job.getLocation(), job.getCity(), job.getCompMin(), job.getCompMax(), job.getCreatedAt(),
                latestInterview(rounds), job.needsScheduling(InterviewRound.latest(rounds).orElse(null), clock.instant()),
                links, job.getSeasonId());
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
                job.getCurrentStage(), job.getOutcome(), job.getUrl(), job.getLocation(), job.getCity(),
                job.getCompMin(), job.getCompMax(), job.getCreatedAt(), eventResponses);
    }
}
