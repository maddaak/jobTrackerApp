package com.jobtracker.core.service;

import com.jobtracker.core.dto.CreateInterviewRequest;
import com.jobtracker.core.dto.InterviewResponse;
import com.jobtracker.core.dto.InterviewerRequest;
import com.jobtracker.core.dto.InterviewerResponse;
import com.jobtracker.core.dto.UpdateInterviewRequest;
import com.jobtracker.core.exception.JobNotFoundException;
import com.jobtracker.core.model.Interviewer;
import com.jobtracker.core.model.Job;
import com.jobtracker.core.model.StageEvent;
import com.jobtracker.core.repository.JobRepository;
import com.jobtracker.core.repository.StageEventRepository;
import org.springframework.stereotype.Service;
import java.time.Instant;
import java.util.List;

@Service
public class InterviewService {

    private final JobRepository jobs;
    private final StageEventRepository stageEvents;

    public InterviewService(JobRepository jobs, StageEventRepository stageEvents) {
        this.jobs = jobs;
        this.stageEvents = stageEvents;
    }

    public InterviewResponse createInterview(Long ownerId, CreateInterviewRequest request) {
        Job job = jobs.findByIdAndOwnerId(request.jobId(), ownerId).orElseThrow(JobNotFoundException::new);

        StageEvent event = stageEvents.save(new StageEvent(job, request.stage(), Instant.now(), null));
        event.applyInterviewDetails(request.interviewDateTime(), request.interviewType(),
                request.meetingLink(), request.location(), toInterviewers(request.interviewers()));
        stageEvents.save(event);

        job.advanceStageIfFurther(request.stage());
        jobs.save(job);

        return toResponse(event, job);
    }

    public InterviewResponse updateInterview(Long ownerId, Long stageEventId, UpdateInterviewRequest request) {
        StageEvent event = stageEvents.findByIdAndJob_Owner_Id(stageEventId, ownerId)
                .orElseThrow(JobNotFoundException::new);

        event.applyInterviewDetails(request.interviewDateTime(), request.interviewType(),
                request.meetingLink(), request.location(), toInterviewers(request.interviewers()));
        stageEvents.save(event);

        return toResponse(event, event.getJob());
    }

    public List<InterviewResponse> listInterviews(Long ownerId) {
        return stageEvents.findByJob_Owner_IdAndInterviewDateTimeIsNotNull(ownerId).stream()
                .map(event -> toResponse(event, event.getJob()))
                .toList();
    }

    public void deleteInterview(Long ownerId, Long stageEventId) {
        StageEvent event = stageEvents.findByIdAndJob_Owner_Id(stageEventId, ownerId)
                .orElseThrow(JobNotFoundException::new);
        stageEvents.delete(event);
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
