package com.jobtracker.core.dto;

import com.jobtracker.core.model.Outcome;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

// How one job hunt went, start to finish. A role reposted and linked as replacing the last counts once, from
// its first application to its last posting's end. Response days cover only the closures with a real date:
// responsesMeasured of closedApplications, since an import, a pre-V4.1 closure, or closing the season may carry
// none. openApplications, open or paused, are what closing it would withdraw.
public record SeasonSummary(Long seasonId, String name, Instant closedAt, Instant firstApplied, long applications,
        Double averageResponseDays, long responsesMeasured, long closedApplications, long openApplications,
        long roundsPassed, long roundsFailed, List<InterviewRoundCount> rounds, AcceptedOffer acceptedOffer,
        List<OfferMade> offers) {

    // How each offer was decided on the Offers page, which closing reports and an undecided one holds up.
    public record OfferMade(Long jobId, String company, String role, Outcome outcome, LocalDate acceptedOn,
            LocalDate startDate) {
    }

    // applied is the first posting's; daysToAccept runs from it to acceptedOn.
    public record AcceptedOffer(Long jobId, String company, String role, Instant applied, LocalDate acceptedOn,
            LocalDate startsOn, Long daysToAccept) {
    }
}
