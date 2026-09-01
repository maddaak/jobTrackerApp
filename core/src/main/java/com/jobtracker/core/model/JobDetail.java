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

    private List<JobLink> relatedJobs = new ArrayList<>();

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

    public List<JobLink> getRelatedJobs() {
        return links();
    }

    // Replace, not append: changing a relation must not leave two edges.
    public void linkTo(Long otherJobId, JobRelation relation) {
        links().removeIf(link -> link.getJobId().equals(otherJobId));
        links().add(new JobLink(otherJobId, relation));
    }

    public void unlinkFrom(Long otherJobId) {
        links().removeIf(link -> link.getJobId().equals(otherJobId));
    }

    // Documents written before this field existed map it to null.
    private List<JobLink> links() {
        if (relatedJobs == null) {
            relatedJobs = new ArrayList<>();
        }
        return relatedJobs;
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

    // Two entries can share a millisecond timestamp, so match the stage too and remove only one.
    public boolean removeStageEntry(Instant enteredAt, Stage stage) {
        for (int i = 0; i < this.stageHistory.size(); i++) {
            StageHistoryEntry entry = this.stageHistory.get(i);
            if (entry.getEnteredAt().equals(enteredAt) && (stage == null || entry.getStage() == stage)) {
                this.stageHistory.remove(i);
                return true;
            }
        }
        return false;
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
