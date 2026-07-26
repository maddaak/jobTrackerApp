package com.jobtracker.core.dto;

import com.jobtracker.core.model.Stage;
import java.time.Instant;

public record StageEventResponse(Stage stage, Instant enteredAt, String note) {
}
