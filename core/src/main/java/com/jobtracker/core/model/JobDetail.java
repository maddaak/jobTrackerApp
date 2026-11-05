package com.jobtracker.core.model;

import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.Version;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

// Everything the details modal shows. Postgres keeps only what the table page renders.
@Document(collection = "job_details")
public class JobDetail {

    @Id
    private String id;

    // Every change loads and saves the whole document, so a save from a stale copy (a drag landing
    // mid modal-save) is refused rather than silently undoing the other. Backfilled by DetailVersions.
    @Version
    private Long version;

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

    // The resume file actually sent, which may not be the recommended one; Insights compares replies by it.
    private String sentResume;

    private String notes;

    private String rejectedReason;

    private List<StageHistoryEntry> stageHistory = new ArrayList<>();

    private List<InterviewRound> interviews = new ArrayList<>();

    private List<JobLink> relatedJobs = new ArrayList<>();

    private Offer offer;

    // By AiKind key: the job's follow-up and negotiation drafts and its resume tailoring.
    private Map<String, AiResult> aiResults = new HashMap<>();

    // Made up by the sample-data button, so removing the sample can never touch a real job.
    private boolean sample;

    private List<Contact> contacts = new ArrayList<>();

    protected JobDetail() {
    }

    // A job's document before anything is written to it; empty bytes read back as an empty description.
    public JobDetail(Long jobId, Long ownerId) {
        this(jobId, ownerId, new byte[0], "");
    }

    public JobDetail(Long jobId, Long ownerId, byte[] jdTextCompressed, String interviewNotes) {
        this.jobId = jobId;
        this.ownerId = ownerId;
        this.jdTextCompressed = jdTextCompressed;
        this.interviewNotes = interviewNotes;
    }

    // A backup's copy, made into a new document for the job's new id. A link to a job the backup didn't
    // hold is dropped rather than left pointing at someone else's id.
    public void restoreAs(Long newJobId, Long newOwnerId, java.util.Map<Long, Long> newJobIds) {
        this.id = null;
        this.version = null;
        this.jobId = newJobId;
        this.ownerId = newOwnerId;
        this.relatedJobs = links().stream()
                .filter(link -> newJobIds.containsKey(link.getJobId()))
                .map(link -> link.retargeted(newJobIds.get(link.getJobId())))
                .collect(java.util.stream.Collectors.toCollection(ArrayList::new));
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

    public String getSentResume() {
        return sentResume;
    }

    public void setSentResume(String sentResume) {
        this.sentResume = sentResume == null || sentResume.isBlank() ? null : sentResume.strip();
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

    public Offer getOffer() {
        return offer;
    }

    public void setOffer(Offer offer) {
        this.offer = offer;
    }

    // Documents written before this field existed map it to null.
    public Map<String, AiResult> getAiResults() {
        if (aiResults == null) {
            aiResults = new HashMap<>();
        }
        return aiResults;
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

    public void setJdTextCompressed(byte[] jdTextCompressed) {
        this.jdTextCompressed = jdTextCompressed;
    }

    public void setInterviewNotes(String interviewNotes) {
        this.interviewNotes = interviewNotes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }

    public void setRejectedReason(String rejectedReason) {
        this.rejectedReason = rejectedReason;
    }

    // A document written before contacts existed reads the field as null.
    public List<Contact> getContacts() {
        return contacts == null ? List.of() : contacts;
    }

    public void setContacts(List<Contact> contacts) {
        this.contacts = new ArrayList<>(contacts);
    }

    public void markSample() {
        this.sample = true;
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
