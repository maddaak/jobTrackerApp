package com.jobtracker.core.exception;

public class SeasonNotFoundException extends RuntimeException {
    public SeasonNotFoundException() {
        super("season not found");
    }
}
