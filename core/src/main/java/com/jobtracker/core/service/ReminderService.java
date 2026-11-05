package com.jobtracker.core.service;

import com.jobtracker.core.dto.ReminderSettingsRequest;
import com.jobtracker.core.dto.ReminderSettingsResponse;
import com.jobtracker.core.exception.EmailNotConfiguredException;
import com.jobtracker.core.exception.EmailSendFailedException;
import com.jobtracker.core.exception.InvalidReminderSettingsException;
import com.jobtracker.core.dto.FollowUpResponse;
import com.jobtracker.core.model.Contact;
import com.jobtracker.core.model.InterviewRound;
import com.jobtracker.core.model.Job;
import com.jobtracker.core.model.JobContacts;
import com.jobtracker.core.model.JobDetail;
import com.jobtracker.core.model.JobJourney;
import com.jobtracker.core.model.Offer;
import com.jobtracker.core.model.ReminderSettings;
import com.jobtracker.core.model.SentReminder;
import com.jobtracker.core.model.User;
import com.jobtracker.core.repository.JobDetailRepository;
import com.jobtracker.core.repository.JobRepository;
import com.jobtracker.core.repository.ReminderSettingsRepository;
import com.jobtracker.core.repository.SentReminderRepository;
import com.jobtracker.core.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.mail.MailException;
import org.springframework.stereotype.Service;
import java.time.Clock;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class ReminderService {

    private static final Logger log = LoggerFactory.getLogger(ReminderService.class);

    private final ReminderSettingsRepository settingsRepository;
    private final SentReminderRepository sentReminders;
    private final JobRepository jobs;
    private final JobDetailRepository jobDetails;
    private final UserRepository users;
    private final ReminderMailer mailer;
    private final Clock clock;
    private final String appUrl;
    private final SeasonService seasons;

    public ReminderService(ReminderSettingsRepository settingsRepository, SentReminderRepository sentReminders,
            JobRepository jobs, JobDetailRepository jobDetails, UserRepository users, ReminderMailer mailer, Clock clock,
            @Value("${app.url:http://localhost:5173}") String appUrl, SeasonService seasons) {
        this.settingsRepository = settingsRepository;
        this.sentReminders = sentReminders;
        this.jobs = jobs;
        this.jobDetails = jobDetails;
        this.users = users;
        this.mailer = mailer;
        this.clock = clock;
        this.appUrl = appUrl;
        this.seasons = seasons;
    }

    // The board's list, by the same rule as the email, so neither needs email set up to be useful.
    public List<FollowUpResponse> followUpsDue(Long ownerId) {
        List<Job> inView = jobs.findByOwnerIdOrderByCreatedAtDesc(ownerId).stream()
                .filter(seasons.inView(ownerId))
                .toList();
        LocalDate today = clock.instant().atZone(ReminderPlanner.zoneOf(settingsOf(ownerId).getTimeZone())).toLocalDate();
        return ReminderPlanner.followUpsDue(inView, contactsByJob(ownerId), today).stream()
                .map(followUp -> new FollowUpResponse(followUp.job().getId(), followUp.job().getCompany(),
                        followUp.job().getRole(), followUp.contact().name(), followUp.contact().role(),
                        followUp.contact().followUpOn()))
                .toList();
    }

    private Map<Long, List<Contact>> contactsByJob(Long ownerId) {
        return jobDetails.findContactsWithFollowUpsByOwnerId(ownerId).stream()
                .collect(Collectors.toMap(JobContacts::jobId, JobContacts::contacts, (a, b) -> a));
    }

    public ReminderSettingsResponse getSettings(Long ownerId) {
        return toResponse(settingsOf(ownerId));
    }

    public ReminderSettingsResponse saveSettings(Long ownerId, ReminderSettingsRequest request) {
        try {
            ZoneId.of(request.timeZone());
        } catch (DateTimeException e) {
            throw new InvalidReminderSettingsException("unknown time zone: " + request.timeZone());
        }
        ReminderSettings settings = settingsOf(ownerId);
        String email = request.email() == null || request.email().isBlank() ? null : request.email().trim();
        if (request.emailEnabled() && email == null) {
            throw new InvalidReminderSettingsException("add an email address to turn on email notifications");
        }
        settings.update(request.emailEnabled(), email, request.timeZone(), request.digest(), request.digestHour(),
                request.interviewSoon(), request.offerDeadline(), request.followUp());
        return toResponse(settingsRepository.save(settings));
    }

    public void sendTest(Long ownerId) {
        if (!mailer.configured()) {
            throw new EmailNotConfiguredException();
        }
        ReminderSettings settings = settingsOf(ownerId);
        if (settings.getEmail() == null) {
            throw new InvalidReminderSettingsException("save an email address first");
        }
        try {
            mailer.send(settings.getEmail(), "Job Tracker reminders are working",
                    "This is a test from Job Tracker. Reminders you've turned on will arrive at this address.\n\n"
                            + "Open Job Tracker: " + appUrl);
        } catch (MailException e) {
            throw new EmailSendFailedException(e.getMostSpecificCause().getMessage());
        }
    }

    // One person's failure (a bad address, a mail server hiccup) mustn't stop everyone else's reminders.
    public void sendDueReminders() {
        if (!mailer.configured()) {
            return;
        }
        for (ReminderSettings settings : settingsRepository.findByEmailEnabledTrueAndEmailIsNotNull()) {
            try {
                sendDueFor(settings);
            } catch (RuntimeException e) {
                log.warn("reminders for account {} not sent this pass: {}", settings.getOwnerId(), e.getMessage());
            }
        }
    }

    private void sendDueFor(ReminderSettings settings) {
        Long ownerId = settings.getOwnerId();
        // A made-up interview must never email someone that it starts soon.
        Set<Long> sampleJobIds = jobDetails.findByOwnerIdAndSampleTrue(ownerId).stream()
                .map(JobDetail::getJobId)
                .collect(Collectors.toSet());
        List<Job> ownerJobs = jobs.findByOwnerIdOrderByCreatedAtDesc(ownerId).stream()
                .filter(job -> !sampleJobIds.contains(job.getId()))
                .toList();
        Map<Long, List<InterviewRound>> roundsByJob = jobDetails.findJourneysByOwnerId(ownerId).stream()
                .collect(Collectors.toMap(JobJourney::jobId, JobJourney::interviews, (a, b) -> a));
        List<Long> offerJobIds = ownerJobs.stream().filter(Job::hasOffer).map(Job::getId).toList();
        Map<Long, Offer> offersByJob = offerJobIds.isEmpty() ? Map.of()
                : jobDetails.findByOwnerIdAndJobIdIn(ownerId, offerJobIds).stream()
                        .filter(detail -> detail.getOffer() != null)
                        .collect(Collectors.toMap(JobDetail::getJobId, JobDetail::getOffer, (a, b) -> a));
        Set<String> alreadySent = sentReminders.findByOwnerId(ownerId).stream()
                .map(SentReminder::getKey)
                .collect(Collectors.toSet());

        var input = new ReminderPlanner.Input(settings, ownerJobs, roundsByJob, offersByJob, contactsByJob(ownerId),
                alreadySent);
        for (ReminderPlanner.Due due : ReminderPlanner.plan(input, clock.instant(), appUrl)) {
            mailer.send(settings.getEmail(), due.subject(), due.body());
            // Recorded only once sent, so a failed send is tried again on the next pass.
            for (String key : due.keys()) {
                try {
                    sentReminders.save(new SentReminder(ownerId, key, clock.instant()));
                } catch (DuplicateKeyException alreadyRecorded) {
                    // Another pass got there first; the reminder is recorded either way.
                }
            }
        }
    }

    private ReminderSettings settingsOf(Long ownerId) {
        return settingsRepository.findByOwnerId(ownerId).orElseGet(() ->
                new ReminderSettings(ownerId, users.findById(ownerId).map(User::getEmail).orElse(null)));
    }

    private ReminderSettingsResponse toResponse(ReminderSettings settings) {
        return new ReminderSettingsResponse(mailer.configured(), settings.isEmailEnabled(), settings.getEmail(),
                settings.getTimeZone(),
                settings.isDigest(), settings.getDigestHour(), settings.isInterviewSoon(),
                settings.isOfferDeadline(), settings.isFollowUp());
    }
}
