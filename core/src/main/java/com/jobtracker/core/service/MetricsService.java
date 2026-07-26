package com.jobtracker.core.service;

import com.jobtracker.core.dto.FunnelStageCount;
import com.jobtracker.core.dto.InterviewRoundCount;
import com.jobtracker.core.dto.MetricsResponse;
import com.jobtracker.core.dto.OutcomeCount;
import com.jobtracker.core.dto.SankeyLink;
import com.jobtracker.core.model.InterviewType;
import com.jobtracker.core.model.Job;
import com.jobtracker.core.model.Outcome;
import com.jobtracker.core.model.Stage;
import com.jobtracker.core.model.StageEvent;
import com.jobtracker.core.repository.JobRepository;
import com.jobtracker.core.repository.StageEventRepository;
import org.springframework.stereotype.Service;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class MetricsService {

    private static final Stage[] STAGE_ORDER = Stage.values();

    private final JobRepository jobs;
    private final StageEventRepository stageEvents;

    public MetricsService(JobRepository jobs, StageEventRepository stageEvents) {
        this.jobs = jobs;
        this.stageEvents = stageEvents;
    }

    public MetricsResponse getMetrics(Long ownerId) {
        List<Job> ownerJobs = jobs.findByOwnerIdOrderByCreatedAtDesc(ownerId);
        return new MetricsResponse(
                funnel(ownerJobs), outcomeCounts(ownerJobs), interviewRoundCounts(ownerId), sankeyLinks(ownerJobs));
    }

    private List<FunnelStageCount> funnel(List<Job> ownerJobs) {
        return Arrays.stream(STAGE_ORDER)
                .map(stage -> new FunnelStageCount(stage,
                        ownerJobs.stream().filter(job -> reached(job, stage)).count()))
                .toList();
    }

    private boolean reached(Job job, Stage stage) {
        return job.getCurrentStage().ordinal() >= stage.ordinal();
    }

    private List<OutcomeCount> outcomeCounts(List<Job> ownerJobs) {
        return Arrays.stream(Outcome.values())
                .filter(outcome -> outcome != Outcome.ACTIVE)
                .map(outcome -> new OutcomeCount(outcome,
                        ownerJobs.stream().filter(job -> job.getOutcome() == outcome).count()))
                .toList();
    }

    // Each row here is one scheduled interview round (a StageEvent with a set
    // interviewDateTime) grouped by its type — this is where "how many rounds" and "which
    // kind" actually live, since the funnel/Sankey deliberately collapse every round into a
    // single generic INTERVIEW_STAGE node (see the comment on sankeyLinks below).
    private List<InterviewRoundCount> interviewRoundCounts(Long ownerId) {
        List<StageEvent> rounds = stageEvents.findByJob_Owner_IdAndInterviewDateTimeIsNotNull(ownerId);
        return Arrays.stream(InterviewType.values())
                .map(type -> new InterviewRoundCount(type,
                        rounds.stream().filter(round -> round.getInterviewType() == type).count()))
                .toList();
    }

    // Links follow each job's furthest-reached stage (currentStage is monotonic — see
    // Job.advanceStageIfFurther) rather than raw StageEvent history, so multi-round
    // interview revisits (INTERVIEW_SCHEDULING -> INTERVIEW_STAGE repeating per round)
    // don't turn the Sankey into a cyclic graph.
    private List<SankeyLink> sankeyLinks(List<Job> ownerJobs) {
        Map<String, Long> counts = new LinkedHashMap<>();
        for (Job job : ownerJobs) {
            int maxIndex = job.getCurrentStage().ordinal();
            for (int i = 0; i < maxIndex; i++) {
                increment(counts, STAGE_ORDER[i].name(), STAGE_ORDER[i + 1].name());
            }
            if (job.getOutcome() != Outcome.ACTIVE) {
                increment(counts, job.getCurrentStage().name(), job.getOutcome().name());
            }
        }
        return counts.entrySet().stream()
                .map(entry -> {
                    String[] parts = entry.getKey().split("->", 2);
                    return new SankeyLink(parts[0], parts[1], entry.getValue());
                })
                .toList();
    }

    private void increment(Map<String, Long> counts, String source, String target) {
        counts.merge(source + "->" + target, 1L, Long::sum);
    }
}
