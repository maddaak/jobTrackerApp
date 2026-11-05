package com.jobtracker.core.service;

import com.jobtracker.core.model.Contact;
import com.jobtracker.core.model.InterviewRound;
import com.jobtracker.core.model.InterviewType;
import com.jobtracker.core.model.Interviewer;
import com.jobtracker.core.model.Job;
import com.jobtracker.core.model.Offer;
import com.jobtracker.core.model.Outcome;
import com.jobtracker.core.model.ReminderSettings;
import java.time.DateTimeException;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

// What's due for one person, worked out from their jobs and the clock alone: no mail, no database, so every
// rule is tested directly. The scheduler sends what this returns and records its keys.
final class ReminderPlanner {

    static final Duration INTERVIEW_LEAD = Duration.ofHours(1);
    static final int DEADLINE_DAYS_AHEAD = 2;
    // Calendar days after the last interview with nothing since: a nudge at each, then silence.
    static final List<Integer> FOLLOW_UP_DAYS = List.of(7, 14);
    static final int DIGEST_DEADLINES_DAYS_AHEAD = 7;
    // The digest lists the longest-waiting few; the rest are a count, so it stays a glance.
    static final int DIGEST_LIST_LIMIT = 10;

    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("h:mm a", Locale.US);
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("EEE, MMM d", Locale.US);

    record Input(ReminderSettings settings, List<Job> jobs, Map<Long, List<InterviewRound>> roundsByJob,
            Map<Long, Offer> offersByJob, Map<Long, List<Contact>> contactsByJob, Set<String> alreadySent) {
    }

    // Someone you meant to get back to by today or earlier.
    record FollowUp(Job job, Contact contact) {
    }

    // Active jobs only: a closed search has nobody left to chase. Longest overdue first. Shared with the board's
    // list, so the email and the app agree on who is due.
    static List<FollowUp> followUpsDue(List<Job> jobs, Map<Long, List<Contact>> contactsByJob, LocalDate today) {
        return jobs.stream()
                .filter(job -> job.getOutcome() == Outcome.ACTIVE)
                .flatMap(job -> contactsByJob.getOrDefault(job.getId(), List.of()).stream()
                        .filter(contact -> contact.followUpDue(today))
                        .map(contact -> new FollowUp(job, contact)))
                .sorted(Comparator.comparing((FollowUp followUp) -> followUp.contact().followUpOn())
                        .thenComparing(followUp -> followUp.job().getCompany()))
                .toList();
    }

    // One email; keys are everything it covers, recorded together once it's sent.
    record Due(List<String> keys, String subject, String body) {
    }

    // A job whose last interview is over with nothing booked since, and how many calendar days ago it ended.
    private record Quiet(Job job, InterviewRound round, long days) {
    }

    private ReminderPlanner() {
    }

    static List<Due> plan(Input input, Instant now, String appUrl) {
        ReminderSettings settings = input.settings();
        // The pass already skips these; checked here too so no caller can email someone who opted out.
        if (!settings.isEmailEnabled() || settings.getEmail() == null) {
            return List.of();
        }
        ZoneId zone = zoneOf(settings.getTimeZone());
        Planning planning = new Planning(input, now, zone, appUrl);
        List<Due> due = new ArrayList<>();
        if (settings.isInterviewSoon()) due.addAll(planning.interviewsSoon());
        if (settings.isOfferDeadline()) due.addAll(planning.offerDeadlines());
        if (settings.isFollowUp()) {
            planning.followUps().ifPresent(due::add);
            planning.contactFollowUps().ifPresent(due::add);
        }
        if (settings.isDigest()) planning.digest(settings.getDigestHour()).ifPresent(due::add);
        return due;
    }

    // A zone the browser sent but this JVM doesn't know falls back to UTC rather than stopping reminders.
    static ZoneId zoneOf(String timeZone) {
        try {
            return timeZone == null || timeZone.isBlank() ? ZoneId.of("UTC") : ZoneId.of(timeZone);
        } catch (DateTimeException e) {
            return ZoneId.of("UTC");
        }
    }

