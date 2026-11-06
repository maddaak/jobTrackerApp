package com.jobtracker.core.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;

// Every field optional: an offer is often recorded before its details are all known. vestingSchedule is a
// percent per year, or null for even vesting. Equity is either equityGrant in dollars, or equityShares at
// sharePrice. signOnBonus is paid once, in year 1; signOnByYear is the offset paid beside each vesting year.
public record OfferRequest(
        @Size(max = 200) String offerTitle,
        @PositiveOrZero Integer baseSalary,
        @PositiveOrZero Integer bonusAmount,
        @PositiveOrZero @DecimalMax("1000") Double bonusPercent,
        @PositiveOrZero Integer equityGrant,
        @Positive Integer equityShares,
        @Positive Double sharePrice,
        // The yearly share-price rise a letter assumes, such as 15%; blank or 0 assumes none.
        @PositiveOrZero @DecimalMax("100") Double priceGrowthPercent,
        Integer vestingYears,
        @Size(max = Limits.LIST) List<Double> vestingSchedule,
        // Optional, for a grant in shares: the letter's own count each year, overriding the schedule's split.
        @Size(max = Limits.LIST) List<@PositiveOrZero Integer> vestedShares,
        @PositiveOrZero Integer signOnBonus,
        @Size(max = Limits.LIST) List<@PositiveOrZero Integer> signOnByYear,
        LocalDate startDate,
        LocalDate decisionDeadline,
        @Size(max = Limits.LONG_TEXT) String notes) {
}
