package com.jobtracker.core.exception;

public class InvalidPasswordException extends RuntimeException {
    public InvalidPasswordException(String reason) {
        super(reason);
    }
}