    private record Planning(Input input, Instant now, ZoneId zone, String appUrl) {

        List<Due> interviewsSoon() {
            List<Due> due = new ArrayList<>();
            for (Job job : active()) {
                for (InterviewRound round : rounds(job)) {
                    Instant start = round.getInterviewDateTime();
                    String key = "interview:" + round.getRoundId() + ":" + start.getEpochSecond();
                    if (start.isAfter(now) && !start.isAfter(now.plus(INTERVIEW_LEAD)) && unsent(key)) {
                        due.add(new Due(List.of(key),
                                typeLabel(round.getInterviewType()) + " with " + job.getCompany() + " at " + time(start),
                                roundDetails(job, round) + footer()));
                    }
                }
            }
            return due;
        }

        List<Due> offerDeadlines() {
            List<Due> due = new ArrayList<>();
            LocalDate today = now.atZone(zone).toLocalDate();
            for (Job job : active()) {
                Offer offer = input.offersByJob().get(job.getId());
                if (!job.hasOffer() || offer == null || offer.getDecisionDeadline() == null) continue;
                LocalDate deadline = offer.getDecisionDeadline();
                long days = ChronoUnit.DAYS.between(today, deadline);
                String key = "deadline:" + job.getId() + ":" + deadline;
                if (days >= 0 && days <= DEADLINE_DAYS_AHEAD && unsent(key)) {
                    due.add(new Due(List.of(key),
                            "Decide on the " + job.getCompany() + " offer by " + deadline.format(DAY),
                            job.getCompany() + " (" + job.getRole() + ") asked for a decision by "
                                    + deadline.format(DAY) + ", " + daysLeft(days) + "." + footer()));
                }
            }
            return due;
        }

        // Batched into one email. A job past 14 days when first seen gets only the 14-day nudge: its 7-day key
        // is recorded with it, so the earlier one never arrives late.
        Optional<Due> followUps() {
            List<String> keys = new ArrayList<>();
            List<Quiet> due = new ArrayList<>();
            for (Quiet quiet : goneQuiet()) {
                List<String> reached = FOLLOW_UP_DAYS.stream()
                        .filter(days -> quiet.days() >= days)
                        .map(days -> followUpKey(quiet, days))
                        .toList();
                if (unsent(reached.get(reached.size() - 1))) {
                    due.add(quiet);
                    keys.addAll(reached);
                }
            }
            if (due.isEmpty()) return Optional.empty();
            String subject = due.size() == 1
                    ? "No news from " + due.get(0).job().getCompany() + " in " + due.get(0).days() + " days since your interview"
                    : due.size() + " jobs quiet since your interview";
            return Optional.of(new Due(keys, subject,
                    "Nothing has happened since your last interview for these. A short note to the recruiter"
                            + " often gets things moving.\n\n" + quietLines(due) + footer()));
        }

        // Once per follow-up date, so moving the date later asks again on the new day.
        Optional<Due> contactFollowUps() {
            List<FollowUp> due = followUpsDue(input.jobs(), input.contactsByJob(), now.atZone(zone).toLocalDate()).stream()
                    .filter(followUp -> unsent(contactKey(followUp)))
                    .toList();
            if (due.isEmpty()) return Optional.empty();
            String subject = due.size() == 1
                    ? "Follow up with " + due.get(0).contact().name() + " at " + due.get(0).job().getCompany()
                    : due.size() + " people to follow up with";
            return Optional.of(new Due(due.stream().map(ReminderPlanner::contactKey).toList(), subject,
                    "You set these to follow up on by today.\n\n"
                            + due.stream().map(this::followUpLine).collect(Collectors.joining("\n")) + footer()));
        }

