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

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class MetricsService {

    // FINALIZED is the terminal marker (a rejected job is auto-set to it), so it is excluded
    // to keep it out of the funnel rows and Sankey nodes; closure shows up as outcome rows.
    private static final List<Stage> PIPELINE_STAGES = Arrays.stream(Stage.values())
            .filter(stage -> stage != Stage.FINALIZED)
            .toList();

    private final JobRepository jobs;
    private final StageEventRepository stageEvents;

    public MetricsService(JobRepository jobs, StageEventRepository stageEvents) {
        this.jobs = jobs;
        this.stageEvents = stageEvents;
    }

    public MetricsResponse getMetrics(Long ownerId) {
        List<Job> ownerJobs = jobs.findByOwnerIdOrderByCreatedAtDesc(ownerId);
        Map<Long, Stage> furthestByJobId = furthestStagesByJobId(ownerId);
        // One query for this owner's scheduled interview rounds, shared by the per-type
        // round-count breakdown and the Sankey path building.
        List<StageEvent> interviewRounds = stageEvents.findByJob_Owner_IdAndInterviewDateTimeIsNotNull(ownerId);
        SankeyData sankey = sankeyData(ownerJobs, furthestByJobId, interviewRounds);
        return new MetricsResponse(
                funnel(ownerJobs, furthestByJobId), outcomeCounts(ownerJobs),
                interviewRoundCounts(interviewRounds), sankey.links(), sankey.companiesByNode());
    }

    private record SankeyData(List<SankeyLink> links, Map<String, Map<String, Integer>> companiesByNode) {
    }

    // Excludes FINALIZED so a rejected job (auto-moved to FINALIZED) does not falsely count as
    // having reached the later pipeline stages. Rounds repeat, so keep the max ordinal entered.
    private Map<Long, Stage> furthestStagesByJobId(Long ownerId) {
        Map<Long, Stage> furthestByJobId = new HashMap<>();
        for (StageEvent event : stageEvents.findAllByJobOwnerId(ownerId)) {
            if (event.getStage() == Stage.FINALIZED) {
                continue;
            }
            Long jobId = event.getJob().getId();
            Stage current = furthestByJobId.get(jobId);
            if (current == null || event.getStage().ordinal() > current.ordinal()) {
                furthestByJobId.put(jobId, event.getStage());
            }
        }
        return furthestByJobId;
    }

    private List<FunnelStageCount> funnel(List<Job> ownerJobs, Map<Long, Stage> furthestByJobId) {
        return PIPELINE_STAGES.stream()
                .map(stage -> new FunnelStageCount(stage,
                        ownerJobs.stream().filter(job -> reached(job, stage, furthestByJobId)).count()))
                .toList();
    }

    // Jobs with no recorded stage default to RESUME_CHECK, since every job gets a RESUME_CHECK
    // event at creation.
    private boolean reached(Job job, Stage stage, Map<Long, Stage> furthestByJobId) {
        return furthestByJobId.getOrDefault(job.getId(), Stage.RESUME_CHECK).ordinal() >= stage.ordinal();
    }

    private List<OutcomeCount> outcomeCounts(List<Job> ownerJobs) {
        return Arrays.stream(Outcome.values())
                .filter(outcome -> outcome != Outcome.ACTIVE)
                .map(outcome -> new OutcomeCount(outcome,
                        ownerJobs.stream().filter(job -> job.getOutcome() == outcome).count()))
                .toList();
    }

    // Full per-type breakdown lives here; the Sankey collapses all panel types into one "PANEL"
    // node, so per-type counts must come from these rounds.
    private List<InterviewRoundCount> interviewRoundCounts(List<StageEvent> rounds) {
        return Arrays.stream(InterviewType.values())
                .map(type -> new InterviewRoundCount(type,
                        rounds.stream().filter(round -> round.getInterviewType() == type).count()))
                .toList();
    }

    // Fallback tie-breaker only, for round nodes with equal average chronological position. The
    // live left-to-right order comes from actual event timestamps (see globalRoundOrder).
    private static final List<String> ROUND_NODE_ORDER = List.of(
            "RECRUITER_PHONE_SCREEN", "TECHNICAL_PHONE_SCREEN", "HIRING_MANAGER_SCREEN",
            "SYSTEM_DESIGN", "BEHAVIOR", "CULTURE_FIT", "VALUES", "PANEL");

    // The Sankey traces each job's interview journey rather than the generic stage pipeline.
    // Round-node columns follow one global left-to-right order derived from real event timestamps
    // (globalRoundOrder), so they reflect typical real chronology. That order is a strict total
    // order and RESUME_CHECK < INTERVIEW_REQUEST < round nodes < OFFER < ACCEPTED/DECLINED, with
    // negative terminals always last, so the graph stays acyclic. Each job adds 1 to every link
    // on its own path.
    private SankeyData sankeyData(List<Job> ownerJobs, Map<Long, Stage> furthestByJobId,
            List<StageEvent> interviewRounds) {
        // Rounds with no chosen type can't be placed on a type node, so they are skipped here
        // (the job still reaches the interview stage via its stage history).
        Map<Long, List<String>> nodeSequencesByJobId = new HashMap<>();
        Map<Long, List<StageEvent>> roundsByJobId = new HashMap<>();
        for (StageEvent round : interviewRounds) {
            if (round.getInterviewType() == null || round.getInterviewDateTime() == null) {
                continue;
            }
            roundsByJobId.computeIfAbsent(round.getJob().getId(), key -> new ArrayList<>()).add(round);
        }
        for (Map.Entry<Long, List<StageEvent>> entry : roundsByJobId.entrySet()) {
            List<String> sequence = entry.getValue().stream()
                    .sorted(Comparator.comparing(StageEvent::getInterviewDateTime))
                    .map(event -> roundNode(event.getInterviewType()))
                    .toList();
            nodeSequencesByJobId.put(entry.getKey(), sequence);
        }

        // Computed once and shared into every job's path so all jobs use one left-to-right order.
        List<String> globalOrder = globalRoundOrder(nodeSequencesByJobId);

        Map<String, Long> counts = new LinkedHashMap<>();
        // Counting, not deduping: a company flowing through a node on N jobs is reported as N.
        Map<String, Map<String, Integer>> companiesByNode = new LinkedHashMap<>();
        for (Job job : ownerJobs) {
            List<String> path = jobPath(job, furthestByJobId,
                    nodeSequencesByJobId.getOrDefault(job.getId(), List.of()), globalOrder);
            for (int i = 0; i + 1 < path.size(); i++) {
                increment(counts, path.get(i), path.get(i + 1));
            }
            for (String node : path) {
                companiesByNode.computeIfAbsent(node, k -> new LinkedHashMap<>())
                        .merge(job.getCompany(), 1, Integer::sum);
            }
        }
        List<SankeyLink> links = counts.entrySet().stream()
                .map(entry -> {
                    String[] parts = entry.getKey().split("->", 2);
                    return new SankeyLink(parts[0], parts[1], entry.getValue());
                })
                .toList();
        return new SankeyData(links, companiesByNode);
    }

    // Global round order derived from event timestamps: each node's per-job position is its
    // first-occurrence index, and nodes sort by average position across jobs. Ties break by the
    // fallback canonical order then name, giving a strict total order so the graph stays acyclic.
    private List<String> globalRoundOrder(Map<Long, List<String>> nodeSequencesByJobId) {
        Map<String, Long> sumOfPositions = new HashMap<>();
        Map<String, Long> counts = new HashMap<>();
        for (List<String> sequence : nodeSequencesByJobId.values()) {
            Map<String, Integer> firstIndex = new LinkedHashMap<>();
            for (int i = 0; i < sequence.size(); i++) {
                firstIndex.putIfAbsent(sequence.get(i), i);
            }
            for (Map.Entry<String, Integer> entry : firstIndex.entrySet()) {
                sumOfPositions.merge(entry.getKey(), (long) entry.getValue(), Long::sum);
                counts.merge(entry.getKey(), 1L, Long::sum);
            }
        }

        List<String> order = new ArrayList<>(counts.keySet());
        order.sort(Comparator
                .comparingDouble((String node) -> (double) sumOfPositions.get(node) / counts.get(node))
                .thenComparingInt(this::canonicalRank)
                .thenComparing(Comparator.naturalOrder()));
        return order;
    }

    private int canonicalRank(String node) {
        int index = ROUND_NODE_ORDER.indexOf(node);
        return index < 0 ? Integer.MAX_VALUE : index;
    }

    private List<String> jobPath(Job job, Map<Long, Stage> furthestByJobId,
            List<String> roundNodes, List<String> globalOrder) {
        List<String> path = new ArrayList<>();
        path.add(Stage.RESUME_CHECK.name());

        Stage furthest = furthestByJobId.getOrDefault(job.getId(), Stage.RESUME_CHECK);
        boolean reachedIR = furthest.ordinal() >= Stage.INTERVIEW_REQUEST.ordinal() || !roundNodes.isEmpty();
        if (reachedIR) {
            path.add(Stage.INTERVIEW_REQUEST.name());
            // Walk this job's distinct round nodes in the shared global order so the Sankey
            // columns stay consistent across jobs and the path stays strictly increasing.
            for (String node : globalOrder) {
                if (roundNodes.contains(node)) {
                    path.add(node);
                }
            }
        }

        Outcome outcome = job.getOutcome();
        boolean hasOffer = outcome == Outcome.OFFER_ACCEPTED || outcome == Outcome.OFFER_DECLINED
                || furthest == Stage.OFFER_STAGE;
        // Every path ends at a terminal node so a node's link total equals its real job count.
        // ACTIVE jobs still in flight (at an offer or anywhere earlier) flow into IN_PROGRESS,
        // which is only ever a target and never a source, so the graph stays acyclic.
        if (hasOffer) {
            path.add("OFFER");
            if (outcome == Outcome.OFFER_ACCEPTED) {
                path.add("ACCEPTED");
            } else if (outcome == Outcome.OFFER_DECLINED) {
                path.add("DECLINED");
            } else {
                path.add("IN_PROGRESS");
            }
        } else if (outcome == Outcome.REJECTED || outcome == Outcome.GHOSTED || outcome == Outcome.WITHDRAWN) {
            path.add(outcome.name());
        } else {
            path.add("IN_PROGRESS");
        }
        return path;
    }

    // All panel interview types collapse into one "PANEL" node.
    private String roundNode(InterviewType type) {
        return type.name().startsWith("PANEL") ? "PANEL" : type.name();
    }

    private void increment(Map<String, Long> counts, String source, String target) {
        counts.merge(source + "->" + target, 1L, Long::sum);
    }
}
