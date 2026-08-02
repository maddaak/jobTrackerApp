package com.jobtracker.core.service;

import com.jobtracker.core.dto.ResumeAnalysis;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

// Parses the cached resume-analysis JSON into a ResumeAnalysis, tolerating malformed or absent
// JSON by returning null. Shared so ResumeService and ResumeRecommenderService decode a stored
// analysis the same way.
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
        } catch (RuntimeException e) {
            return null;
        }
    }
}
