package com.jobtracker.core.dto;

import com.jobtracker.core.model.InterviewType;

public record InterviewRoundCount(InterviewType interviewType, long count) {
}
