package com.jobtracker.core.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.jobtracker.core.model.Location;
import com.jobtracker.core.model.Outcome;
import com.jobtracker.core.model.SourceCategory;
import com.jobtracker.core.model.Stage;
import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.util.List;

// Rows from someone's spreadsheet, already matched to fields by the page that read the file.
public record ImportJobsRequest(@NotNull @Size(min = 1, max = 2000) List<@Valid @NotNull Row> jobs) {

    public record Row(
            @NotBlank @Size(max = 255) String company,
            @NotBlank @Size(max = 255) String role,
            // Null means applied on their own, the most common case.
            SourceCategory sourceCategory,
            @Size(max = Limits.URL) String url,
            Location location,
            @Size(max = 100) String city,
            Integer compMin,
            Integer compMax,
            @Size(max = Limits.LONG_TEXT) String notes,
            // Null means applied and waiting; Finalized comes from a closed outcome instead.
            Stage stage,
            Outcome outcome,
            // When they applied, so the funnel and weekly counts date it right. Null means today.
            LocalDate appliedOn,
            @Size(max = Limits.LONG_TEXT) String rejectedReason) {

        @JsonIgnore
        @AssertTrue(message = "an imported job's stage comes from its status, not Finalized")
        public boolean isStageAllowed() {
            return stage != Stage.FINALIZED;
        }

        @JsonIgnore
        @AssertTrue(message = "the salary range's minimum is above its maximum")
        public boolean isSalaryRangeInOrder() {
            return compMin == null || compMax == null || compMin <= compMax;
        }
    }
}
