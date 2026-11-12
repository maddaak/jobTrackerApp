package com.jobtracker.core.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

// How one job hunt went, start to finish. A role reposted and linked as replacing the last counts once, from
// its first application to its last posting's end. Response days cover only the closures with a real date:
// responsesMeasured of closedApplications, since an import or a pre-V4.1 closure may carry none.
// offers are the ones closing it can name as taken.
public record SeasonSummary(Long seasonId, String name, Instant closedAt, Instant firstApplied, long applications,
        Double averageResponseDays, long responsesMeasured, long closedApplications,
        long roundsPassed, long roundsFailed, List<InterviewRoundCount> rounds, AcceptedOffer acceptedOffer,
        List<OfferMade> offers) {

    // The days set on the offer, which closing starts from.
    public record OfferMade(Long jobId, String company, String role, boolean accepted, LocalDate acceptedOn,
            LocalDate startDate) {
    }

    // applied is the first posting's; daysToAccept runs from it to acceptedOn.
    public record AcceptedOffer(Long jobId, String company, String role, Instant applied, LocalDate acceptedOn,
            LocalDate startsOn, Long daysToAccept) {
    }
}