        // Only during the chosen hour, so a restart in the afternoon doesn't send the morning email late.
        Optional<Due> digest(int digestHour) {
            ZonedDateTime local = now.atZone(zone);
            String key = "digest:" + local.toLocalDate();
            if (local.getHour() != digestHour || !unsent(key)) return Optional.empty();

            List<String> sections = new ArrayList<>();
            LocalDate today = local.toLocalDate();
            section(sections, "Interviews today and tomorrow", active().stream()
                    .flatMap(job -> rounds(job).stream()
                            .filter(round -> {
                                LocalDate day = round.getInterviewDateTime().atZone(zone).toLocalDate();
                                return !day.isBefore(today) && !day.isAfter(today.plusDays(1))
                                        && round.getInterviewDateTime().isAfter(now);
                            })
                            .sorted(Comparator.comparing(InterviewRound::getInterviewDateTime))
                            .map(round -> "- " + round.getInterviewDateTime().atZone(zone).format(DAY) + ", "
                                    + time(round.getInterviewDateTime()) + ": " + typeLabel(round.getInterviewType())
                                    + " with " + job.getCompany()))
                    .toList());
            section(sections, "Offer decisions due", active().stream()
                    .filter(job -> job.hasOffer() && deadlineOf(job) != null)
                    .filter(job -> {
                        long days = ChronoUnit.DAYS.between(today, deadlineOf(job));
                        return days >= 0 && days <= DIGEST_DEADLINES_DAYS_AHEAD;
                    })
                    .sorted(Comparator.comparing(this::deadlineOf))
                    .map(job -> "- " + job.getCompany() + ": decide by " + deadlineOf(job).format(DAY))
                    .toList());
            section(sections, "Rounds to schedule", active().stream()
                    .filter(job -> job.needsScheduling(InterviewRound.latest(rounds(job)).orElse(null), now))
                    .map(job -> "- " + job.getCompany() + ", " + job.getRole())
                    .toList());
            List<Quiet> quiet = goneQuiet();
            List<String> quietLines = new ArrayList<>(quiet.stream().limit(DIGEST_LIST_LIMIT).map(this::quietLine).toList());
            if (quiet.size() > DIGEST_LIST_LIMIT) quietLines.add("- and " + (quiet.size() - DIGEST_LIST_LIMIT) + " more");
            section(sections, "Quiet since your interview", quietLines);
            section(sections, "People to follow up with",
                    followUpsDue(input.jobs(), input.contactsByJob(), today).stream().map(this::followUpLine).toList());

            // A quiet day sends nothing, so the email only arrives when there's something to act on.
            if (sections.isEmpty()) return Optional.empty();
            return Optional.of(new Due(List.of(key), "Your job search for " + today.format(DAY),
                    String.join("\n\n", sections) + footer()));
        }

        private List<Job> active() {
            return input.jobs().stream().filter(job -> job.getOutcome() == Outcome.ACTIVE).toList();
        }

        private List<InterviewRound> rounds(Job job) {
            return input.roundsByJob().getOrDefault(job.getId(), List.of()).stream()
                    .filter(round -> round.getInterviewDateTime() != null)
                    .toList();
        }

        // Only jobs that got as far as an interview: an application nobody answered has no one to follow up
        // with. An offer is progress, and a booked round sorts latest, so neither is ever quiet. Longest first.
        private List<Quiet> goneQuiet() {
            LocalDate today = now.atZone(zone).toLocalDate();
            List<Quiet> quiet = new ArrayList<>();
            for (Job job : active()) {
                if (job.hasOffer()) continue;
                InterviewRound last = InterviewRound.latest(rounds(job)).orElse(null);
                if (last == null) continue;
                Instant over = last.getInterviewEndDateTime() != null ? last.getInterviewEndDateTime() : last.getInterviewDateTime();
                long days = ChronoUnit.DAYS.between(over.atZone(zone).toLocalDate(), today);
                if (over.isBefore(now) && days >= FOLLOW_UP_DAYS.get(0)) quiet.add(new Quiet(job, last, days));
            }
            quiet.sort(Comparator.comparingLong(Quiet::days).reversed());
            return quiet;
        }

