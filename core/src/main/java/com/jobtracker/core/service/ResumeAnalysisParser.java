package com.jobtracker.core.service;

import com.jobtracker.core.dto.ResumeAnalysis;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

// Shared decoder for cached resume-analysis JSON; returns null on malformed or absent input.
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
