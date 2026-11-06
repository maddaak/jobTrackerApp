package com.jobtracker.core.model;

import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

// An address the account has signed in from, whose failed sign-ins are counted apart from everyone else's.
@Entity
@Table(name = "known_sign_in_addresses")
public class KnownSignInAddress {

    @EmbeddedId
    private SignInSource source;

    protected KnownSignInAddress() {
    }

    public KnownSignInAddress(SignInSource source) {
        this.source = source;
    }
}
