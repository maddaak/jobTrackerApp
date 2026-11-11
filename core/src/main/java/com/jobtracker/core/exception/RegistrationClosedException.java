package com.jobtracker.core.exception;

public class RegistrationClosedException extends RuntimeException {
    public RegistrationClosedException() {
        super("registration is closed: this app already has an account. Set REGISTRATION_OPEN=true in .env to allow another");
    }
}
