package com.jobtracker.core.model;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;
import java.time.Instant;

@Document(collection = "resumes")
public class Resume {

    @Id
    private String id;

    @Indexed
    private Long ownerId;

    private String fileName;

    private String contentType;

    // Compressed at rest, same reasoning as JobDetail.jdTextCompressed: resume text runs
    // a few KB to tens of KB and gzip shrinks it substantially.
    private byte[] extractedTextCompressed;

    // Cached Claude output, stored as-is (raw JSON string) until AnalysisStatus.OK; null
    // otherwise. AnalysisStatus explains *why* it's null when it is, not just that it is.
    private String analysisJson;

    private String analysisStatus;

    // Which path produced analysisJson: AnalysisSource.AI (Claude-generated) or
    // AnalysisSource.CUSTOM (the user typed their own summary instead of calling Claude).
    // Null until applyAnalysis is called. Shown in the UI so the disclaimer/badge reflects
    // reality, and used by ResumeRecommenderService to decide how to derive emphasis
    // keywords for a resume (structured skills/roles vs. tokenized summary text).
    private String analysisSource;

    private Instant uploadedAt;

    protected Resume() {
    }

    public Resume(Long ownerId, String fileName, String contentType, byte[] extractedTextCompressed) {
        this.ownerId = ownerId;
        this.fileName = fileName;
        this.contentType = contentType;
        this.extractedTextCompressed = extractedTextCompressed;
        this.analysisStatus = AnalysisStatus.PENDING;
        this.uploadedAt = Instant.now();
    }

    public String getId() {
        return id;
    }

    public Long getOwnerId() {
        return ownerId;
    }

    public String getFileName() {
        return fileName;
    }

    public String getContentType() {
        return contentType;
    }

    public byte[] getExtractedTextCompressed() {
        return extractedTextCompressed;
    }

    public String getAnalysisJson() {
        return analysisJson;
    }

    public String getAnalysisStatus() {
        return analysisStatus;
    }

    public String getAnalysisSource() {
        return analysisSource;
    }

    public Instant getUploadedAt() {
        return uploadedAt;
    }

    public void applyAnalysis(String analysisJson, String analysisStatus, String analysisSource) {
        this.analysisJson = analysisJson;
        this.analysisStatus = analysisStatus;
        this.analysisSource = analysisSource;
    }

    public static final class AnalysisStatus {
        public static final String PENDING = "pending";
        public static final String OK = "ok";
        public static final String NOT_CONFIGURED = "not_configured";
        public static final String UNAVAILABLE = "unavailable";

        private AnalysisStatus() {
        }
    }

    public static final class AnalysisSource {
        public static final String AI = "ai";
        public static final String CUSTOM = "custom";

        private AnalysisSource() {
        }
    }
}
