package com.jobtracker.core.model;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;
import java.time.Instant;

// Its own collection, not a field on JobDetail, which the modal reads whole on every open.
@Document(collection = "job_images")
public class JobImage {

    @Id
    private String id;

    @Indexed
    private Long jobId;

    @Indexed
    private Long ownerId;

    private String fileName;

    // The detected type, not the uploader's claim; what the download response echoes back.
    private String contentType;

    private int sizeBytes;

    private Instant uploadedAt;

    private byte[] data;

    protected JobImage() {
    }

    public JobImage(Long jobId, Long ownerId, String fileName, ImageType type, byte[] data) {
        this.jobId = jobId;
        this.ownerId = ownerId;
        this.fileName = fileName;
        this.contentType = type.getContentType();
        this.sizeBytes = data.length;
        this.uploadedAt = Instant.now();
        this.data = data;
    }

    public String getId() {
        return id;
    }

    public Long getJobId() {
        return jobId;
    }

    public String getFileName() {
        return fileName;
    }

    public String getContentType() {
        return contentType;
    }

    public int getSizeBytes() {
        return sizeBytes;
    }

    public Instant getUploadedAt() {
        return uploadedAt;
    }

    public byte[] getData() {
        return data;
    }
}
