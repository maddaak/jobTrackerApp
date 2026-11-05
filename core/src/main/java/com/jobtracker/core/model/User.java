package com.jobtracker.core.model;

import jakarta.persistence.*;
import org.hibernate.annotations.DynamicUpdate;
import java.time.Instant;

// Writes only the columns that changed, so a season switch landing beside a password change can't put the
// old hash or session version back.
@Entity
@DynamicUpdate
@Table(name = "users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false)
    private String username;

    @Column(nullable = false)
    private String passwordHash;

    // Nullable only because accounts made before V4 have neither; registration requires both.
    private String name;
    private String email;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    // The season the board, calendar, and Insights show; null shows every season together.
    private Long activeSeasonId;

    // Carried in each session token; a token with an older one is signed out.
    @Column(nullable = false)
    private int sessionVersion;

    protected User() {
    }

    public User(String username, String passwordHash) {
        this.username = username;
        this.passwordHash = passwordHash;
    }

    public User(String username, String passwordHash, String name, String email) {
        this(username, passwordHash);
        this.name = name;
        this.email = email;
    }

    public void updateProfile(String name, String email) {
        this.name = name;
        this.email = email;
    }

    // A new password ends every session, so one opened with the old password, or a stolen cookie, stops working.
    public void changePasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
        endSessions();
    }

    public void endSessions() {
        sessionVersion++;
    }

    public int getSessionVersion() {
        return sessionVersion;
    }

    public Long getId() {
        return id;
    }

    public String getUsername() {
        return username;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public String getName() {
        return name;
    }

    public String getEmail() {
        return email;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Long getActiveSeasonId() {
        return activeSeasonId;
    }

    public void viewSeason(Long seasonId) {
        this.activeSeasonId = seasonId;
    }
}
