package com.jobtracker.core.exception;

public class InvalidBackupException extends RuntimeException {
    public InvalidBackupException(String message) {
        super(message);
    }
}
