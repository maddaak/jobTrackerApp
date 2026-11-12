package com.jobtracker.core.dto;

// A hunt can end without an offer, so the offer taken is optional. Its days are set on the offer itself.
public record CloseSeasonRequest(Long acceptedJobId) {
}
