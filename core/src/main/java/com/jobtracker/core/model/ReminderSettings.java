package com.jobtracker.core.model;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

// One per account. Email is opt-in: nothing is sent until the person turns it on, so the per-kind
// defaults below only decide what they get once they do.
@Document(collection = "reminder_settings")
public class ReminderSettings {

    @Id
    private String id;

    private Long ownerId;
    private boolean emailEnabled;
    private String email;
    // The browser's IANA zone: "8am" and "tomorrow" mean the person's, not the server's (UTC in Docker).
    private String timeZone;
    private boolean digest = true;
    private int digestHour = 8;
    private boolean interviewSoon = true;
    private boolean offerDeadline = true;
    // Off by default: chasing a company is a choice, not something to opt out of.
    private boolean followUp = false;

    public void restoreAs(Long newOwnerId) {
        this.id = null;
        this.ownerId = newOwnerId;
    }

    protected ReminderSettings() {
    }

    public ReminderSettings(Long ownerId) {
        this.ownerId = ownerId;
    }

    // Prefilled from the account so turning email on is one tick; still off until they do.
    public ReminderSettings(Long ownerId, String email) {
        this(ownerId);
        this.email = email;
    }

    public void update(boolean emailEnabled, String email, String timeZone, boolean digest, int digestHour,
            boolean interviewSoon, boolean offerDeadline, boolean followUp) {
        this.emailEnabled = emailEnabled;
        this.email = email;
        this.timeZone = timeZone;
        this.digest = digest;
        this.digestHour = digestHour;
        this.interviewSoon = interviewSoon;
        this.offerDeadline = offerDeadline;
        this.followUp = followUp;
    }

    public Long getOwnerId() {
        return ownerId;
    }

    public boolean isEmailEnabled() {
        return emailEnabled;
    }

    public String getEmail() {
        return email;
    }

    public String getTimeZone() {
        return timeZone;
    }

    public boolean isDigest() {
        return digest;
    }

    public int getDigestHour() {
        return digestHour;
    }

    public boolean isInterviewSoon() {
        return interviewSoon;
    }

    public boolean isOfferDeadline() {
        return offerDeadline;
    }

    public boolean isFollowUp() {
        return followUp;
    }
}
