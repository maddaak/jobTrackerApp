package com.jobtracker.core.model;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

// Everything the details modal shows. Postgres keeps only what the table page renders.
@Document(collection = "job_details")
public class JobDetail {

    @Id
    private String id;

    @Indexed(unique = true)
    private Long jobId;

    // Denormalized from jobs.owner_id so owner-scoped reads are one query, with ownership in it.
    @Indexed
    private Long ownerId;

    // Gzipped at rest; only the scraped JD text is large enough to be worth compressing.
    private byte[] jdTextCompressed;

    private String interviewNotes;

    // Kept independent of jdText/interviewNotes so later edits to those don't wipe it.
    private String recommendedResume;

    private String notes;

    private String rejectedReason;

    private List<StageHistoryEntry> stageHistory = new ArrayList<>();

    private List<InterviewRound> interviews = new ArrayList<>();

    protected JobDetail() {
    }

    public JobDetail(Long jobId, Long ownerId, byte[] jdTextCompressed, String interviewNotes) {
        this.jobId = jobId;
        this.ownerId = ownerId;
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

    public String getRecommendedResume() {
        return recommendedResume;
    }

    public void setRecommendedResume(String recommendedResume) {
        this.recommendedResume = recommendedResume;
    }

    public String getNotes() {
        return notes;
    }

    public String getRejectedReason() {
        return rejectedReason;
    }

    public List<StageHistoryEntry> getStageHistory() {
        return stageHistory;
    }

    public List<InterviewRound> getInterviews() {
        return interviews;
    }

    public void update(byte[] jdTextCompressed, String interviewNotes) {
        this.jdTextCompressed = jdTextCompressed;
        this.interviewNotes = interviewNotes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }

    public void setRejectedReason(String rejectedReason) {
        this.rejectedReason = rejectedReason;
    }

    public void recordStage(Stage stage, Instant enteredAt, String note) {
        this.stageHistory.add(new StageHistoryEntry(stage, enteredAt, note));
    }

    public void addInterview(InterviewRound round) {
        this.interviews.add(round);
    }

    public void removeInterview(String roundId) {
        this.interviews.removeIf(round -> round.getRoundId().equals(roundId));
    }

    public InterviewRound findInterview(String roundId) {
        return this.interviews.stream()
                .filter(round -> round.getRoundId().equals(roundId))
                .findFirst()
                .orElse(null);
    }
}
