package com.jobtracker.core.service;

import com.jobtracker.core.dto.ResumeAnalysis;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

// Absent input means not analyzed yet; unreadable input is a corrupt blob, not an empty analysis.
@Component
public class ResumeAnalysisParser {

    private final ObjectMapper objectMapper;

    public ResumeAnalysisParser(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public ResumeAnalysis parse(String analysisJson) {
        if (analysisJson == null) {
            return null;
        }
        try {
            return objectMapper.readValue(analysisJson, ResumeAnalysis.class);
        } catch (JacksonException e) {
            // Matches Gzip.decompress: a corrupt blob we stored is a 500, not a quietly empty read.
            throw new IllegalStateException("stored resume analysis is not readable JSON", e);
        }
    }
}
