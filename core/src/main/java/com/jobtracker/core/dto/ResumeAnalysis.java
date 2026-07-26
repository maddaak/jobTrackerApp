package com.jobtracker.core.dto;

import java.util.List;

public record ResumeAnalysis(String summary, List<String> skills, String seniority, List<String> roles) {
}
