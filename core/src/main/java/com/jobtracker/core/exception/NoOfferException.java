package com.jobtracker.core.exception;

public class NoOfferException extends RuntimeException {
    public NoOfferException() {
        super("this job has no offer; move it to the offer stage first");
    }
}
