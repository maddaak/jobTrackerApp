package com.jobtracker.core.service;

import com.jobtracker.core.dto.SankeyLink;
import com.jobtracker.core.dto.SankeyPath;
import com.jobtracker.core.model.InterviewRound;
import com.jobtracker.core.model.InterviewType;
import com.jobtracker.core.model.Job;
import com.jobtracker.core.model.JobLink;
import com.jobtracker.core.model.JobRelation;
import com.jobtracker.core.model.Outcome;
import com.jobtracker.core.model.Stage;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

// The Sankey's links: each journey's path through the round types it actually faced, in one shared order. A
// journey is one job, or a chain of reposts linked as replacing each other.
final class SankeyBuilder {

    // nodeOrder is top to bottom within any column: the journey order for rounds, then the outcomes with the
    // still-open ones first, so flows sit in bands rather than criss-crossing.
    record SankeyData(List<SankeyLink> links, List<String> nodeOrder, List<SankeyPath> paths) {
    }

    // Paused sits with the open ones: it resumes where it stopped.
    private static final List<String> OPEN_ENDINGS = List.of("IN_PROGRESS", Outcome.PAUSED.name(), "ACCEPTED", "DECLINED");

    private SankeyBuilder() {
    }

    // Strict node ordering (RESUME_CHECK < INTERVIEW_REQUEST < rounds < OFFER < terminals) keeps the graph acyclic.
    static SankeyData build(List<Job> ownerJobs, Map<Long, List<JobLink>> linksByJobId, Map<Long, Stage> furthestByJobId,
            Map<Long, List<InterviewRound>> allRoundsByJobId, Instant now) {
        List<List<Job>> journeys = journeys(ownerJobs, linksByJobId);
        // Keyed by each journey's lead posting. Rounds with no chosen type can't be placed on a type node, so skip
        // them here. A round still booked hasn't been faced, as in the round counts: a closed job's abandoned
        // booking isn't where it ended.
        Map<Long, List<String>> nodeSequencesByLeadId = new HashMap<>();
        for (List<Job> journey : journeys) {
            List<String> sequence = journey.stream()
                    .flatMap(job -> allRoundsByJobId.getOrDefault(job.getId(), List.of()).stream())
                    .filter(round -> round.getInterviewType() != null && round.getInterviewDateTime() != null
                            && !round.getInterviewDateTime().isAfter(now))
                    .sorted(Comparator.comparing(InterviewRound::getInterviewDateTime))
                    .map(round -> roundNode(round.getInterviewType()))
                    .toList();
            if (!sequence.isEmpty()) nodeSequencesByLeadId.put(journey.get(0).getId(), sequence);
        }

        // Computed once so all journeys share one left-to-right order.
        List<String> globalOrder = globalRoundOrder(nodeSequencesByLeadId);

        Map<String, Long> counts = new LinkedHashMap<>();
        Map<List<String>, List<SankeyPath.Application>> applicationsByPath = new LinkedHashMap<>();
        for (List<Job> journey : journeys) {
            Job lead = journey.get(0);
            List<String> path = journeyPath(journey, furthestByJobId,
                    nodeSequencesByLeadId.getOrDefault(lead.getId(), List.of()), globalOrder);
            applicationsByPath.computeIfAbsent(path, key -> new ArrayList<>())
                    .add(new SankeyPath.Application(lead.getId(), lead.getCompany(), lead.getRole(), journey.size()));
            for (int i = 0; i + 1 < path.size(); i++) {
                counts.merge(path.get(i) + "->" + path.get(i + 1), 1L, Long::sum);
            }
        }
        List<SankeyLink> links = counts.entrySet().stream()
                .map(entry -> {
                    String[] parts = entry.getKey().split("->", 2);
                    return new SankeyLink(parts[0], parts[1], entry.getValue());
                })
                .toList();

        List<String> nodeOrder = new ArrayList<>(List.of(Stage.RESUME_CHECK.name(), Stage.INTERVIEW_REQUEST.name()));
        nodeOrder.addAll(globalOrder);
        nodeOrder.add("OFFER");
        nodeOrder.addAll(OPEN_ENDINGS);
        for (Outcome outcome : Outcome.values()) {
            if (outcome.closesPipeline()) nodeOrder.add(outcome.name());
        }
        List<SankeyPath> paths = applicationsByPath.entrySet().stream()
                .map(entry -> new SankeyPath(entry.getKey(), entry.getValue().size(), entry.getValue()))
                .toList();
        return new SankeyData(links, nodeOrder, paths);
    }

