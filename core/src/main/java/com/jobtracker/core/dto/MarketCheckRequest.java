package com.jobtracker.core.dto;

import com.jobtracker.core.model.MarketCheck;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import java.util.List;

// The scraper's answer as the bff passes it on; checkedAt is core's to set, not the caller's.
public record MarketCheckRequest(
        @NotNull @Pattern(regexp = "below|at|above|unclear") String verdict,
        @PositiveOrZero Integer typicalLow,
        @PositiveOrZero Integer typicalHigh,
        @NotBlank @Size(max = Limits.LONG_TEXT) String summary,
        @NotNull @Size(max = Limits.LIST) List<@Size(max = Limits.LONG_TEXT) String> negotiationPoints,
        boolean searched,
        @NotNull @Size(max = Limits.LIST) List<MarketCheck.@Valid Source> sources) {
}
