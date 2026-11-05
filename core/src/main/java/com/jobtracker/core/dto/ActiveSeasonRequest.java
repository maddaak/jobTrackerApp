package com.jobtracker.core.dto;

// A null season means every season at once.
public record ActiveSeasonRequest(Long seasonId) {
}
