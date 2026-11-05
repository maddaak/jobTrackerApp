package com.jobtracker.core.model;

import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;

// Kept with the offer so looking at it again doesn't pay for another search. basis is what was priced, so
// editing the offer leaves the check in place but marked out of date rather than silently dropping it.
public record MarketCheck(
        String verdict,
        Integer typicalLow,
        Integer typicalHigh,
        String summary,
        List<String> negotiationPoints,
        boolean searched,
        List<Source> sources,
        Instant checkedAt,
        Basis basis) {

    // Limits match dto.Limits, since a check request carries these as they are.
    public record Source(@Size(max = 255) String title, @Size(max = 2048) String url) {
    }

    // Everything the check was given: the title and level priced, the yearly pay, and where the job is.
    // signOnBonus is the total across its years, which for an offer from before the split is the one amount.
    public record Basis(String offerTitle, Integer baseSalary, Integer annualBonus, Integer equityPerYear,
            Integer signOnBonus, Location location, String city) {

        public static Basis of(Job job, Offer offer) {
            return new Basis(offer.getTitle(), offer.getBaseSalary(), offer.annualBonus(), offer.equityPerYear(),
                    offer.signOnTotal(), job.getLocation(), job.getCity());
        }
    }

    // A check from before basis was recorded was cleared by every edit, so it still matches the offer.
    public boolean staleFor(Job job, Offer offer) {
        return basis != null && !basis.equals(Basis.of(job, offer));
    }
}
