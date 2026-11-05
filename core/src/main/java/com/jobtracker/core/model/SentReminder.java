package com.jobtracker.core.model;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import java.time.Instant;

// Remembered per reminder, so a restart or the next five-minute pass never sends the same one twice.
@Document(collection = "sent_reminders")
public class SentReminder {

    @Id
    private String id;

    private Long ownerId;
    private String key;
    private Instant sentAt;

    protected SentReminder() {
    }

    public SentReminder(Long ownerId, String key, Instant sentAt) {
        this.ownerId = ownerId;
        this.key = key;
        this.sentAt = sentAt;
    }

    public String getKey() {
        return key;
    }
}
