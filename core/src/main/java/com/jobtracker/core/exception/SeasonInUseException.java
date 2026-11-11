package com.jobtracker.core.exception;

public class SeasonInUseException extends RuntimeException {
    public SeasonInUseException(String message) {
        super(message);
    }
}
