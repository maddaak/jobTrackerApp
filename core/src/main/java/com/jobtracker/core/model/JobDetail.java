package com.jobtracker.core.model;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

@Document(collection = "job_details")
public class JobDetail {

    @Id
    private String id;

    @Indexed(unique = true)
    private Long jobId;

    // Compressed at rest — this is the field that's actually large (scraped JD text);
    // interviewNotes is short and user-typed, not worth the compression overhead.
    private byte[] jdTextCompressed;

    private String interviewNotes;

    protected JobDetail() {
    }

    public JobDetail(Long jobId, byte[] jdTextCompressed, String interviewNotes) {
        this.jobId = jobId;
        this.jdTextCompressed = jdTextCompressed;
        this.interviewNotes = interviewNotes;
    }

    public String getId() {
        return id;
    }

    public Long getJobId() {
        return jobId;
    }

    public byte[] getJdTextCompressed() {
        return jdTextCompressed;
    }

    public String getInterviewNotes() {
        return interviewNotes;
    }

    public void update(byte[] jdTextCompressed, String interviewNotes) {
        this.jdTextCompressed = jdTextCompressed;
        this.interviewNotes = interviewNotes;
    }
}
