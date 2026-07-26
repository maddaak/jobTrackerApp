package com.jobtracker.core.exception;

public class UsernameTakenException extends RuntimeException {
    public UsernameTakenException() {
        super("username taken");
    }
}
