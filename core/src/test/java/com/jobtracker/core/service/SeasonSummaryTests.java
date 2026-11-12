package com.jobtracker.core.service;

import com.jobtracker.core.dto.SeasonSummary;
import com.jobtracker.core.model.*;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

class SeasonSummaryTests {

    private static final Instant APPLIED = Instant.parse("2026-03-01T00:00:00Z");
    private static final Instant NOW = Instant.parse("2026-11-01T00:00:00Z");
    private static final User OWNER = new User("hunter", "hash");

    private final List<Job> jobs = new ArrayList<>();
    private final Map<Long, JobJourney> journeys = new HashMap<>();
    private final Map<Long, List<JobLink>> links = new HashMap<>();
    private final Map<Long, List<StageHistoryEntry>> histories = new HashMap<>();
    private final Map<Long, Offer> offers = new HashMap<>();

    // The days the Offers page keeps on an accepted offer.
    private void accepted(Job job, String acceptedOn, String startDate) {
        Offer offer = new Offer(null, null, null, null, null, null, null, null, null, null);
        offer.accept(LocalDate.parse(acceptedOn), LocalDate.parse(startDate));
        offers.put(job.getId(), offer);
    }

    // A job applied to `appliedDaysIn` days after APPLIED, closed (when closedDaysAfter isn't null) that many
    // days after its own application.
    private Job job(String company, int appliedDaysIn, Outcome outcome, Double closedDaysAfter) {
        long id = jobs.size() + 1;
        Instant applied = APPLIED.plus(Duration.ofDays(appliedDaysIn));
        Job job = new Job(company, "Engineer", OWNER, SourceCategory.SELF_APPLIED, null, null, null, null);
        job.restoreState(outcome.closesPipeline() ? Stage.FINALIZED : Stage.RESUME_CHECK, null, outcome, applied);
        ReflectionTestUtils.setField(job, "id", id);
        jobs.add(job);
        List<StageHistoryEntry> history = new ArrayList<>(List.of(new StageHistoryEntry(Stage.RESUME_CHECK, applied, null)));
        if (closedDaysAfter != null) {
            history.add(new StageHistoryEntry(Stage.FINALIZED,
                    applied.plus(Duration.ofMinutes(Math.round(closedDaysAfter * 24 * 60))), null));
        }
        histories.put(id, history);
        return job;
    }

    // The older posting was replaced by the newer, as a repost linked in the job dialog records it.
    private void reposted(Job older, Job newer) {
        links.computeIfAbsent(older.getId(), id -> new ArrayList<>()).add(new JobLink(newer.getId(), JobRelation.REPLACED_BY));
        links.computeIfAbsent(newer.getId(), id -> new ArrayList<>()).add(new JobLink(older.getId(), JobRelation.REPLACES));
    }

    private SeasonSummary summary(Season season) {
        for (Job job : jobs) {
            journeys.put(job.getId(), new JobJourney(job.getId(), histories.get(job.getId()), List.of(),
                    links.getOrDefault(job.getId(), List.of())));
        }
        return MetricsService.seasonSummary(season, jobs, journeys, offers, Map.of(), NOW);
    }

    private static Season season() {
        Season season = new Season(1L, "Spring hunt");
        ReflectionTestUtils.setField(season, "id", 5L);
        return season;
    }

    @Test
    void responseTimeAveragesApplyingToBeingTurnedDownClosedOrGhosted() {
        job("Initech", 0, Outcome.REJECTED, 4.0);
        job("Globex", 0, Outcome.POSITION_CLOSED, 10.0);
        job("Hooli", 0, Outcome.GHOSTED, 31.0);
        job("Acme", 0, Outcome.WITHDRAWN, 2.0);
        job("Umbrella", 0, Outcome.ACTIVE, null);

        SeasonSummary summary = summary(season());

        assertThat(summary.averageResponseDays()).isEqualTo(15.0);
        assertThat(summary.responsesMeasured()).isEqualTo(3);
        assertThat(summary.closedApplications()).isEqualTo(3);
        assertThat(summary.applications()).isEqualTo(5);
    }

