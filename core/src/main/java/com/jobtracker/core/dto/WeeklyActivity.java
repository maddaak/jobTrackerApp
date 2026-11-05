package com.jobtracker.core.dto;

import java.time.LocalDate;

// One week of effort, Monday to Sunday in UTC: applications sent and interview rounds held.
public record WeeklyActivity(LocalDate weekStart, int applications, int interviews) {
}
