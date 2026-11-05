package com.jobtracker.core.exception;

import java.time.Duration;

public class TooManyLoginAttemptsException extends RuntimeException {

    private final long retryAfterSeconds;

    public TooManyLoginAttemptsException(Duration retryAfter) {
        this(roundedUp(retryAfter));
    }

    private TooManyLoginAttemptsException(long seconds) {
        super("too many failed sign-ins for this account. Try again in " + inWords(seconds));
        this.retryAfterSeconds = seconds;
    }

    public long retryAfterSeconds() {
        return retryAfterSeconds;
    }

    // Up, so a wait with a few milliseconds gone is still "30 seconds", and never "0".
    private static long roundedUp(Duration wait) {
        return Math.max(1, (wait.toMillis() + 999) / 1000);
    }

    private static String inWords(long seconds) {
        if (seconds < 60) return seconds + (seconds == 1 ? " second" : " seconds");
        long minutes = (seconds + 59) / 60;
        return minutes + (minutes == 1 ? " minute" : " minutes");
    }
}
