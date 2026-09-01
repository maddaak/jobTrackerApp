package com.jobtracker.core.model;

// Stored on both ends so a row renders its links without scanning for inbound edges.
public class JobLink {

    private Long jobId;
    private JobRelation relation;

    protected JobLink() {
    }

    public JobLink(Long jobId, JobRelation relation) {
        this.jobId = jobId;
        this.relation = relation;
    }

    public Long getJobId() {
        return jobId;
    }

    public JobRelation getRelation() {
        return relation;
    }
}
