package com.jobtracker.core.dto;

import com.jobtracker.core.model.AiResult;
import com.jobtracker.core.model.Location;
import com.jobtracker.core.model.MarketCheck;
import com.jobtracker.core.model.Outcome;
import java.time.LocalDate;
import java.util.List;

// What was entered, then what core works out from it: annualBonus in dollars, equityByYear (and
// equitySharesByYear for a grant in shares) per vesting year, equityPerYear as the grant spread evenly,
// compByYear, what each year pays with that year's vesting and sign-on, and averagePerYear, the figure
// offers are compared on.
public record OfferResponse(
        Long jobId,
        String company,
        String role,
        Location location,
        String city,
        Outcome outcome,
        // Null when the offer matches the posting's role.
        String offerTitle,
        Integer baseSalary,
        Integer bonusAmount,
        Double bonusPercent,
        // The grant in dollars; for a grant in shares, shares times sharePrice.
        Integer equityGrant,
        Integer equityShares,
        Double sharePrice,
        // The yearly share-price rise the letter assumes; null when none.
        Double priceGrowthPercent,
        Integer vestingYears,
        List<Double> vestingSchedule,
        // The letter's own share count each year, when entered; null when the schedule's split is used.
        List<Integer> vestedShares,
        // As entered: the sign-on, paid once in year 1, and the offset beside each vesting year.
        Integer signOnBonus,
        List<Integer> signOnByYear,
        // Both together, by the year each is paid; what the card and the AI read.
        List<Integer> signOnPaidByYear,
        Integer annualBonus,
        List<Integer> equityByYear,
        List<Integer> equitySharesByYear,
        // Each vest at the assumed growth, and the pay by year with it; empty when no growth is assumed.
        List<Integer> equityProjectedByYear,
        Integer equityPerYear,
        // All pay at the letter's assumed growth over averagedOverYears, the longest span among the offers in
        // view, so every offer is averaged over the same years.
        Integer averagePerYear,
        int averagedOverYears,
        List<Integer> compByYear,
        List<Integer> projectedCompByYear,
        LocalDate startDate,
        LocalDate decisionDeadline,
        String notes,
        MarketCheck marketCheck,
        // The offer's title, pay, or location changed after the check, so it describes something else.
        boolean marketCheckStale,
        // The last counter-offer email drafted for it, kept with the job like the other AI results.
        AiResult negotiationDraft) {
}
