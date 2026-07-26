package com.jobtracker.core.exception;

public class JobNotFoundException extends RuntimeException {
    public JobNotFoundException() {
        super("job not found");
    }
}

