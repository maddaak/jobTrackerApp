package com.jobtracker.core.model;

import java.time.LocalDate;

// Someone at or around the company for this job. Interviewers stay on their rounds; this is who you
// keep in touch with between them. followUpOn is the day you meant to get back to them, null when nothing's pending.
public record Contact(String name, ContactRole role, String email, String linkedInUrl, LocalDate lastContactedOn,
        String notes, LocalDate followUpOn) {

    public enum ContactRole { RECRUITER, HIRING_MANAGER, REFERRER, INTERVIEWER, OTHER }

    // Talking to them on or after the day settles it, so "Spoke today" never leaves a follow-up hanging.
    public Contact {
        if (followUpOn != null && lastContactedOn != null && !lastContactedOn.isBefore(followUpOn)) {
            followUpOn = null;
        }
    }

    public boolean followUpDue(LocalDate today) {
        return followUpOn != null && !followUpOn.isAfter(today);
    }
}
