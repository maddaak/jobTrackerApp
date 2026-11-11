package com.jobtracker.core.service;

import com.jobtracker.core.dto.ReminderSettingsRequest;
import com.jobtracker.core.exception.EmailNotConfiguredException;
import com.jobtracker.core.exception.EmailSendFailedException;
import com.jobtracker.core.exception.InvalidReminderSettingsException;
import com.jobtracker.core.model.InterviewRound;
import com.jobtracker.core.model.InterviewType;
import com.jobtracker.core.model.Job;
import com.jobtracker.core.model.JobDetail;
import com.jobtracker.core.model.JobJourney;
import com.jobtracker.core.model.Outcome;
import com.jobtracker.core.model.ReminderSettings;
import com.jobtracker.core.model.SentReminder;
import com.jobtracker.core.model.SourceCategory;
import com.jobtracker.core.model.Stage;
import com.jobtracker.core.model.User;
import com.jobtracker.core.repository.JobDetailRepository;
import com.jobtracker.core.repository.JobRepository;
import com.jobtracker.core.repository.ReminderSettingsRepository;
import com.jobtracker.core.repository.SentReminderRepository;
import com.jobtracker.core.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class ReminderServiceTests {

    private static final Instant NOW = Instant.parse("2026-08-10T14:00:00Z");

    private final ReminderSettingsRepository settingsRepository = mock(ReminderSettingsRepository.class);
    private final SentReminderRepository sentReminders = mock(SentReminderRepository.class);
    private final JobRepository jobs = mock(JobRepository.class);
    private final JobDetailRepository jobDetails = mock(JobDetailRepository.class);
    private final JavaMailSender sender = mock(JavaMailSender.class);
    private final UserRepository users = mock(UserRepository.class);

    private ReminderService service(boolean emailConfigured) {
        ReminderMailer mailer = emailConfigured
                ? new ReminderMailer(sender, "tracker@example.com")
                : new ReminderMailer("", 587, "", "", "");
        return new ReminderService(settingsRepository, sentReminders, jobs, jobDetails, users, mailer,
                Clock.fixed(NOW, ZoneOffset.UTC), "https://localhost:5173", mock(SeasonService.class));
    }

    private static ReminderSettings settings(Long ownerId, String email) {
        ReminderSettings settings = new ReminderSettings(ownerId);
        settings.update(true, email, "America/New_York", false, 8, true, false, false);
        return settings;
    }

    // An interview starting in half an hour for the given account.
    private void interviewSoonFor(Long ownerId) {
        Job job = new Job("Initech", "Engineer", new User("owner", "hash"), SourceCategory.SELF_APPLIED,
                null, null, null, null);
        job.applyUpdate("Initech", "Engineer", SourceCategory.SELF_APPLIED, null, null, null, null,
                Stage.INTERVIEW_STAGE, null, Outcome.ACTIVE);
        ReflectionTestUtils.setField(job, "id", ownerId * 100);
        InterviewRound round = new InterviewRound(NOW.plus(Duration.ofMinutes(30)), null, InterviewType.BEHAVIOR,
                null, null, List.of());
        when(jobs.findByOwnerIdOrderByCreatedAtDesc(ownerId)).thenReturn(List.of(job));
        when(jobDetails.findJourneysByOwnerId(ownerId))
                .thenReturn(List.of(new JobJourney(job.getId(), List.of(), List.of(round), List.of())));
        when(sentReminders.findByOwnerId(ownerId)).thenReturn(List.of());
    }

    @BeforeEach
    void noSettingsYet() {
        when(settingsRepository.findByOwnerId(any())).thenReturn(Optional.empty());
        when(settingsRepository.save(any())).thenAnswer(call -> call.getArgument(0));
    }

    @Test
    void sendsWhatIsDueAndRecordsItSoTheNextPassStaysQuiet() {
        when(settingsRepository.findByEmailEnabledTrueAndEmailIsNotNull()).thenReturn(List.of(settings(1L, "me@example.com")));
        interviewSoonFor(1L);

        service(true).sendDueReminders();

        ArgumentCaptor<SimpleMailMessage> sent = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(sender).send(sent.capture());
        assertThat(sent.getValue().getTo()).containsExactly("me@example.com");
        assertThat(sent.getValue().getFrom()).isEqualTo("tracker@example.com");
        assertThat(sent.getValue().getSubject()).startsWith("Behavior with Initech");
        verify(sentReminders).save(any(SentReminder.class));
    }

    // Unrecorded, so the next pass tries again; and one account's failure doesn't cost another its reminders.
    @Test
    void aFailedSendIsRetriedLaterAndDoesNotStopTheNextAccount() {
        when(settingsRepository.findByEmailEnabledTrueAndEmailIsNotNull())
                .thenReturn(List.of(settings(1L, "bad@example.com"), settings(2L, "good@example.com")));
        interviewSoonFor(1L);
        interviewSoonFor(2L);
        doThrow(new MailSendException("mailbox unavailable")).doNothing().when(sender).send(any(SimpleMailMessage.class));

        service(true).sendDueReminders();

        verify(sender, times(2)).send(any(SimpleMailMessage.class));
        ArgumentCaptor<SentReminder> recorded = ArgumentCaptor.forClass(SentReminder.class);
        verify(sentReminders, times(1)).save(recorded.capture());
        assertThat(recorded.getValue().getKey()).startsWith("interview:");
    }

    @Test
    void aSampleJobsInterviewSendsNothing() {
        when(settingsRepository.findByEmailEnabledTrueAndEmailIsNotNull()).thenReturn(List.of(settings(1L, "me@example.com")));
        interviewSoonFor(1L);
        JobDetail sample = new JobDetail(100L, 1L);
        sample.markSample();
        when(jobDetails.findByOwnerIdAndSampleTrue(1L)).thenReturn(List.of(sample));

        service(true).sendDueReminders();

        verifyNoInteractions(sender);
    }

    @Test
    void doesNothingAtAllWithoutEmailSettings() {
        service(false).sendDueReminders();

        verifyNoInteractions(jobs, jobDetails, sender);
    }

    @Test
    void theTestEmailSaysWhatIsMissingOrWhatTheServerSaid() {
        assertThatThrownBy(() -> service(false).sendTest(1L)).isInstanceOf(EmailNotConfiguredException.class);
        assertThatThrownBy(() -> service(true).sendTest(1L))
                .isInstanceOf(InvalidReminderSettingsException.class).hasMessageContaining("email address");

        when(settingsRepository.findByOwnerId(1L)).thenReturn(Optional.of(settings(1L, "me@example.com")));
        doThrow(new MailSendException("535 authentication failed")).when(sender).send(any(SimpleMailMessage.class));
        assertThatThrownBy(() -> service(true).sendTest(1L))
                .isInstanceOf(EmailSendFailedException.class).hasMessageContaining("535 authentication failed");
    }

    @Test
    void savingRefusesAnUnknownTimeZoneAndEmailTurnedOnWithNoAddress() {
        assertThatThrownBy(() -> service(true).saveSettings(1L,
                new ReminderSettingsRequest(true, "me@example.com", "Mars/Olympus", true, 8, true, true, true)))
                .isInstanceOf(InvalidReminderSettingsException.class);
        assertThatThrownBy(() -> service(true).saveSettings(1L,
                new ReminderSettingsRequest(true, "  ", "America/New_York", true, 8, true, true, true)))
                .isInstanceOf(InvalidReminderSettingsException.class).hasMessageContaining("email address");
    }

    @Test
    void aFirstVisitOffersTheAccountsAddressWithEmailStillOff() {
        when(users.findById(1L)).thenReturn(Optional.of(new User("owner", "hash", "Owner", "owner@example.com")));

        var settings = service(true).getSettings(1L);

        assertThat(settings.email()).isEqualTo("owner@example.com");
        assertThat(settings.emailEnabled()).isFalse();
    }

    // Off keeps the address, so turning it back on doesn't mean typing it again.
    @Test
    void turningEmailOffKeepsTheAddress() {
        var saved = service(true).saveSettings(1L,
                new ReminderSettingsRequest(false, "me@example.com", "America/New_York", true, 8, true, true, true));

        assertThat(saved.emailEnabled()).isFalse();
        assertThat(saved.email()).isEqualTo("me@example.com");
    }
}
