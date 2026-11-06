package com.jobtracker.core.service;

import com.jobtracker.core.model.Contact;
import com.jobtracker.core.model.InterviewRound;
import com.jobtracker.core.model.InterviewType;
import com.jobtracker.core.model.Job;
import com.jobtracker.core.model.Offer;
import com.jobtracker.core.model.Outcome;
import com.jobtracker.core.model.ReminderSettings;
import com.jobtracker.core.model.SourceCategory;
import com.jobtracker.core.model.Stage;
import com.jobtracker.core.model.User;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class ReminderPlannerTests {

    // 10:00 in New York, so the default 8am digest hour has already passed and no digest gets in the way.
    private static final Instant NOW = Instant.parse("2026-08-10T14:00:00Z");
    private static final String ZONE = "America/New_York";

    private static long nextId = 0;

    private static Job job(String company, Stage stage, Outcome outcome, Instant createdAt) {
        Job job = new Job(company, "Engineer", new User("owner", "hash"), SourceCategory.SELF_APPLIED,
                null, null, null, null);
        job.applyUpdate(company, "Engineer", SourceCategory.SELF_APPLIED, null, null, null, null, stage, null, outcome);
        ReflectionTestUtils.setField(job, "id", ++nextId);
        ReflectionTestUtils.setField(job, "createdAt", createdAt);
        return job;
    }

    private static Job job(String company, Stage stage, Outcome outcome) {
        return job(company, stage, outcome, NOW.minus(Duration.ofDays(1)));
    }

    private static InterviewRound round(Instant start) {
        return new InterviewRound(start, start.plus(Duration.ofHours(1)), InterviewType.SYSTEM_DESIGN,
                "https://meet.example/abc", null, List.of());
    }

    private static ReminderSettings settings(boolean digest, boolean interviewSoon, boolean offerDeadline, boolean followUp) {
        ReminderSettings settings = new ReminderSettings(1L);
        settings.update(true, "me@example.com", ZONE, digest, 8, interviewSoon, offerDeadline, followUp);
        return settings;
    }

    private static ReminderSettings everything() {
        return settings(true, true, true, true);
    }

    private static List<ReminderPlanner.Due> plan(ReminderSettings settings, List<Job> jobs,
            Map<Long, List<InterviewRound>> rounds, Map<Long, Offer> offers, Set<String> sent, Instant now) {
        return plan(settings, jobs, rounds, offers, Map.of(), sent, now);
    }

    private static List<ReminderPlanner.Due> plan(ReminderSettings settings, List<Job> jobs,
            Map<Long, List<InterviewRound>> rounds, Map<Long, Offer> offers, Map<Long, List<Contact>> contacts,
            Set<String> sent, Instant now) {
        return ReminderPlanner.plan(new ReminderPlanner.Input(settings, jobs, rounds, offers, contacts, sent), now,
                "https://localhost:5173");
    }

    private static Contact contact(String name, LocalDate followUpOn) {
        return new Contact(name, Contact.ContactRole.RECRUITER, null, null, null, null, followUpOn);
    }

    // The day you picked arrives: one email naming who, once, and only for a search still going.
    @Test
    void remindsToFollowUpWithAContactOnTheDayChosenOnceAndOnlyWhileTheJobIsActive() {
        Job waiting = job("Initech", Stage.WAITING_INTERVIEW_RESULTS, Outcome.ACTIVE);
        Job closed = job("Hooli", Stage.FINALIZED, Outcome.REJECTED);
        LocalDate today = NOW.atZone(ZoneId.of(ZONE)).toLocalDate();
        Map<Long, List<Contact>> contacts = Map.of(
                waiting.getId(), List.of(contact("Dana", today), contact("Later", today.plusDays(3))),
                closed.getId(), List.of(contact("Gone", today)));

        var due = plan(settings(false, false, false, true), List.of(waiting, closed), Map.of(), Map.of(), contacts,
                Set.of(), NOW);

        assertThat(due).hasSize(1);
        assertThat(due.get(0).subject()).isEqualTo("Follow up with Dana at Initech");
        assertThat(due.get(0).body()).doesNotContain("Later").doesNotContain("Gone");
        var again = plan(settings(false, false, false, true), List.of(waiting, closed), Map.of(), Map.of(), contacts,
                Set.copyOf(due.get(0).keys()), NOW);
        assertThat(again).isEmpty();
        assertThat(plan(settings(false, false, false, false), List.of(waiting), Map.of(), Map.of(), contacts,
                Set.of(), NOW)).isEmpty();
    }

    // "Spoke today" on or after the day settles the follow-up, so it never nags about a conversation already had.
    @Test
    void talkingToAContactOnOrAfterTheFollowUpDaySettlesIt() {
        LocalDate day = LocalDate.of(2026, 3, 10);
        assertThat(new Contact("Dana", Contact.ContactRole.RECRUITER, null, null, day, null, day).followUpOn()).isNull();
        assertThat(new Contact("Dana", Contact.ContactRole.RECRUITER, null, null, day.minusDays(1), null, day)
                .followUpOn()).isEqualTo(day);
    }

    @Test
    void remindsOfAnInterviewInTheHourBeforeItAndOnlyOnce() {
        Job interviewing = job("Initech", Stage.INTERVIEW_STAGE, Outcome.ACTIVE);
        for (var entry : Map.of(Duration.ofMinutes(30), true, Duration.ofMinutes(60), true,
                Duration.ofMinutes(90), false, Duration.ofMinutes(-10), false).entrySet()) {
            InterviewRound round = round(NOW.plus(entry.getKey()));
            var due = plan(everything(), List.of(interviewing), Map.of(interviewing.getId(), List.of(round)),
                    Map.of(), Set.of(), NOW);
            assertThat(due).as("starting in %s", entry.getKey()).hasSize(entry.getValue() ? 1 : 0);
            if (entry.getValue()) {
                assertThat(due.get(0).subject()).isEqualTo("System design with Initech at " + (entry.getKey().toMinutes() == 30 ? "10:30 AM" : "11:00 AM"));
                assertThat(due.get(0).body()).contains("Join: https://meet.example/abc");
                // The same round, already reminded, stays quiet on the next pass.
                assertThat(plan(everything(), List.of(interviewing), Map.of(interviewing.getId(), List.of(round)),
                        Map.of(), Set.copyOf(due.get(0).keys()), NOW)).isEmpty();
            }
        }
    }

    @Test
    void sendsNothingForAJobThatIsNoLongerActive() {
        for (Outcome outcome : Outcome.values()) {
            if (outcome == Outcome.ACTIVE) continue;
            Job job = job("Initech", Stage.INTERVIEW_STAGE, outcome);
            var due = plan(everything(), List.of(job), Map.of(job.getId(), List.of(round(NOW.plus(Duration.ofMinutes(30))))),
                    Map.of(), Set.of(), NOW);
            assertThat(due).as("%s", outcome).isEmpty();
        }
    }

    @Test
    void remindsOfAnOfferDeadlineInTheLastTwoDays() {
        LocalDate today = LocalDate.of(2026, 8, 10);
        for (var entry : Map.of(0, true, 2, true, 3, false, -1, false).entrySet()) {
            Job offered = job("Globex", Stage.OFFER_STAGE, Outcome.ACTIVE);
            Offer offer = new Offer(null, 150000, null, null, null, null, null, null, today.plusDays(entry.getKey()), null);
            var due = plan(settings(false, false, true, false), List.of(offered), Map.of(),
                    Map.of(offered.getId(), offer), Set.of(), NOW);
            assertThat(due).as("deadline in %s days", entry.getKey()).hasSize(entry.getValue() ? 1 : 0);
        }
    }

    private static final ReminderSettings FOLLOW_UP_ONLY = settings(false, false, false, true);

    private static List<ReminderPlanner.Due> followUps(Job job, List<InterviewRound> rounds, Set<String> sent, Instant now) {
        return plan(FOLLOW_UP_ONLY, List.of(job), Map.of(job.getId(), rounds), Map.of(), sent, now);
    }

    // An application nobody answered has no one to follow up with; only a job that got to an interview does.
    @Test
    void followsUpOnlyOnAJobThatHadAnInterviewAndNothingSince() {
        InterviewRound longAgo = round(NOW.minus(Duration.ofDays(20)));
        Job neverInterviewed = job("Acme", Stage.RESUME_CHECK, Outcome.ACTIVE, NOW.minus(Duration.ofDays(60)));
        Job interviewed = job("Initech", Stage.INTERVIEW_STAGE, Outcome.ACTIVE);
        Job waiting = job("Hooli", Stage.WAITING_INTERVIEW_RESULTS, Outcome.ACTIVE);
        Job offered = job("Globex", Stage.OFFER_STAGE, Outcome.ACTIVE);
        Job closed = job("Umbrella", Stage.INTERVIEW_STAGE, Outcome.REJECTED);

        assertThat(followUps(neverInterviewed, List.of(), Set.of(), NOW)).as("no interview").isEmpty();
        assertThat(followUps(interviewed, List.of(longAgo), Set.of(), NOW)).as("interviewed").hasSize(1);
        assertThat(followUps(waiting, List.of(longAgo), Set.of(), NOW)).as("waiting on results").hasSize(1);
        assertThat(followUps(offered, List.of(longAgo), Set.of(), NOW)).as("an offer is progress").isEmpty();
        assertThat(followUps(closed, List.of(longAgo), Set.of(), NOW)).as("closed").isEmpty();
        assertThat(followUps(interviewed, List.of(longAgo, round(NOW.plus(Duration.ofDays(2)))), Set.of(), NOW))
                .as("next round booked").isEmpty();
    }

    // Calendar days in the person's zone: a 4pm interview a week ago counts as 7 days at 10am, short of 168 hours.
    @Test
    void nudgesAtSevenAndFourteenCalendarDaysThenStops() {
        Job job = job("Initech", Stage.INTERVIEW_STAGE, Outcome.ACTIVE);
        InterviewRound round = new InterviewRound(Instant.parse("2026-08-03T19:00:00Z"), Instant.parse("2026-08-03T20:00:00Z"),
                InterviewType.SYSTEM_DESIGN, null, null, List.of());
        Set<String> sent = new java.util.HashSet<>();

        assertThat(followUps(job, List.of(round), sent, NOW.minus(Duration.ofDays(1)))).as("day 6").isEmpty();
        var seventh = followUps(job, List.of(round), sent, NOW);
        assertThat(seventh).hasSize(1);
        assertThat(seventh.get(0).subject()).isEqualTo("No news from Initech in 7 days since your interview");
        assertThat(seventh.get(0).body()).contains("- Initech, Engineer: System design on Mon, Aug 3, 7 days ago");
        sent.addAll(seventh.get(0).keys());

        assertThat(followUps(job, List.of(round), sent, NOW.plus(Duration.ofDays(3)))).as("day 10").isEmpty();
        var fourteenth = followUps(job, List.of(round), sent, NOW.plus(Duration.ofDays(7)));
        assertThat(fourteenth).hasSize(1);
        sent.addAll(fourteenth.get(0).keys());
        assertThat(followUps(job, List.of(round), sent, NOW.plus(Duration.ofDays(30)))).as("after 14").isEmpty();

        // A new interview starts the count over.
        InterviewRound next = round(NOW.plus(Duration.ofDays(10)));
        assertThat(followUps(job, List.of(round, next), sent, NOW.plus(Duration.ofDays(17)))).hasSize(1);
    }

    // Turning follow-ups on with a backlog: one email, and an old one gets the 14-day nudge only, never a late 7.
    @Test
    void batchesABacklogIntoOneEmailAndSkipsAStaleSevenDayNudge() {
        Job older = job("Initech", Stage.INTERVIEW_STAGE, Outcome.ACTIVE);
        Job newer = job("Hooli", Stage.WAITING_INTERVIEW_RESULTS, Outcome.ACTIVE);
        Map<Long, List<InterviewRound>> rounds = Map.of(
                older.getId(), List.of(round(NOW.minus(Duration.ofDays(20)))),
                newer.getId(), List.of(round(NOW.minus(Duration.ofDays(8)))));

        var due = plan(FOLLOW_UP_ONLY, List.of(newer, older), rounds, Map.of(), Set.of(), NOW);

        assertThat(due).hasSize(1);
        assertThat(due.get(0).subject()).isEqualTo("2 jobs quiet since your interview");
        assertThat(due.get(0).body().indexOf("Initech")).isLessThan(due.get(0).body().indexOf("Hooli"));
        assertThat(due.get(0).keys()).hasSize(3).allMatch(key -> key.startsWith("followup:"));
        assertThat(plan(FOLLOW_UP_ONLY, List.of(newer, older), rounds, Map.of(), Set.copyOf(due.get(0).keys()),
                NOW.plus(Duration.ofDays(1)))).isEmpty();
    }

    @Test
    void followUpsAreOffUntilChosen() {
        assertThat(new ReminderSettings(1L).isFollowUp()).isFalse();
    }

    @Test
    void sendsTheDigestOnlyDuringTheChosenHourInThePersonsOwnZoneAndNotOnAQuietDay() {
        Job interviewing = job("Initech", Stage.INTERVIEW_STAGE, Outcome.ACTIVE);
        Map<Long, List<InterviewRound>> tomorrow = Map.of(interviewing.getId(), List.of(round(NOW.plus(Duration.ofDays(1)))));
        ReminderSettings digestOnly = settings(true, false, false, false);
        // 8am in New York is 12:00 UTC in August.
        Instant eightAm = Instant.parse("2026-08-10T12:15:00Z");

        var due = plan(digestOnly, List.of(interviewing), tomorrow, Map.of(), Set.of(), eightAm);
        assertThat(due).hasSize(1);
        assertThat(due.get(0).subject()).isEqualTo("Your job search for Mon, Aug 10");
        assertThat(due.get(0).body()).contains("Interviews today and tomorrow").contains("with Initech");

        assertThat(plan(digestOnly, List.of(interviewing), tomorrow, Map.of(), Set.of(), NOW)).as("10am").isEmpty();
        assertThat(plan(digestOnly, List.of(interviewing), tomorrow, Map.of(), Set.copyOf(due.get(0).keys()), eightAm))
                .as("already sent today").isEmpty();
        assertThat(plan(digestOnly, List.of(), Map.of(), Map.of(), Set.of(), eightAm)).as("quiet day").isEmpty();
    }

    @Test
    void theDigestListsRoundsToScheduleByCoresOwnRule() {
        Job waitingToBook = job("Initech", Stage.INTERVIEW_STAGE, Outcome.ACTIVE);
        Job booked = job("Globex", Stage.INTERVIEW_STAGE, Outcome.ACTIVE);
        Instant eightAm = Instant.parse("2026-08-10T12:15:00Z");

        var due = plan(settings(true, false, false, false), List.of(waitingToBook, booked),
                Map.of(waitingToBook.getId(), List.of(round(NOW.minus(Duration.ofDays(3)))),
                        booked.getId(), List.of(round(NOW.plus(Duration.ofDays(5))))),
                Map.of(), Set.of(), eightAm);

        String body = due.get(0).body();
        assertThat(body).contains("Rounds to schedule\n- Initech, Engineer");
        assertThat(body.substring(body.indexOf("Rounds to schedule"))).doesNotContain("Globex");
    }

    @Test
    void eachKindCanBeTurnedOffOnItsOwn() {
        Job interviewing = job("Initech", Stage.INTERVIEW_STAGE, Outcome.ACTIVE);
        var due = plan(settings(true, false, true, true), List.of(interviewing),
                Map.of(interviewing.getId(), List.of(round(NOW.plus(Duration.ofMinutes(30))))), Map.of(), Set.of(), NOW);
        assertThat(due).isEmpty();
    }

    @Test
    void sendsNothingToSomeoneWhoTurnedEmailOffOrNeverGaveAnAddress() {
        Job interviewing = job("Initech", Stage.INTERVIEW_STAGE, Outcome.ACTIVE);
        Map<Long, List<InterviewRound>> soon = Map.of(interviewing.getId(), List.of(round(NOW.plus(Duration.ofMinutes(30)))));
        ReminderSettings off = new ReminderSettings(1L);
        off.update(false, "me@example.com", ZONE, true, 8, true, true, true);
        ReminderSettings noAddress = new ReminderSettings(1L);
        noAddress.update(true, null, ZONE, true, 8, true, true, true);

        assertThat(plan(off, List.of(interviewing), soon, Map.of(), Set.of(), NOW)).as("turned off").isEmpty();
        assertThat(plan(noAddress, List.of(interviewing), soon, Map.of(), Set.of(), NOW)).as("no address").isEmpty();
        assertThat(plan(new ReminderSettings(1L), List.of(interviewing), soon, Map.of(), Set.of(), NOW))
                .as("never set up").isEmpty();
    }

    @Test
    void anUnknownTimeZoneFallsBackToUtcRatherThanStoppingReminders() {
        assertThat(ReminderPlanner.zoneOf("Mars/Olympus").getId()).isEqualTo("UTC");
        assertThat(ReminderPlanner.zoneOf(null).getId()).isEqualTo("UTC");
        assertThat(ReminderPlanner.zoneOf(ZONE).getId()).isEqualTo(ZONE);
    }

    @Test
    void namesEveryRoundTypeReadably() {
        for (InterviewType type : InterviewType.values()) {
            String label = ReminderPlanner.typeLabel(type);
            assertThat(label).as("%s", type).doesNotContain("_").isNotBlank();
            assertThat(label.startsWith("Panel: ")).as("%s", type).isEqualTo(type.isPanel());
        }
    }
}
