package com.jobtracker.core.exception;

public class TooManyResumesException extends RuntimeException {
    public TooManyResumesException(int limit) {
        super("an account can keep at most " + limit + " resumes; delete one first");
    }
}
