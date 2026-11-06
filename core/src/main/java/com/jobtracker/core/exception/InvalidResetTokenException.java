package com.jobtracker.core.exception;

public class InvalidResetTokenException extends RuntimeException {
    public InvalidResetTokenException() {
        super("this reset link is invalid or has expired: ask for a new one");
    }
}
