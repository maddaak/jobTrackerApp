package com.jobtracker.core.service;

import com.jobtracker.core.dto.CreateInterviewRequest;
import com.jobtracker.core.dto.InterviewResponse;
import com.jobtracker.core.dto.InterviewerRequest;
import com.jobtracker.core.dto.InterviewerResponse;
import com.jobtracker.core.dto.UpdateInterviewRequest;
import com.jobtracker.core.exception.JobNotFoundException;
import com.jobtracker.core.model.Interviewer;
import com.jobtracker.core.model.Job;
import com.jobtracker.core.model.Stage;
import com.jobtracker.core.model.StageEvent;
import com.jobtracker.core.repository.JobRepository;
import com.jobtracker.core.repository.StageEventRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;

@Service
public class InterviewService {

    private static final Duration UPCOMING_WINDOW = Duration.ofHours(72);

    private final JobRepository jobs;
    private final StageEventRepository stageEvents;

    public InterviewService(JobRepository jobs, StageEventRepository stageEvents) {
        this.jobs = jobs;
        this.stageEvents = stageEvents;
    }

    @Transactional
    public InterviewResponse createInterview(Long ownerId, CreateInterviewRequest request) {
        Job job = jobs.findByIdAndOwnerId(request.jobId(), ownerId).orElseThrow(JobNotFoundException::new);

        StageEvent event = new StageEvent(job, request.stage(), Instant.now(), null);
        event.applyInterviewDetails(request.interviewDateTime(), request.interviewType(),
                request.meetingLink(), request.location(), toInterviewers(request.interviewers()));
        event = stageEvents.save(event);

        job.advanceStageIfFurther(request.stage());
        jobs.save(job);

        return toResponse(event, job);
    }

    @Transactional
    public InterviewResponse updateInterview(Long ownerId, Long stageEventId, UpdateInterviewRequest request) {
        StageEvent event = stageEvents.findByIdAndJob_Owner_Id(stageEventId, ownerId)
                .orElseThrow(JobNotFoundException::new);

        event.applyInterviewDetails(request.interviewDateTime(), request.interviewType(),
                request.meetingLink(), request.location(), toInterviewers(request.interviewers()));
        stageEvents.save(event);

        return toResponse(event, event.getJob());
    }

    public List<InterviewResponse> listInterviews(Long ownerId) {
        // Eager-loads job + interviewers in one query so toResponse fires no per-row selects.
        return stageEvents.findAllWithJobAndInterviewersByJobOwnerId(ownerId).stream()
                .map(event -> toResponse(event, event.getJob()))
                .toList();
    }

    @Transactional
    public void deleteInterview(Long ownerId, Long stageEventId) {
        StageEvent event = stageEvents.findByIdAndJob_Owner_Id(stageEventId, ownerId)
                .orElseThrow(JobNotFoundException::new);
        Job job = event.getJob();
        stageEvents.delete(event);

        // createInterview advances job.currentStage via advanceStageIfFurther, so deleting that
        // event could leave the column pointing at a stage no surviving event supports, and the
        // metrics funnel (recomputed from event history) would then disagree with it. Recompute
        // the furthest stage from the remaining events and lower the column to match. The deleted
        // event may not be flushed yet, so exclude it by id rather than trusting the query.
        Stage furthestRemaining = stageEvents.findByJobIdOrderByEnteredAtAsc(job.getId()).stream()
                .filter(e -> !e.getId().equals(stageEventId))
                .map(StageEvent::getStage)
                .max(Comparator.comparingInt(Stage::ordinal))
                .orElse(Stage.RESUME_CHECK);
        job.lowerStageTo(furthestRemaining);
        jobs.save(job);
    }

    public List<InterviewResponse> listUpcomingInterviews(Long ownerId) {
        Instant now = Instant.now();
        return stageEvents
                .findUpcomingWithInterviewersByJobOwnerId(ownerId, now, now.plus(UPCOMING_WINDOW)).stream()
                .map(event -> toResponse(event, event.getJob()))
                .toList();
    }

    private InterviewResponse toResponse(StageEvent event, Job job) {
        return new InterviewResponse(
                event.getId(), job.getId(), job.getCompany(), job.getRole(), event.getStage(),
                event.getInterviewDateTime(), event.getInterviewType(), event.getMeetingLink(),
                event.getLocation(), toInterviewerResponses(event.getInterviewers()));
    }

    private List<Interviewer> toInterviewers(List<InterviewerRequest> requests) {
        if (requests == null) {
            return List.of();
        }
        return requests.stream().map(r -> new Interviewer(r.name(), r.linkedInUrl())).toList();
    }

    private List<InterviewerResponse> toInterviewerResponses(List<Interviewer> interviewers) {
        return interviewers.stream()
                .map(i -> new InterviewerResponse(i.getId(), i.getName(), i.getLinkedInUrl()))
                .toList();
    }
}
