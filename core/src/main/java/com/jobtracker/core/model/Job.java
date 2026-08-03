package com.jobtracker.core.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "jobs")
public class Job {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String company;

    @Column(nullable = false)
    private String role;

    @ManyToOne(optional = false)
    private User owner;

    @ManyToOne(optional = false)
    private Source source;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Stage currentStage;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Outcome outcome;

    private String url;

    @Enumerated(EnumType.STRING)
    private Location location;

    private Integer compMin;

    private Integer compMax;

    private String rejectedReason;

    private String notes;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    protected Job() {
    }

    public Job(String company, String role, User owner, Source source, String url, Location location,
            Integer compMin, Integer compMax, String notes) {
        this.company = company;
        this.role = role;
        this.owner = owner;
        this.source = source;
        this.url = url;
        this.location = location;
        this.compMin = compMin;
        this.compMax = compMax;
        this.notes = notes;
        this.currentStage = Stage.RESUME_CHECK;
        this.outcome = Outcome.ACTIVE;
    }

    public Long getId() {
        return id;
    }

    public String getCompany() {
        return company;
    }

    public String getRole() {
        return role;
    }

    public User getOwner() {
        return owner;
    }

    public Source getSource() {
        return source;
    }

    public Stage getCurrentStage() {
        return currentStage;
    }

    public Outcome getOutcome() {
        return outcome;
    }

    public String getUrl() {
        return url;
    }

    public Location getLocation() {
        return location;
    }

    public Integer getCompMin() {
        return compMin;
    }

    public Integer getCompMax() {
        return compMax;
    }

    public String getRejectedReason() {
        return rejectedReason;
    }

    public String getNotes() {
        return notes;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void applyUpdate(String company, String role, String url, Location location,
            Integer compMin, Integer compMax, String notes, String rejectedReason,
            Stage currentStage, Outcome outcome) {
        this.company = company;
        this.role = role;
        this.url = url;
        this.location = location;
        this.compMin = compMin;
        this.compMax = compMax;
        this.notes = notes;
        this.rejectedReason = rejectedReason;
        this.currentStage = currentStage;
        this.outcome = outcome;
    }

    public void advanceStageIfFurther(Stage newStage) {
        if (newStage.ordinal() > this.currentStage.ordinal()) {
            this.currentStage = newStage;
        }
    }

    // Only ever lowers the stage, so a deliberate manual downgrade is left untouched.
    public void lowerStageTo(Stage furthestRemaining) {
        if (furthestRemaining.ordinal() < this.currentStage.ordinal()) {
            this.currentStage = furthestRemaining;
        }
    }
}
