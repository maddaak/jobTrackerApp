package com.jobtracker.core.model;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

// Embedded in JobDetail: variable rounds each owning variable interviewers is a document, not tables.
public class InterviewRound {

    // Addressable id for update/delete, since embedded documents have no database identity.
    private String roundId;
    private Instant interviewDateTime;
    private InterviewType interviewType;
    private String meetingLink;
    private String location;
    private List<Interviewer> interviewers = new ArrayList<>();

    protected InterviewRound() {
    }

    public InterviewRound(Instant interviewDateTime, InterviewType interviewType, String meetingLink,
            String location, List<Interviewer> interviewers) {
        this.roundId = UUID.randomUUID().toString();
        apply(interviewDateTime, interviewType, meetingLink, location, interviewers);
    }

    public String getRoundId() {
        return roundId;
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

    public void apply(Instant interviewDateTime, InterviewType interviewType, String meetingLink,
            String location, List<Interviewer> interviewers) {
        this.interviewDateTime = interviewDateTime;
        this.interviewType = interviewType;
        this.meetingLink = meetingLink;
        this.location = location;
        this.interviewers = interviewers == null ? new ArrayList<>() : new ArrayList<>(interviewers);
    }
}
