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

    // Gzipped at rest; resume text is large, same as JobDetail.jdTextCompressed.
    private byte[] extractedTextCompressed;

    // Raw cached Claude output; null unless analysisStatus is OK.
    private String analysisJson;

    private String analysisStatus;

    // AI vs CUSTOM: drives the UI badge and how ResumeRecommenderService derives emphasis keywords.
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
