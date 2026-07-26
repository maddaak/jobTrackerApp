package com.jobtracker.core.exception;

public class InvalidCredentialsException extends RuntimeException {
    public InvalidCredentialsException() {
        super("invalid username or password");
    }
}
