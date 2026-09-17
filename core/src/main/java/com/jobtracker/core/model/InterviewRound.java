package com.jobtracker.core.model;

import com.jobtracker.core.exception.InvalidInterviewTimeException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

// Embedded in JobDetail: variable rounds each owning variable interviewers is a document, not tables.
public class InterviewRound {

    // Addressable id for update/delete, since embedded documents have no database identity.
    private String roundId;
    private Instant interviewDateTime;

    // Optional: rounds recorded before end times existed have none, and the length is not always known.
    private Instant interviewEndDateTime;

    private InterviewType interviewType;
    private String meetingLink;
    private String location;
    private List<Interviewer> interviewers = new ArrayList<>();

    protected InterviewRound() {
    }

    public InterviewRound(Instant interviewDateTime, Instant interviewEndDateTime, InterviewType interviewType,
            String meetingLink, String location, List<Interviewer> interviewers) {
        this.roundId = UUID.randomUUID().toString();
        apply(interviewDateTime, interviewEndDateTime, interviewType, meetingLink, location, interviewers);
    }

    public String getRoundId() {
        return roundId;
    }

    public Instant getInterviewDateTime() {
        return interviewDateTime;
    }

    public Instant getInterviewEndDateTime() {
        return interviewEndDateTime;
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

    // Here rather than in a service so create and update cannot disagree about what a round may hold.
    public void apply(Instant interviewDateTime, Instant interviewEndDateTime, InterviewType interviewType,
            String meetingLink, String location, List<Interviewer> interviewers) {
        if (interviewEndDateTime != null && interviewDateTime != null
                && !interviewEndDateTime.isAfter(interviewDateTime)) {
            throw new InvalidInterviewTimeException("an interview must end after it starts");
        }
        this.interviewDateTime = interviewDateTime;
        this.interviewEndDateTime = interviewEndDateTime;
        this.interviewType = interviewType;
        this.meetingLink = meetingLink;
        this.location = location;
        this.interviewers = interviewers == null ? new ArrayList<>() : new ArrayList<>(interviewers);
    }
}
