package com.jobtracker.core.model;

// Embedded: nothing ever queried these rows on their own, every read joined from the owning round.
public class Interviewer {

    private String name;
    private String linkedInUrl;

    protected Interviewer() {
    }

    public Interviewer(String name, String linkedInUrl) {
        this.name = name;
        this.linkedInUrl = linkedInUrl;
    }

    public String getName() {
        return name;
    }

    public String getLinkedInUrl() {
        return linkedInUrl;
    }
}
