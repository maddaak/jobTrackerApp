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

    // FINALIZED is a terminal marker, not a pipeline stage; closure is reported as outcome rows.
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
        // Both views derive from this one query; no second query for the interview-dated subset.
        List<StageEvent> ownerStageEvents = stageEvents.findAllByJobOwnerId(ownerId);
        Map<Long, Stage> furthestByJobId = furthestStagesByJobId(ownerStageEvents);
        List<StageEvent> interviewRounds = ownerStageEvents.stream()
                .filter(event -> event.getInterviewDateTime() != null)
                .toList();
        SankeyData sankey = sankeyData(ownerJobs, furthestByJobId, interviewRounds);
        return new MetricsResponse(
                funnel(ownerJobs, furthestByJobId), outcomeCounts(ownerJobs),
                interviewRoundCounts(interviewRounds), sankey.links(), sankey.companiesByNode());
    }

    private record SankeyData(List<SankeyLink> links, Map<String, Map<String, Integer>> companiesByNode) {
    }

    // Excludes FINALIZED so a rejected job isn't counted as having reached later pipeline stages.
    private Map<Long, Stage> furthestStagesByJobId(List<StageEvent> ownerStageEvents) {
        Map<Long, Stage> furthestByJobId = new HashMap<>();
        for (StageEvent event : ownerStageEvents) {
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

    // Every job gets a RESUME_CHECK event at creation, so no recorded stage means RESUME_CHECK.
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

    // Per-type breakdown; the Sankey collapses all panel types into one node, so it can't supply this.
    private List<InterviewRoundCount> interviewRoundCounts(List<StageEvent> rounds) {
        return Arrays.stream(InterviewType.values())
                .map(type -> new InterviewRoundCount(type,
                        rounds.stream().filter(round -> round.getInterviewType() == type).count()))
                .toList();
    }

    // Tie-breaker only for round nodes with equal average position; live order is globalRoundOrder.
    private static final List<String> ROUND_NODE_ORDER = List.of(
            "RECRUITER_PHONE_SCREEN", "TECHNICAL_PHONE_SCREEN", "HIRING_MANAGER_SCREEN",
            "SYSTEM_DESIGN", "BEHAVIOR", "CULTURE_FIT", "VALUES", "PANEL");

    // Strict node ordering (RESUME_CHECK < INTERVIEW_REQUEST < rounds < OFFER < terminals) keeps the graph acyclic.
    private SankeyData sankeyData(List<Job> ownerJobs, Map<Long, Stage> furthestByJobId,
            List<StageEvent> interviewRounds) {
        // Rounds with no chosen type can't be placed on a type node, so skip them here.
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

        // Computed once so all jobs share one left-to-right order.
        List<String> globalOrder = globalRoundOrder(nodeSequencesByJobId);

        Map<String, Long> counts = new LinkedHashMap<>();
        // Counting, not deduping: a company on N jobs through a node counts as N.
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

    // Sorts round nodes by average first-occurrence index; ties break by canonical order then name.
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
            // Follow the shared global order so paths stay strictly increasing and columns align.
            for (String node : globalOrder) {
                if (roundNodes.contains(node)) {
                    path.add(node);
                }
            }
        }

        Outcome outcome = job.getOutcome();
        boolean hasOffer = outcome == Outcome.OFFER_ACCEPTED || outcome == Outcome.OFFER_DECLINED
                || furthest == Stage.OFFER_STAGE;
        // Every path ends at a terminal so node link totals equal job counts; in-flight jobs go to IN_PROGRESS.
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
