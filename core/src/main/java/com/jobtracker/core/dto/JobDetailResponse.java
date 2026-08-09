package com.jobtracker.core.dto;

import com.jobtracker.core.model.Location;
import com.jobtracker.core.model.Outcome;
import com.jobtracker.core.model.SourceCategory;
import com.jobtracker.core.model.Stage;
import java.time.Instant;
import java.util.List;

public record JobDetailResponse(
        Long id,
        String company,
        String role,
        SourceCategory sourceCategory,
        Stage currentStage,
        Outcome outcome,
        String url,
        Location location,
        Integer compMin,
        Integer compMax,
        Instant createdAt,
        List<StageEventResponse> stageEvents) {
}
