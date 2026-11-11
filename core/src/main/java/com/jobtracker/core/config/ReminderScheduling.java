package com.jobtracker.core.config;

import com.jobtracker.core.service.ReminderService;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

// Off in tests, which drive ReminderService directly instead of waiting on a background pass.
@Configuration
@EnableScheduling
@ConditionalOnProperty(name = "app.reminders.enabled", matchIfMissing = true)
public class ReminderScheduling {

    private final ReminderService reminders;

    public ReminderScheduling(ReminderService reminders) {
        this.reminders = reminders;
    }

    // Five minutes keeps the hour-before interview reminder within a few minutes of the hour.
    @Scheduled(fixedDelayString = "${app.reminders.interval:PT5M}", initialDelayString = "PT1M")
    public void sendDueReminders() {
        reminders.sendDueReminders();
    }
}
