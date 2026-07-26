package com.jobtracker.core.exception;

public class ResumeNotFoundException extends RuntimeException {
    public ResumeNotFoundException() {
        super("resume not found");
    }
}
