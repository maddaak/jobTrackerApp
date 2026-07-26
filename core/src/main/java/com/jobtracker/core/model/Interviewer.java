package com.jobtracker.core.model;

import jakarta.persistence.*;

@Entity
@Table(name = "interviewers")
public class Interviewer {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false)
    private StageEvent stageEvent;

    @Column(nullable = false)
    private String name;

    private String linkedInUrl;

    protected Interviewer() {
    }

    public Interviewer(String name, String linkedInUrl) {
        this.name = name;
        this.linkedInUrl = linkedInUrl;
    }

    void setStageEvent(StageEvent stageEvent) {
        this.stageEvent = stageEvent;
    }

    public Long getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getLinkedInUrl() {
        return linkedInUrl;
    }
}
