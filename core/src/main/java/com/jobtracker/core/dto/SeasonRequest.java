package com.jobtracker.core.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SeasonRequest(@NotBlank @Size(max = 100) String name) {
}