        private String quietLines(List<Quiet> quiet) {
            return quiet.stream().map(this::quietLine).collect(Collectors.joining("\n"));
        }

        private String quietLine(Quiet quiet) {
            return "- " + quiet.job().getCompany() + ", " + quiet.job().getRole() + ": "
                    + typeLabel(quiet.round().getInterviewType()) + " on "
                    + quiet.round().getInterviewDateTime().atZone(zone).format(DAY) + ", " + quiet.days() + " days ago";
        }

        private String followUpLine(FollowUp followUp) {
            Contact contact = followUp.contact();
            return "- " + contact.name() + " (" + contact.role().name().replace('_', ' ').toLowerCase(Locale.US) + ") at "
                    + followUp.job().getCompany() + ", " + followUp.job().getRole() + ": by "
                    + contact.followUpOn().format(DAY);
        }

        private LocalDate deadlineOf(Job job) {
            Offer offer = input.offersByJob().get(job.getId());
            return offer == null ? null : offer.getDecisionDeadline();
        }

        private boolean unsent(String key) {
            return !input.alreadySent().contains(key);
        }

        private String time(Instant instant) {
            return instant.atZone(zone).format(TIME);
        }

        private String roundDetails(Job job, InterviewRound round) {
            StringBuilder body = new StringBuilder()
                    .append(typeLabel(round.getInterviewType())).append(" with ").append(job.getCompany())
                    .append(" for ").append(job.getRole()).append("\n")
                    .append(round.getInterviewDateTime().atZone(zone).format(DAY)).append(", ")
                    .append(time(round.getInterviewDateTime()));
            if (round.getInterviewEndDateTime() != null) body.append(" to ").append(time(round.getInterviewEndDateTime()));
            body.append("\n");
            if (round.getMeetingLink() != null && !round.getMeetingLink().isBlank()) {
                body.append("Join: ").append(round.getMeetingLink()).append("\n");
            }
            if (round.getLocation() != null && !round.getLocation().isBlank()) {
                body.append("Location: ").append(round.getLocation()).append("\n");
            }
            if (!round.getInterviewers().isEmpty()) {
                body.append("Interviewers: ").append(round.getInterviewers().stream()
                        .map(Interviewer::getName).collect(Collectors.joining(", "))).append("\n");
            }
            return body.toString();
        }

        private String footer() {
            return "\n\nOpen Job Tracker: " + appUrl + "\nChange or turn off these emails under Profile, Notifications.";
        }
    }

    private static void section(List<String> sections, String title, List<String> lines) {
        if (!lines.isEmpty()) sections.add(title + "\n" + String.join("\n", lines));
    }

    // The round is in the key, so a new interview starts the 7 and 14 days over.
    private static String followUpKey(Quiet quiet, int days) {
        return "followup:" + quiet.job().getId() + ":" + quiet.round().getRoundId() + ":" + days;
    }

    private static String contactKey(FollowUp followUp) {
        return "contact:" + followUp.job().getId() + ":" + followUp.contact().name() + ":" + followUp.contact().followUpOn();
    }

    private static String daysLeft(long days) {
        return days == 0 ? "which is today" : days == 1 ? "1 day from now" : days + " days from now";
    }

    // Matches the app's labels: "SYSTEM_DESIGN" reads "System design", and a panel round says so.
    static String typeLabel(InterviewType type) {
        if (type == null) return "Interview";
        String name = type.name();
        boolean panel = type.isPanel();
        String words = (panel ? name.substring("PANEL_".length()) : name).replace('_', ' ').toLowerCase(Locale.US);
        String label = Character.toUpperCase(words.charAt(0)) + words.substring(1);
        return panel ? "Panel: " + label : label;
    }
}
