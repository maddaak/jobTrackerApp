package com.jobtracker.core.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.Map;

// The answer as the bff assembled it; createdAt is core's to set.
public record AiResultRequest(@NotEmpty @Size(max = Limits.LIST) Map<@Size(max = Limits.SHORT_TEXT) String, Object> content) {
}
