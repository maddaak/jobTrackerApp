package com.jobtracker.core.exception;

public class RestoreRefusedException extends RuntimeException {
    public RestoreRefusedException() {
        super("restore only into an account with no jobs or resumes yet, so nothing is duplicated or overwritten");
    }
}
