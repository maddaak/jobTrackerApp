package com.jobtracker.core.model;

import jakarta.persistence.*;
import java.time.Instant;

// One job hunt. Every job belongs to one, so a search started next year doesn't mix with this one.
@Entity
@Table(name = "seasons")
public class Season {

    public static final String FIRST_NAME = "My job hunt";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long ownerId;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    protected Season() {
    }

    public Season(Long ownerId, String name) {
        this.ownerId = ownerId;
        this.name = name.strip();
    }

    public void rename(String name) {
        this.name = name.strip();
    }

    public Long getId() {
        return id;
    }

    public Long getOwnerId() {
        return ownerId;
    }

    public String getName() {
        return name;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
