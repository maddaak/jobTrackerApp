package com.jobtracker.core.model;

import jakarta.persistence.Embeddable;

// Who is signing in and from where. An empty address is every address the account hasn't signed in from.
@Embeddable
public record SignInSource(String username, String address) {
}
