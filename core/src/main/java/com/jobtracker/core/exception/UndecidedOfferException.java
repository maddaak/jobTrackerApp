package com.jobtracker.core.exception;

public class UndecidedOfferException extends RuntimeException {
    public UndecidedOfferException() {
        super("an offer in this season is still undecided; accept or decline it on the Offers page first");
    }
}
