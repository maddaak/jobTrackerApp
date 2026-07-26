package com.jobtracker.core.exception;

public class InvalidUsernameException extends RuntimeException {
    public InvalidUsernameException(String reason) {
        super(reason);
    }
}