    // An import knows when a job was applied to but not when it closed, so its closure lands a moment after.
    @Test
    void aClosureWithNoRealDateIsCountedAsClosedButLeftOutOfTheAverage() {
        job("Initech", 0, Outcome.REJECTED, 6.0);
        job("Imported", 0, Outcome.REJECTED, 2.0 / (24 * 60 * 60 * 1000));

        SeasonSummary summary = summary(season());

        assertThat(summary.averageResponseDays()).isEqualTo(6.0);
        assertThat(summary.responsesMeasured()).isEqualTo(1);
        assertThat(summary.closedApplications()).isEqualTo(2);
    }

    // A role reposted is one pursuit: it starts at the first application and ends where the last posting did.
    @Test
    void aRepostedRoleRunsFromItsFirstApplicationToItsLastPostingsEnd() {
        Job first = job("Initech", 0, Outcome.POSITION_CLOSED, 20.0);
        Job repost = job("Initech", 25, Outcome.REJECTED, 5.0);
        reposted(first, repost);

        SeasonSummary summary = summary(season());

        assertThat(summary.applications()).isEqualTo(1);
        assertThat(summary.closedApplications()).isEqualTo(1);
        assertThat(summary.averageResponseDays()).isEqualTo(30.0);
    }

    @Test
    void theOfferTakenRunsFromTheFirstApplicationOfItsChainToTheDayItWasAccepted() {
        Job first = job("Initech", 0, Outcome.POSITION_CLOSED, 20.0);
        Job repost = job("Initech", 25, Outcome.OFFER_ACCEPTED, null);
        reposted(first, repost);
        Season season = season();
        accepted(repost, "2026-04-15", "2026-05-04");
        season.close(NOW, repost.getId());

        SeasonSummary.AcceptedOffer offer = summary(season).acceptedOffer();

        assertThat(offer.jobId()).isEqualTo(repost.getId());
        assertThat(offer.company()).isEqualTo("Initech");
        assertThat(offer.applied()).isEqualTo(APPLIED);
        assertThat(offer.acceptedOn()).isEqualTo(LocalDate.parse("2026-04-15"));
        assertThat(offer.startsOn()).isEqualTo(LocalDate.parse("2026-05-04"));
        assertThat(offer.daysToAccept()).isEqualTo(45);
    }

    // What closing can name as the offer taken, with the days set on it: one per role, its newest posting.
    @Test
    void itListsTheOffersMadeOncePerRoleWithTheirDays() {
        Job first = job("Initech", 0, Outcome.POSITION_CLOSED, 20.0);
        Job repost = job("Initech", 25, Outcome.OFFER_ACCEPTED, null);
        reposted(first, repost);
        accepted(repost, "2026-04-15", "2026-05-04");
        Job undecided = job("Globex", 3, Outcome.ACTIVE, null);
        undecided.restoreState(Stage.OFFER_STAGE, null, Outcome.ACTIVE, undecided.getCreatedAt());
        job("Hooli", 5, Outcome.REJECTED, 4.0);

        assertThat(summary(season()).offers())
                .extracting(SeasonSummary.OfferMade::company, SeasonSummary.OfferMade::accepted,
                        SeasonSummary.OfferMade::acceptedOn, SeasonSummary.OfferMade::startDate)
                .containsExactlyInAnyOrder(
                        tuple("Initech", true, LocalDate.parse("2026-04-15"), LocalDate.parse("2026-05-04")),
                        tuple("Globex", false, null, null));
    }

    @Test
    void aHuntThatEndedWithoutAnOfferHasNone() {
        job("Initech", 0, Outcome.REJECTED, 4.0);
        Season season = season();
        season.close(NOW, null);

        SeasonSummary summary = summary(season);

        assertThat(summary.acceptedOffer()).isNull();
        assertThat(summary.closedAt()).isEqualTo(NOW);
        assertThat(summary.firstApplied()).isEqualTo(APPLIED);
    }
}
