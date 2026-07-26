package com.jobtracker.core.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "stage_events")
public class StageEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false)
    private Job job;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Stage stage;

    @Column(nullable = false)
    private Instant enteredAt;

    private String note;

    private Instant interviewDateTime;

    @Enumerated(EnumType.STRING)
    private InterviewType interviewType;

    private String meetingLink;

    private String location;

    @OneToMany(mappedBy = "stageEvent", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<Interviewer> interviewers = new ArrayList<>();

    protected StageEvent() {
    }

    public StageEvent(Job job, Stage stage, Instant enteredAt, String note) {
        this.job = job;
        this.stage = stage;
        this.enteredAt = enteredAt;
        this.note = note;
    }

    public Long getId() {
        return id;
    }

    public Job getJob() {
        return job;
    }

    public Stage getStage() {
        return stage;
    }

    public Instant getEnteredAt() {
        return enteredAt;
    }

    public String getNote() {
        return note;
    }

    public Instant getInterviewDateTime() {
        return interviewDateTime;
    }

    public InterviewType getInterviewType() {
        return interviewType;
    }

    public String getMeetingLink() {
        return meetingLink;
    }

    public String getLocation() {
        return location;
    }

    public List<Interviewer> getInterviewers() {
        return interviewers;
    }

    public void applyInterviewDetails(Instant interviewDateTime, InterviewType interviewType,
            String meetingLink, String location, List<Interviewer> newInterviewers) {
        this.interviewDateTime = interviewDateTime;
        this.interviewType = interviewType;
        this.meetingLink = meetingLink;
        this.location = location;
        this.interviewers.clear();
        for (Interviewer interviewer : newInterviewers) {
            interviewer.setStageEvent(this);
            this.interviewers.add(interviewer);
        }
    }
}
