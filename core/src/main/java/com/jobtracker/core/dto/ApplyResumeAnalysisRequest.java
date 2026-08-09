package com.jobtracker.core.dto;

import jakarta.validation.constraints.NotNull;

public record ApplyResumeAnalysisRequest(
        String analysisJson,
        // AnalysisStatus.OK.equals is case-sensitive, so "OK" stored fine and then hid the resume.
        @NotNull @AnalysisStatusValue String status,
        String source) {
}
