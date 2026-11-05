package com.jobtracker.core.model;

import java.util.List;

// A job's contacts without the rest of its document, for the follow-up checks that run every few minutes.
public record JobContacts(Long jobId, List<Contact> contacts) {

    // A document written before contacts existed omits the field.
    public JobContacts {
        contacts = contacts == null ? List.of() : contacts;
    }
}
