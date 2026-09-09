package com.jobtracker.core.service;

import com.jobtracker.core.dto.FunnelStageCount;
import com.jobtracker.core.dto.InterviewRoundCount;
import com.jobtracker.core.dto.MetricsResponse;
import com.jobtracker.core.dto.OutcomeCount;
import com.jobtracker.core.dto.SankeyLink;
import com.jobtracker.core.model.InterviewRound;
import com.jobtracker.core.model.InterviewType;
import com.jobtracker.core.model.Job;
import com.jobtracker.core.model.JobJourney;
import com.jobtracker.core.model.Outcome;
import com.jobtracker.core.model.Stage;
import com.jobtracker.core.model.StageHistoryEntry;
import com.jobtracker.core.repository.JobDetailRepository;
import com.jobtracker.core.repository.JobRepository;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class MetricsService {

    // FINALIZED is a terminal marker, not a pipeline stage; closure is reported as outcome rows.
    private static final List<Stage> PIPELINE_STAGES = Arrays.stream(Stage.values())
            .filter(stage -> stage != Stage.FINALIZED)
            .toList();

    private final JobRepository jobs;
    private final JobDetailRepository jobDetails;

    public MetricsService(JobRepository jobs, JobDetailRepository jobDetails) {
        this.jobs = jobs;
        this.jobDetails = jobDetails;
    }

    public MetricsResponse getMetrics(Long ownerId) {
        List<Job> ownerJobs = jobs.findByOwnerIdOrderByCreatedAtDesc(ownerId);
        // One document per job carries both the stage history and the rounds; the JD blobs are projected away.
        Map<Long, JobJourney> detailsByJobId = jobDetails.findJourneysByOwnerId(ownerId).stream()
                .collect(Collectors.toMap(JobJourney::jobId, Function.identity(), (a, b) -> a));
        Map<Long, Stage> furthestByJobId = furthestStagesByJobId(ownerJobs, detailsByJobId);
        Map<Long, List<InterviewRound>> roundsByJobId = detailsByJobId.values().stream()
                .collect(Collectors.toMap(JobJourney::jobId, JobJourney::interviews));
        List<InterviewRound> interviewRounds = roundsByJobId.values().stream()
                .flatMap(List::stream)
                .filter(round -> round.getInterviewDateTime() != null)
                .toList();
        SankeyData sankey = sankeyData(ownerJobs, furthestByJobId, roundsByJobId);
        return new MetricsResponse(
                funnel(ownerJobs, furthestByJobId), outcomeCounts(ownerJobs),
                interviewRoundCounts(interviewRounds), sankey.links(), sankey.companiesByNode());
    }

    private record SankeyData(List<SankeyLink> links, Map<String, Map<String, Integer>> companiesByNode) {
    }

    // Excludes FINALIZED so a rejected job isn't counted as having reached later pipeline stages.
    private Map<Long, Stage> furthestStagesByJobId(List<Job> ownerJobs, Map<Long, JobJourney> detailsByJobId) {
        Map<Long, Stage> furthestByJobId = new HashMap<>();
        for (Job job : ownerJobs) {
            JobJourney detail = detailsByJobId.get(job.getId());
            Stage furthest = null;
            for (StageHistoryEntry event : liveAttempt(detail == null ? List.of() : detail.stageHistory())) {
                if (event.getStage() == Stage.FINALIZED) {
                    continue;
                }
                if (furthest == null || event.getStage().ordinal() > furthest.ordinal()) {
                    furthest = event.getStage();
                }
            }
            if (furthest == null) {
                continue;
            }
            // A deliberate move back down is where the job actually stands; don't strand a high-water mark above it.
            if (job.getCurrentStage() != Stage.FINALIZED && job.getCurrentStage().ordinal() < furthest.ordinal()) {
                furthest = job.getCurrentStage();
            }
            furthestByJobId.put(job.getId(), furthest);
        }
        return furthestByJobId;
    }

    // Reopening retracts the close, so only events after the last FINALIZED say where the job stands.
    private List<StageHistoryEntry> liveAttempt(List<StageHistoryEntry> jobEvents) {
        Instant lastFinalizedAt = jobEvents.stream()
                .filter(event -> event.getStage() == Stage.FINALIZED)
                .map(StageHistoryEntry::getEnteredAt)
                .max(Comparator.naturalOrder())
                .orElse(null);
        if (lastFinalizedAt == null) {
            return jobEvents;
        }
        List<StageHistoryEntry> reopened = jobEvents.stream()
                .filter(event -> event.getEnteredAt().isAfter(lastFinalizedAt))
                .toList();
        return reopened.isEmpty() ? jobEvents : reopened;
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
    private List<InterviewRoundCount> interviewRoundCounts(List<InterviewRound> rounds) {
        return Arrays.stream(InterviewType.values())
                .map(type -> new InterviewRoundCount(type,
                        rounds.stream().filter(round -> round.getInterviewType() == type).count()))
                .toList();
    }

    // Tie-breaker only for round nodes with no observed order between them; live order is globalRoundOrder.
    private static final List<String> ROUND_NODE_ORDER = List.of(
            "RECRUITER_PHONE_SCREEN", "TECHNICAL_PHONE_SCREEN", "HIRING_MANAGER_SCREEN",
            "SYSTEM_DESIGN", "DATA_MODELING", "BEHAVIOR", "CULTURE_FIT", "VALUES", "PANEL");

    // Strict node ordering (RESUME_CHECK < INTERVIEW_REQUEST < rounds < OFFER < terminals) keeps the graph acyclic.
    private SankeyData sankeyData(List<Job> ownerJobs, Map<Long, Stage> furthestByJobId,
            Map<Long, List<InterviewRound>> allRoundsByJobId) {
        // Rounds with no chosen type can't be placed on a type node, so skip them here.
        Map<Long, List<String>> nodeSequencesByJobId = new HashMap<>();
        Map<Long, List<InterviewRound>> roundsByJobId = new HashMap<>();
        allRoundsByJobId.forEach((jobId, rounds) -> {
            for (InterviewRound round : rounds) {
                if (round.getInterviewType() == null || round.getInterviewDateTime() == null) {
                    continue;
                }
                roundsByJobId.computeIfAbsent(jobId, key -> new ArrayList<>()).add(round);
            }
        });
        for (Map.Entry<Long, List<InterviewRound>> entry : roundsByJobId.entrySet()) {
            List<String> sequence = entry.getValue().stream()
                    .sorted(Comparator.comparing(InterviewRound::getInterviewDateTime))
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

    // jobPath renders every job as a subsequence of this list, so it must place every node or the chart cycles.
    private List<String> globalRoundOrder(Map<Long, List<String>> nodeSequencesByJobId) {
        Set<String> allNodes = new HashSet<>();
        Map<String, Map<String, Integer>> edgeSupport = new HashMap<>();
        for (List<String> sequence : nodeSequencesByJobId.values()) {
            Map<String, Integer> firstIndex = new LinkedHashMap<>();
            for (int i = 0; i < sequence.size(); i++) {
                firstIndex.putIfAbsent(sequence.get(i), i);
            }
            List<String> chronological = firstIndex.entrySet().stream()
                    .sorted(Map.Entry.comparingByValue())
                    .map(Map.Entry::getKey)
                    .toList();
            allNodes.addAll(chronological);
            for (int i = 1; i < chronological.size(); i++) {
                edgeSupport.computeIfAbsent(chronological.get(i - 1), key -> new HashMap<>())
                        .merge(chronological.get(i), 1, Integer::sum);
            }
        }
        return topologicalSort(allNodes, edgeSupport);
    }

    // Deterministic regardless of hash order. A cycle means two jobs contradict, so the weakest edge in it goes.
    private List<String> topologicalSort(Set<String> nodes, Map<String, Map<String, Integer>> edgeSupport) {
        Map<String, Map<String, Integer>> edges = new HashMap<>();
        edgeSupport.forEach((source, targets) -> edges.put(source, new HashMap<>(targets)));
        List<String> order = new ArrayList<>();
        Set<String> remaining = new HashSet<>(nodes);
        while (!remaining.isEmpty()) {
            Map<String, Integer> inDegree = new HashMap<>();
            remaining.forEach(node -> inDegree.put(node, 0));
            for (String source : remaining) {
                edges.getOrDefault(source, Map.of()).keySet().stream()
                        .filter(remaining::contains)
                        .forEach(target -> inDegree.merge(target, 1, Integer::sum));
            }
            String next = remaining.stream()
                    .filter(node -> inDegree.get(node) == 0)
                    .min(byCanonicalRank())
                    .orElse(null);
            if (next == null) {
                // Every remaining node has an inbound edge, so a cycle exists; place the rest rather than spin.
                if (!removeWeakestCycleEdge(remaining, edges)) {
                    remaining.stream().sorted(byCanonicalRank()).forEach(order::add);
                    remaining.clear();
                }
                continue;
            }
            order.add(next);
            remaining.remove(next);
        }
        return order;
    }

    // Only a cycle edge can be the contradicting pair; dropping another would reorder a job that contradicts nothing.
    private boolean removeWeakestCycleEdge(Set<String> remaining, Map<String, Map<String, Integer>> edges) {
        String weakestSource = null;
        String weakestTarget = null;
        int weakestSupport = Integer.MAX_VALUE;
        for (String source : remaining) {
            for (Map.Entry<String, Integer> edge : edges.getOrDefault(source, Map.of()).entrySet()) {
                if (!remaining.contains(edge.getKey()) || !reaches(edge.getKey(), source, remaining, edges)) {
                    continue;
                }
                String candidateKey = source + "->" + edge.getKey();
                String weakestKey = weakestSource == null ? null : weakestSource + "->" + weakestTarget;
                if (edge.getValue() < weakestSupport
                        || (edge.getValue() == weakestSupport && candidateKey.compareTo(weakestKey) < 0)) {
                    weakestSupport = edge.getValue();
                    weakestSource = source;
                    weakestTarget = edge.getKey();
                }
            }
        }
        if (weakestSource == null) {
            return false;
        }
        edges.get(weakestSource).remove(weakestTarget);
        return true;
    }

    // A path back to the source means the edge closes a cycle.
    private boolean reaches(String from, String to, Set<String> remaining, Map<String, Map<String, Integer>> edges) {
        Set<String> seen = new HashSet<>();
        Deque<String> stack = new ArrayDeque<>();
        stack.push(from);
        while (!stack.isEmpty()) {
            String node = stack.pop();
            if (node.equals(to)) {
                return true;
            }
            if (!seen.add(node)) {
                continue;
            }
            edges.getOrDefault(node, Map.of()).keySet().stream()
                    .filter(remaining::contains)
                    .forEach(stack::push);
        }
        return false;
    }

    private Comparator<String> byCanonicalRank() {
        return Comparator.comparingInt(this::canonicalRank).thenComparing(Comparator.naturalOrder());
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
        } else if (outcome.closesPipeline()) {
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
