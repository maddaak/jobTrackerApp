package com.jobtracker.core.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
// Every query is owner-scoped, so owner_id carries all the selectivity.
@Table(name = "jobs", indexes = @Index(name = "idx_jobs_owner_id", columnList = "owner_id"))
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

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private SourceCategory sourceCategory;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Stage currentStage;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Outcome outcome;

    // Free text and URLs have no natural bound; Hibernate's default varchar(255) rejected real notes.
    @Column(columnDefinition = "text")
    private String url;

    @Enumerated(EnumType.STRING)
    private Location location;

    private Integer compMin;

    private Integer compMax;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    protected Job() {
    }

    public Job(String company, String role, User owner, SourceCategory sourceCategory, String url, Location location,
            Integer compMin, Integer compMax) {
        this.company = company;
        this.role = role;
        this.owner = owner;
        this.sourceCategory = sourceCategory;
        this.url = url;
        this.location = location;
        this.compMin = compMin;
        this.compMax = compMax;
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

    public SourceCategory getSourceCategory() {
        return sourceCategory;
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

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void applyUpdate(String company, String role, SourceCategory sourceCategory, String url, Location location,
            Integer compMin, Integer compMax, Stage currentStage, Outcome outcome) {
        this.company = company;
        this.role = role;
        this.sourceCategory = sourceCategory;
        this.url = url;
        this.location = location;
        this.compMin = compMin;
        this.compMax = compMax;
        this.outcome = outcome;
        // Enforced here, not in the UI, so a direct PATCH can't park a closed job mid-pipeline.
        this.currentStage = outcome.closesPipeline() ? Stage.FINALIZED : currentStage;
    }

    public void advanceStageIfFurther(Stage newStage) {
        if (newStage.ordinal() > this.currentStage.ordinal()) {
            this.currentStage = newStage;
        }
    }
}
