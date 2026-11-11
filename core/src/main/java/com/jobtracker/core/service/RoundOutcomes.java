package com.jobtracker.core.service;

import com.jobtracker.core.dto.InterviewRoundCount;
import com.jobtracker.core.dto.RoundJobRef;
import com.jobtracker.core.model.InterviewRound;
import com.jobtracker.core.model.InterviewType;
import com.jobtracker.core.model.Job;
import com.jobtracker.core.model.Outcome;
import com.jobtracker.core.model.Stage;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

final class RoundOutcomes {

    private enum RoundVerdict { PASSED, NOT_PASSED, UNDECIDED }

    // Non-panel rounds this close together are the same visit. Wide enough for a morning and an
    // afternoon slot, short enough that an evening round and the next morning stay separate.
    private static final Duration SAME_VISIT = Duration.ofHours(12);

    // One time in front of an employer. A panel loop is a single unit under the PANEL node, since
    // that is the level its result is known at; anything else is the round's own type.
    private record LoopOutcome(String node, RoundVerdict verdict, Job job, List<InterviewType> types) {
    }

    private RoundOutcomes() {
    }

    // Only rounds already held: one still booked hasn't been faced, and a job closed before it happened
    // stopped at the round before.
    static List<InterviewRoundCount> count(List<Job> ownerJobs,
            Map<Long, List<InterviewRound>> roundsByJobId, Map<Long, Stage> furthestByJobId, Instant now) {
        List<LoopOutcome> outcomes = new ArrayList<>();
        for (Job job : ownerJobs) {
            List<InterviewRound> typed = roundsByJobId.getOrDefault(job.getId(), List.of()).stream()
                    .filter(round -> round.getInterviewDateTime() != null && round.getInterviewType() != null)
                    .toList();
            List<InterviewRound> rounds = typed.stream()
                    .filter(round -> !round.getInterviewDateTime().isAfter(now))
                    .sorted(Comparator.comparing(InterviewRound::getInterviewDateTime))
                    .toList();
            boolean nextBooked = rounds.size() < typed.size();
            List<List<InterviewRound>> loops = loops(rounds);
            RoundVerdict lastVerdict = lastRoundVerdict(job, furthestByJobId.get(job.getId()), nextBooked);
            for (int i = 0; i < loops.size(); i++) {
                List<InterviewRound> loop = loops.get(i);
                // Being invited back is the pass, and that is decided between loops, never inside
                // one: clearing the coding slot of a panel is not the employer moving you on.
                RoundVerdict verdict = i == loops.size() - 1 ? lastVerdict : RoundVerdict.PASSED;
                List<InterviewType> types = loop.stream().map(InterviewRound::getInterviewType).toList();
                if (types.stream().anyMatch(InterviewType::isPanel)) {
                    outcomes.add(new LoopOutcome(MetricsService.PANEL_NODE, verdict, job, types));
                    continue;
                }
                for (InterviewType type : types) {
                    outcomes.add(new LoopOutcome(type.name(), verdict, job, List.of(type)));
                }
            }
        }
        return rowsFor(outcomes);
    }

    // Panel types collapse into one row, placed where the first of them sits so the order still
    // reads roughly as a pipeline.
    private static List<InterviewRoundCount> rowsFor(List<LoopOutcome> outcomes) {
        List<InterviewRoundCount> rows = new ArrayList<>();
        boolean panelAdded = false;
        for (InterviewType type : InterviewType.values()) {
            if (!type.isPanel()) {
                rows.add(row(type.name(), outcomes));
            } else if (!panelAdded) {
                rows.add(row(MetricsService.PANEL_NODE, outcomes));
                panelAdded = true;
            }
        }
        return rows;
    }

    private static InterviewRoundCount row(String node, List<LoopOutcome> outcomes) {
        List<LoopOutcome> forNode = outcomes.stream().filter(o -> o.node().equals(node)).toList();
        return new InterviewRoundCount(node, forNode.size(),
                countOf(forNode, RoundVerdict.PASSED),
                countOf(forNode, RoundVerdict.NOT_PASSED),
                jobsWith(forNode, RoundVerdict.PASSED, node),
                jobsWith(forNode, RoundVerdict.NOT_PASSED, node));
    }

    // One loop is one decision the employer makes, however many rounds it took to get there.
    private static List<List<InterviewRound>> loops(List<InterviewRound> rounds) {
        List<List<InterviewRound>> loops = new ArrayList<>();
        for (InterviewRound round : rounds) {
            List<InterviewRound> current = loops.isEmpty() ? null : loops.get(loops.size() - 1);
            if (current != null && sameLoop(current.get(current.size() - 1), round)) {
                current.add(round);
            } else {
                loops.add(new ArrayList<>(List.of(round)));
            }
        }
        return loops;
    }

    // Consecutive panel rounds are one loop however far apart: an onsite split over two days is
    // still one verdict, and no calendar gap can tell that apart from two separate steps.
    private static boolean sameLoop(InterviewRound previous, InterviewRound round) {
        if (previous.getInterviewType().isPanel() && round.getInterviewType().isPanel()) {
            return true;
        }
        return Duration.between(previous.getInterviewDateTime(), round.getInterviewDateTime())
                .compareTo(SAME_VISIT) < 0;
    }

    private static long countOf(List<LoopOutcome> outcomes, RoundVerdict verdict) {
        return outcomes.stream().filter(outcome -> outcome.verdict() == verdict).count();
    }

    // Grouped by job, so one company facing this twice reads as one application, not two.
    // Keyed by id rather than the entity, which has no equals and would group by instance identity.
    private static List<RoundJobRef> jobsWith(List<LoopOutcome> outcomes, RoundVerdict verdict, String node) {
        Map<Long, List<LoopOutcome>> byJob = outcomes.stream()
                .filter(outcome -> outcome.verdict() == verdict)
                .collect(Collectors.groupingBy(outcome -> outcome.job().getId(),
                        LinkedHashMap::new, Collectors.toList()));
        return byJob.values().stream()
                .map(group -> {
                    Job job = group.get(0).job();
                    // What this company's panel actually held. A single-type row would just repeat
                    // its own label, so it carries nothing.
                    List<InterviewType> components = MetricsService.PANEL_NODE.equals(node)
                            ? group.stream().flatMap(outcome -> outcome.types().stream()).toList()
                            : List.of();
                    return new RoundJobRef(job.getId(), job.getCompany(), job.getRole(),
                            group.size(), components);
                })
                .toList();
    }

    // Withdrawing or the req closing says nothing about how the round went, so neither is a failure;
    // an open pipeline has not judged the round yet either.
    private static RoundVerdict lastRoundVerdict(Job job, Stage furthest, boolean nextBooked) {
        Outcome outcome = job.getOutcome();
        if (job.reachedOffer(furthest)) {
            return RoundVerdict.PASSED;
        }
        // Ghosting after a round is a rejection nobody sent, so it counts as one.
        if (outcome == Outcome.REJECTED || outcome == Outcome.GHOSTED) {
            return RoundVerdict.NOT_PASSED;
        }
        // A round booked after it is the invitation back, even before it's held.
        return nextBooked ? RoundVerdict.PASSED : RoundVerdict.UNDECIDED;
    }
}