    // A posting replaced by a repost is the same pursuit carried on, so the chain is one journey: drawn once, with
    // every posting's rounds. Related links join nothing. Each chain leads with its newest posting, which is where
    // the journey now stands.
    static List<List<Job>> journeys(List<Job> ownerJobs, Map<Long, List<JobLink>> linksByJobId) {
        Map<Long, Job> byId = new HashMap<>();
        ownerJobs.forEach(job -> byId.put(job.getId(), job));
        Set<Long> placed = new HashSet<>();
        List<List<Job>> journeys = new ArrayList<>();
        for (Job job : ownerJobs) {
            if (!placed.add(job.getId())) continue;
            List<Job> chain = new ArrayList<>();
            Deque<Job> toVisit = new ArrayDeque<>(List.of(job));
            while (!toVisit.isEmpty()) {
                Job posting = toVisit.pop();
                chain.add(posting);
                for (JobLink link : linksByJobId.getOrDefault(posting.getId(), List.of())) {
                    // A posting outside the season shown isn't in byId, so a chain never reaches past what's shown.
                    Job other = byId.get(link.getJobId());
                    if (link.getRelation() != JobRelation.RELATED && other != null && placed.add(other.getId())) {
                        toVisit.push(other);
                    }
                }
            }
            // The newest is the one nothing shown replaces; the order rows were added in (an import, a backfill) can disagree.
            chain.stream()
                    .filter(posting -> linksByJobId.getOrDefault(posting.getId(), List.of()).stream()
                            .noneMatch(link -> link.getRelation() == JobRelation.REPLACED_BY && byId.containsKey(link.getJobId())))
                    .findFirst()
                    .ifPresent(newest -> {
                        chain.remove(newest);
                        chain.add(0, newest);
                    });
            journeys.add(chain);
        }
        return journeys;
    }

    // journeyPath renders every journey as a subsequence of this list, so it must place every node or the chart cycles.
    private static List<String> globalRoundOrder(Map<Long, List<String>> nodeSequencesByJobId) {
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
    private static List<String> topologicalSort(Set<String> nodes, Map<String, Map<String, Integer>> edgeSupport) {
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
    private static boolean removeWeakestCycleEdge(Set<String> remaining, Map<String, Map<String, Integer>> edges) {
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
    private static boolean reaches(String from, String to, Set<String> remaining,
            Map<String, Map<String, Integer>> edges) {
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

    private static Comparator<String> byCanonicalRank() {
        return Comparator.comparingInt(SankeyBuilder::canonicalRank).thenComparing(Comparator.naturalOrder());
    }

    // Tie-breaker only for round nodes no job has ordered yet: by phase, then as the enum declares them, so a new
    // type lands in its phase with no separate list to keep in step. Panel is the last phase.
    static int canonicalRank(String node) {
        if (MetricsService.PANEL_NODE.equals(node)) {
            return Integer.MAX_VALUE;
        }
        InterviewType type = InterviewType.valueOf(node);
        return type.phase().ordinal() * InterviewType.values().length + type.ordinal();
    }

    // As far as any posting got, ending where the lead (newest) posting stands.
    private static List<String> journeyPath(List<Job> journey, Map<Long, Stage> furthestByJobId,
            List<String> roundNodes, List<String> globalOrder) {
        List<String> path = new ArrayList<>();
        path.add(Stage.RESUME_CHECK.name());

        Stage furthest = journey.stream()
                .map(job -> furthestByJobId.getOrDefault(job.getId(), Stage.RESUME_CHECK))
                .max(Comparator.naturalOrder())
                .orElseThrow();
        boolean reachedOffer = journey.stream()
                .anyMatch(job -> job.reachedOffer(furthestByJobId.getOrDefault(job.getId(), Stage.RESUME_CHECK)));
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

        Outcome outcome = journey.get(0).getOutcome();
        // Every path ends at a terminal so node link totals equal journey counts.
        if (reachedOffer) {
            path.add("OFFER");
            if (outcome == Outcome.OFFER_ACCEPTED) {
                path.add("ACCEPTED");
                return path;
            }
            if (outcome == Outcome.OFFER_DECLINED) {
                path.add("DECLINED");
                return path;
            }
        }
        // Only an active job is in progress. Anything else ends at its own outcome, so a paused job (or an offer
        // lost after it was made) isn't counted as still moving.
        path.add(outcome == Outcome.ACTIVE ? "IN_PROGRESS" : outcome.name());
        return path;
    }

    static String roundNode(InterviewType type) {
        return type.isPanel() ? MetricsService.PANEL_NODE : type.name();
    }
}
