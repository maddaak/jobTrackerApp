package com.jobtracker.core.exception;

// The mail server's own reason is kept, since a wrong password or a blocked sender is the person's to fix.
public class EmailSendFailedException extends RuntimeException {
    public EmailSendFailedException(String reason) {
        super("the mail server didn't accept the email: " + reason);
    }
}
