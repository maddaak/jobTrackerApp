package com.jobtracker.core.exception;

public class EmailNotConfiguredException extends RuntimeException {
    public EmailNotConfiguredException() {
        super("email isn't set up on this server: add the SMTP settings to .env and restart");
    }
}
