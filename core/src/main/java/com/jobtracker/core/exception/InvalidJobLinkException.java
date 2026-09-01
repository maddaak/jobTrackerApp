package com.jobtracker.core.exception;

public class InvalidJobLinkException extends RuntimeException {
    public InvalidJobLinkException(String message) {
        super(message);
    }
}
