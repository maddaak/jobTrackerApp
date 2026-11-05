package com.jobtracker.core.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ApplyResumeAnalysisRequest(
        @Size(max = Limits.LONG_TEXT) String analysisJson,
        // AnalysisStatus.OK.equals is case-sensitive, so "OK" stored fine and then hid the resume.
        @NotNull @AnalysisStatusValue @Size(max = Limits.SHORT_TEXT) String status,
        @Size(max = Limits.SHORT_TEXT) String source) {
}
