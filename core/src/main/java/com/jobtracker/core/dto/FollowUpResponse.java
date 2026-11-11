package com.jobtracker.core.dto;

import com.jobtracker.core.model.Contact;
import java.time.LocalDate;

public record FollowUpResponse(Long jobId, String company, String role, String contactName,
        Contact.ContactRole contactRole, LocalDate followUpOn) {
}
