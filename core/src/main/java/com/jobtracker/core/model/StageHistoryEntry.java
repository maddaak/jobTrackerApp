package com.jobtracker.core.model;

import java.time.Instant;

// Embedded in JobDetail, not a collection of its own: an append-only pipeline transition owned by one job.
public class StageHistoryEntry {

    private Stage stage;
    private Instant enteredAt;
    private String note;

    protected StageHistoryEntry() {
    }

    public StageHistoryEntry(Stage stage, Instant enteredAt, String note) {
        this.stage = stage;
        this.enteredAt = enteredAt;
        this.note = note;
    }

    public Stage getStage() {
        return stage;
    }

    public Instant getEnteredAt() {
        return enteredAt;
    }

    public String getNote() {
        return note;
    }
}
