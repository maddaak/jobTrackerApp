package com.jobtracker.core.model;

import jakarta.persistence.*;
import java.time.Instant;

// Only the token's hash is stored, so a copy of the database can't be used to reset anyone's password.
@Entity
@Table(name = "password_reset_tokens")
public class PasswordResetToken {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long userId;

    @Column(nullable = false, unique = true)
    private String tokenHash;

    @Column(nullable = false)
    private Instant expiresAt;

    // Set on links used before a reset deleted the account's links; still refused.
    private Instant usedAt;

    protected PasswordResetToken() {
    }

    public PasswordResetToken(Long userId, String tokenHash, Instant expiresAt) {
        this.userId = userId;
        this.tokenHash = tokenHash;
        this.expiresAt = expiresAt;
    }

    public boolean usableAt(Instant now) {
        return usedAt == null && now.isBefore(expiresAt);
    }

    public Long getUserId() {
        return userId;
    }
}
