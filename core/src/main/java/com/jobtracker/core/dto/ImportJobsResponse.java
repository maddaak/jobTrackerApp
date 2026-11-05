package com.jobtracker.core.dto;

// skipped counts rows already tracked under the same company and role, so importing twice adds nothing.
public record ImportJobsResponse(int imported, int skipped) {
}
