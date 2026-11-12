package com.jobtracker.core.service;

import com.jobtracker.core.dto.FunnelStageCount;
import com.jobtracker.core.dto.MetricsResponse;
import com.jobtracker.core.dto.MetricsSummary;
import com.jobtracker.core.dto.OutcomeCount;
import com.jobtracker.core.dto.ResumeResponseRate;
import com.jobtracker.core.dto.InterviewRoundCount;
import com.jobtracker.core.dto.SeasonStats;
import com.jobtracker.core.dto.SeasonSummary;
import com.jobtracker.core.dto.WeeklyActivity;
import com.jobtracker.core.model.InterviewRound;
import com.jobtracker.core.model.Job;
import com.jobtracker.core.model.JobDetail;
import com.jobtracker.core.model.JobJourney;
import com.jobtracker.core.model.JobLink;
import com.jobtracker.core.model.JobResume;
import com.jobtracker.core.model.Offer;
import com.jobtracker.core.model.Outcome;
import com.jobtracker.core.model.Season;
import com.jobtracker.core.model.Stage;
import com.jobtracker.core.model.StageHistoryEntry;
import com.jobtracker.core.repository.JobDetailRepository;
import com.jobtracker.core.repository.JobRepository;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class MetricsService {

    // Shared by the round rows and the Sankey: every panel type collapses into this one node.
    static final String PANEL_NODE = "PANEL";

    // FINALIZED is a terminal marker, not a pipeline stage; closure is reported as outcome rows.
    private static final List<Stage> PIPELINE_STAGES = Arrays.stream(Stage.values())
            .filter(stage -> stage != Stage.FINALIZED)
            .toList();

    private final JobRepository jobs;
    private final JobDetailRepository jobDetails;
    private final SeasonService seasons;
    private final Clock clock;

    public MetricsService(JobRepository jobs, JobDetailRepository jobDetails, SeasonService seasons, Clock clock) {
        this.jobs = jobs;
        this.jobDetails = jobDetails;
        this.seasons = seasons;
        this.clock = clock;
    }

    public MetricsResponse getMetrics(Long ownerId) {
        List<Job> ownerJobs = jobs.findByOwnerIdOrderByCreatedAtDesc(ownerId).stream()
                .filter(seasons.inView(ownerId))
                .toList();
        // One document per job carries both the stage history and the rounds; the JD blobs are projected away.
        Map<Long, JobJourney> detailsByJobId = jobDetails.findJourneysByOwnerId(ownerId).stream()
                .collect(Collectors.toMap(JobJourney::jobId, Function.identity(), (a, b) -> a));
        Map<Long, Stage> furthestByJobId = furthestStagesByJobId(ownerJobs, detailsByJobId);
        // Keyed by the owner's jobs, so a document left by a deleted job can't steer the Sankey's round order.
        Map<Long, List<InterviewRound>> roundsByJobId = ownerJobs.stream()
                .filter(job -> detailsByJobId.containsKey(job.getId()))
                .collect(Collectors.toMap(Job::getId, job -> detailsByJobId.get(job.getId()).interviews()));
        Instant now = clock.instant();
        Map<Long, List<JobLink>> linksByJobId = detailsByJobId.values().stream()
                .collect(Collectors.toMap(JobJourney::jobId, JobJourney::relatedJobs));
        SankeyBuilder.SankeyData sankey = SankeyBuilder.build(ownerJobs, linksByJobId, furthestByJobId, roundsByJobId, now);
        return new MetricsResponse(
                summary(ownerJobs, roundsByJobId, now), funnel(ownerJobs, furthestByJobId), outcomeCounts(ownerJobs),
                RoundOutcomes.count(ownerJobs, roundsByJobId, furthestByJobId, now),
                sankey.links(), sankey.nodeOrder(), sankey.paths(),
                weeklyActivity(ownerJobs, roundsByJobId, now),
                resumeResponses(ownerJobs, jobDetails.findSentResumesByOwnerId(ownerId), furthestByJobId));
    }

    // A reply is the recruiter reaching out or anything past it, which is what a resume can earn on its own.
    static List<ResumeResponseRate> resumeResponses(List<Job> ownerJobs, List<JobResume> sent,
            Map<Long, Stage> furthestByJobId) {
        Map<Long, String> resumeByJobId = sent.stream()
                .collect(Collectors.toMap(JobResume::jobId, JobResume::sentResume, (a, b) -> a));
        Map<String, long[]> counts = new LinkedHashMap<>();
        for (Job job : ownerJobs) {
            String resume = resumeByJobId.get(job.getId());
            if (resume == null) continue;
            long[] count = counts.computeIfAbsent(resume, key -> new long[2]);
            count[0]++;
            Stage furthest = furthestByJobId.get(job.getId());
            if (furthest != null && furthest.ordinal() >= Stage.INTERVIEW_REQUEST.ordinal()) count[1]++;
        }
        return counts.entrySet().stream()
                .map(entry -> new ResumeResponseRate(entry.getKey(), entry.getValue()[0], entry.getValue()[1]))
                .sorted(Comparator.comparingLong(ResumeResponseRate::responses).reversed()
                        .thenComparing(ResumeResponseRate::resume))
                .toList();
    }

    // Every season, not just the one shown: the Seasons page compares them side by side.
    public List<SeasonStats> seasonStats(Long ownerId) {
        List<Job> ownerJobs = jobs.findByOwnerIdOrderByCreatedAtDesc(ownerId);
        Map<Long, JobJourney> detailsByJobId = jobDetails.findJourneysByOwnerId(ownerId).stream()
                .collect(Collectors.toMap(JobJourney::jobId, Function.identity(), (a, b) -> a));
        Map<Long, Stage> furthestByJobId = furthestStagesByJobId(ownerJobs, detailsByJobId);
        return ownerJobs.stream()
                .collect(Collectors.groupingBy(Job::getSeasonId, LinkedHashMap::new, Collectors.toList()))
                .entrySet().stream()
                .map(season -> seasonStats(season.getKey(), season.getValue(), furthestByJobId))
                .toList();
    }

    static SeasonStats seasonStats(Long seasonId, List<Job> seasonJobs, Map<Long, Stage> furthestByJobId) {
        long active = 0;
        long heardBack = 0;
        long interviewed = 0;
        long offers = 0;
        for (Job job : seasonJobs) {
            Stage furthest = furthestByJobId.get(job.getId());
            int reached = furthest == null ? -1 : furthest.ordinal();
            if (job.getOutcome() == Outcome.ACTIVE) active++;
            if (reached >= Stage.INTERVIEW_REQUEST.ordinal() || job.hasOffer()) heardBack++;
            if (reached >= Stage.INTERVIEW_STAGE.ordinal() || job.hasOffer()) interviewed++;
            if (job.reachedOffer(furthest)) offers++;
        }
        Instant first = seasonJobs.stream().map(Job::getCreatedAt).min(Comparator.naturalOrder()).orElse(null);
        Instant last = seasonJobs.stream().map(Job::getCreatedAt).max(Comparator.naturalOrder()).orElse(null);
        return new SeasonStats(seasonId, seasonJobs.size(), active, heardBack, interviewed, offers, first, last);
    }

    public SeasonSummary seasonSummary(Long ownerId, Long seasonId) {
        Season season = seasons.get(ownerId, seasonId);
        List<Job> seasonJobs = jobs.findByOwnerIdAndSeasonIdOrderByCreatedAtDesc(ownerId, seasonId);
        Map<Long, JobJourney> detailsByJobId = jobDetails.findJourneysByOwnerId(ownerId).stream()
                .collect(Collectors.toMap(JobJourney::jobId, Function.identity(), (a, b) -> a));
        // Only the jobs with an offer: the journeys projection leaves offers out.
        Map<Long, Offer> offersByJobId = jobDetails.findByOwnerIdAndJobIdIn(ownerId,
                        seasonJobs.stream().filter(Job::hasOffer).map(Job::getId).toList()).stream()
                .filter(detail -> detail.getOffer() != null)
                .collect(Collectors.toMap(JobDetail::getJobId, JobDetail::getOffer, (a, b) -> a));
        return seasonSummary(season, seasonJobs, detailsByJobId, offersByJobId,
                furthestStagesByJobId(seasonJobs, detailsByJobId), clock.instant());
    }

    // An import knows when a job was applied to but not when it closed, so it stamps the closure a moment
    // after; nothing real answers that fast, so a closure inside this is no date at all.
    static final Duration NO_REAL_CLOSURE = Duration.ofMinutes(1);
    private static final Set<Outcome> ANSWERED = EnumSet.of(Outcome.REJECTED, Outcome.POSITION_CLOSED, Outcome.GHOSTED);

    static SeasonSummary seasonSummary(Season season, List<Job> seasonJobs, Map<Long, JobJourney> detailsByJobId,
            Map<Long, Offer> offersByJobId, Map<Long, Stage> furthestByJobId, Instant now) {
        Map<Long, List<JobLink>> linksByJobId = detailsByJobId.values().stream()
                .collect(Collectors.toMap(JobJourney::jobId, JobJourney::relatedJobs));
        // Each journey leads with its newest posting, which is where it ended.
        List<List<Job>> journeys = SankeyBuilder.journeys(seasonJobs, linksByJobId);

        long closed = 0;
        List<Double> responseDays = new ArrayList<>();
        for (List<Job> journey : journeys) {
            Job last = journey.get(0);
            if (!ANSWERED.contains(last.getOutcome())) continue;
            closed++;
            JobJourney detail = detailsByJobId.get(last.getId());
            Instant answered = detail == null ? null : detail.stageHistory().stream()
                    .filter(entry -> entry.getStage() == Stage.FINALIZED)
                    .map(StageHistoryEntry::getEnteredAt)
                    .max(Comparator.naturalOrder())
                    .orElse(null);
            if (answered == null || Duration.between(last.getCreatedAt(), answered).compareTo(NO_REAL_CLOSURE) < 0) {
                continue;
            }
            responseDays.add(Duration.between(firstApplied(journey), answered).toMinutes() / (60.0 * 24));
        }
        Double averageDays = responseDays.isEmpty() ? null
                : Math.round(responseDays.stream().mapToDouble(Double::doubleValue).average().orElseThrow() * 10) / 10.0;

        Map<Long, List<InterviewRound>> roundsByJobId = seasonJobs.stream()
                .filter(job -> detailsByJobId.containsKey(job.getId()))
                .collect(Collectors.toMap(Job::getId, job -> detailsByJobId.get(job.getId()).interviews()));
        List<InterviewRoundCount> rounds = RoundOutcomes.count(seasonJobs, roundsByJobId, furthestByJobId, now);

        SeasonSummary.AcceptedOffer accepted = journeys.stream()
                .filter(journey -> journey.stream().anyMatch(job -> job.getId().equals(season.getAcceptedJobId())))
                .findFirst()
                .map(journey -> {
                    Job job = journey.get(0);
                    Instant applied = firstApplied(journey);
                    Offer offer = offersByJobId.get(season.getAcceptedJobId());
                    LocalDate acceptedOn = offer == null ? null : offer.getAcceptedOn();
                    Long days = acceptedOn == null ? null
                            : ChronoUnit.DAYS.between(applied.atZone(ZoneOffset.UTC).toLocalDate(), acceptedOn);
                    return new SeasonSummary.AcceptedOffer(job.getId(), job.getCompany(), job.getRole(), applied,
                            acceptedOn, offer == null ? null : offer.getStartDate(), days);
                })
                .orElse(null);

        return new SeasonSummary(season.getId(), season.getName(), season.getClosedAt(),
                seasonJobs.stream().map(Job::getCreatedAt).min(Comparator.naturalOrder()).orElse(null),
                journeys.size(), averageDays, responseDays.size(), closed,
                rounds.stream().mapToLong(InterviewRoundCount::passed).sum(),
                rounds.stream().mapToLong(InterviewRoundCount::notPassed).sum(),
                rounds, accepted,
                journeys.stream().map(journey -> journey.get(0)).filter(Job::hasOffer)
                        .map(job -> {
                            Offer offer = offersByJobId.get(job.getId());
                            return new SeasonSummary.OfferMade(job.getId(), job.getCompany(), job.getRole(),
                                    job.getOutcome() == Outcome.OFFER_ACCEPTED,
                                    offer == null ? null : offer.getAcceptedOn(), offer == null ? null : offer.getStartDate());
                        })
                        .toList());
    }

    private static Instant firstApplied(List<Job> journey) {
        return journey.stream().map(Job::getCreatedAt).min(Comparator.naturalOrder()).orElseThrow();
    }

    static final int ACTIVITY_WEEKS = 12;

    // createdAt is when the job was applied to (an import sets it from the sheet); a round counts once held.
    static List<WeeklyActivity> weeklyActivity(List<Job> ownerJobs, Map<Long, List<InterviewRound>> roundsByJobId,
            Instant now) {
        LocalDate thisWeek = now.atZone(ZoneOffset.UTC).toLocalDate().with(DayOfWeek.MONDAY);
        LocalDate firstWeek = thisWeek.minusWeeks(ACTIVITY_WEEKS - 1);
        int[] applications = new int[ACTIVITY_WEEKS];
        int[] interviews = new int[ACTIVITY_WEEKS];
        for (Job job : ownerJobs) {
            count(applications, firstWeek, job.getCreatedAt());
            for (InterviewRound round : roundsByJobId.getOrDefault(job.getId(), List.of())) {
                if (round.getInterviewDateTime() != null && round.getInterviewDateTime().isBefore(now)) {
                    count(interviews, firstWeek, round.getInterviewDateTime());
                }
            }
        }
        List<WeeklyActivity> weeks = new ArrayList<>();
        for (int i = 0; i < ACTIVITY_WEEKS; i++) {
            weeks.add(new WeeklyActivity(firstWeek.plusWeeks(i), applications[i], interviews[i]));
        }
        return weeks;
    }

    private static void count(int[] weeks, LocalDate firstWeek, Instant at) {
        // In days: WEEKS.between rounds toward zero, which would put a date just before the window in its first week.
        long days = ChronoUnit.DAYS.between(firstWeek, at.atZone(ZoneOffset.UTC).toLocalDate());
        if (days >= 0 && days / 7 < weeks.length) {
            weeks[(int) (days / 7)]++;
        }
    }

    // Upcoming follows the banner's rule: a round counts until it ends, and a closed job's leftover round never does.
    private MetricsSummary summary(List<Job> ownerJobs, Map<Long, List<InterviewRound>> roundsByJobId, Instant now) {
        long done = 0;
        long upcoming = 0;
        for (Job job : ownerJobs) {
            for (InterviewRound round : roundsByJobId.getOrDefault(job.getId(), List.of())) {
                if (round.getInterviewDateTime() == null) {
                    continue;
                }
                Instant over = round.getInterviewEndDateTime() != null
                        ? round.getInterviewEndDateTime() : round.getInterviewDateTime();
                if (over.isBefore(now)) {
                    done++;
                } else if (!job.getOutcome().closesPipeline()) {
                    upcoming++;
                }
            }
        }
        List<Job> active = ownerJobs.stream().filter(job -> job.getOutcome() == Outcome.ACTIVE).toList();
        return new MetricsSummary(
                ownerJobs.size(),
                active.size(),
                active.stream().filter(job -> job.getCurrentStage().isOnBoard()).count(),
                done,
                upcoming,
                // Jobs come newest first.
                ownerJobs.stream().filter(job -> job.getOutcome() == Outcome.OFFER_ACCEPTED)
                        .map(Job::getCompany).findFirst().orElse(null));
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
}
