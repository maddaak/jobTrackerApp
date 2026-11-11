package com.jobtracker.core.exception;

public class SeasonClosedException extends RuntimeException {
    public SeasonClosedException() {
        super("this season is closed; press Edit on it to make changes");
    }
}
