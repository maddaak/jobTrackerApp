package com.jobtracker.core.service;

import com.jobtracker.core.dto.CreateInterviewRequest;
import com.jobtracker.core.dto.InterviewResponse;
import com.jobtracker.core.dto.InterviewerRequest;
import com.jobtracker.core.dto.InterviewerResponse;
import com.jobtracker.core.dto.UpdateInterviewRequest;
import com.jobtracker.core.exception.JobNotFoundException;
import com.jobtracker.core.model.Interviewer;
import com.jobtracker.core.model.InterviewRound;
import com.jobtracker.core.model.Job;
import com.jobtracker.core.model.JobDetail;
import com.jobtracker.core.model.JobJourney;
import com.jobtracker.core.model.Stage;
import com.jobtracker.core.repository.JobDetailRepository;
import com.jobtracker.core.repository.JobRepository;
import org.springframework.stereotype.Service;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class InterviewService {

    private static final Duration UPCOMING_WINDOW = Duration.ofHours(72);

    private final JobRepository jobs;
    private final JobDetailRepository jobDetails;

    public InterviewService(JobRepository jobs, JobDetailRepository jobDetails) {
        this.jobs = jobs;
        this.jobDetails = jobDetails;
    }

    public InterviewResponse createInterview(Long ownerId, CreateInterviewRequest request) {
        Job job = jobs.findByIdAndOwnerId(request.jobId(), ownerId).orElseThrow(JobNotFoundException::new);
        JobDetail detail = jobDetails.findByJobIdAndOwnerId(job.getId(), ownerId)
                .orElseThrow(JobNotFoundException::new);

        InterviewRound round = new InterviewRound(request.interviewDateTime(), request.interviewType(),
                request.meetingLink(), request.location(), toInterviewers(request.interviewers()));
        detail.addInterview(round);

        // Postgres first: a failed second write costs a history entry, not a wrong stage in the grid.
        advanceStage(job, detail, request.stage());
        jobDetails.save(detail);

        return toResponse(round, job);
    }

    public InterviewResponse updateInterview(Long ownerId, String roundId, UpdateInterviewRequest request) {
        JobDetail detail = jobDetails.findByOwnerIdAndInterviewsRoundId(ownerId, roundId)
                .orElseThrow(JobNotFoundException::new);

        InterviewRound round = detail.findInterview(roundId);
        round.apply(request.interviewDateTime(), request.interviewType(), request.meetingLink(),
                request.location(), toInterviewers(request.interviewers()));
        jobDetails.save(detail);

        Job job = jobs.findByIdAndOwnerId(detail.getJobId(), ownerId).orElseThrow(JobNotFoundException::new);
        return toResponse(round, job);
    }

    public List<InterviewResponse> listInterviews(Long ownerId) {
        return roundsWithJobs(ownerId);
    }

    public List<InterviewResponse> listUpcomingInterviews(Long ownerId) {
        Instant now = Instant.now();
        Instant until = now.plus(UPCOMING_WINDOW);
        return roundsWithJobs(ownerId).stream()
                .filter(r -> !r.interviewDateTime().isBefore(now) && !r.interviewDateTime().isAfter(until))
                .sorted(Comparator.comparing(InterviewResponse::interviewDateTime))
                .toList();
    }

    public void deleteInterview(Long ownerId, String roundId) {
        JobDetail detail = jobDetails.findByOwnerIdAndInterviewsRoundId(ownerId, roundId)
                .orElseThrow(JobNotFoundException::new);

        // No stage recompute: separate records now, and recomputing dropped closed jobs out of FINALIZED.
        detail.removeInterview(roundId);
        jobDetails.save(detail);
    }

    // One projected Mongo read for the rounds, one Postgres read for the company/role they display.
    private List<InterviewResponse> roundsWithJobs(Long ownerId) {
        Map<Long, Job> jobsById = jobs.findByOwnerIdOrderByCreatedAtDesc(ownerId).stream()
                .collect(Collectors.toMap(Job::getId, Function.identity()));
        return jobDetails.findJourneysByOwnerId(ownerId).stream()
                // A document whose job is gone has nothing to render a company or role from.
                .filter(detail -> jobsById.containsKey(detail.jobId()))
                .flatMap(detail -> detail.interviews().stream()
                        .filter(round -> round.getInterviewDateTime() != null)
                        .map(round -> toResponse(round, jobsById.get(detail.jobId()))))
                .toList();
    }

    private void advanceStage(Job job, JobDetail detail, Stage stage) {
        Stage previous = job.getCurrentStage();
        job.advanceStageIfFurther(stage);
        jobs.save(job);
        if (job.getCurrentStage() != previous) {
            detail.recordStage(job.getCurrentStage(), Instant.now(), null);
        }
    }

    private InterviewResponse toResponse(InterviewRound round, Job job) {
        return new InterviewResponse(
                round.getRoundId(), job.getId(), job.getCompany(), job.getRole(), job.getCurrentStage(),
                round.getInterviewDateTime(), round.getInterviewType(), round.getMeetingLink(),
                round.getLocation(), toInterviewerResponses(round.getInterviewers()));
    }

    private List<Interviewer> toInterviewers(List<InterviewerRequest> requests) {
        if (requests == null) {
            return List.of();
        }
        return requests.stream().map(r -> new Interviewer(r.name(), r.linkedInUrl())).toList();
    }

    private List<InterviewerResponse> toInterviewerResponses(List<Interviewer> interviewers) {
        return interviewers.stream()
                .map(i -> new InterviewerResponse(i.getName(), i.getLinkedInUrl()))
                .toList();
    }
}
