package com.jobtracker.core.exception;

public class StageEntryNotFoundException extends RuntimeException {
    public StageEntryNotFoundException() {
        super("no stage history entry matches");
    }
}
