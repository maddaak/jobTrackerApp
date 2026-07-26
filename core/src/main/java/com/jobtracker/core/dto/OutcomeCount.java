package com.jobtracker.core.dto;

import com.jobtracker.core.model.Outcome;

public record OutcomeCount(Outcome outcome, long count) {
}
