package com.jobtracker.core.dto;

// responses counts the applications that heard back: a recruiter reached out or it went further.
public record ResumeResponseRate(String resume, long applications, long responses) {
}
