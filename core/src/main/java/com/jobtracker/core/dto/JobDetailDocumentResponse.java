package com.jobtracker.core.dto;

import com.jobtracker.core.model.AiResult;
import com.jobtracker.core.model.Contact;
import java.util.List;
import java.util.Map;

public record JobDetailDocumentResponse(
        Long jobId,
        String jdText,
        String interviewNotes,
        String recommendedResume,
        String notes,
        String rejectedReason,
        List<JobLinkResponse> links,
        // By AiKind key; only the kinds that have been run.
        Map<String, AiResult> aiResults,
        List<Contact> contacts,
        String sentResume) {
}
