package com.jobtracker.core.dto;

import com.jobtracker.core.model.JobRelation;

// Carries company and role so a caller labels a link without resolving ids itself.
public record JobLinkResponse(Long jobId, String company, String role, JobRelation relation) {
}
