package com.jobtracker.core.dto;

import java.time.LocalDate;

// Either day can be left blank and filled in later, when closing the season.
public record AcceptOfferRequest(LocalDate acceptedOn, LocalDate startDate) {
}
