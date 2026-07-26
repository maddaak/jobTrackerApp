package com.jobtracker.core.dto;

import com.jobtracker.core.model.Stage;

public record FunnelStageCount(Stage stage, long count) {
}
