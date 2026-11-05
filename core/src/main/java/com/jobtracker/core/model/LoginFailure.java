package com.jobtracker.core.model;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.PostLoad;
import jakarta.persistence.PostPersist;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;
import org.springframework.data.domain.Persistable;
import java.time.Instant;

// A run of sign-ins from one source that haven't yet succeeded, which LoginThrottle turns into a wait.
@Entity
@Table(name = "login_failures")
public class LoginFailure implements Persistable<SignInSource> {

    @EmbeddedId
    private SignInSource source;

    // The key is assigned, so save() would otherwise merge a new row over one another sign-in just added.
    @Transient
    private boolean stored;

    @Column(nullable = false)
    private int failures;

    @Column(nullable = false)
    private Instant lastFailedAt;

    protected LoginFailure() {
    }

    public LoginFailure(SignInSource source) {
        this.source = source;
    }

    public void attempted(Instant at) {
        failures++;
        lastFailedAt = at;
    }

    @PostLoad
    @PostPersist
    void markStored() {
        stored = true;
    }

    @Override
    public SignInSource getId() {
        return source;
    }

    @Override
    public boolean isNew() {
        return !stored;
    }

    public SignInSource getSource() {
        return source;
    }

    public int getFailures() {
        return failures;
    }

    public Instant getLastFailedAt() {
        return lastFailedAt;
    }
}
