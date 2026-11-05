package com.jobtracker.core.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
// Every query is owner-scoped, so owner_id carries all the selectivity.
@Table(name = "jobs", indexes = @Index(name = "idx_jobs_owner_id", columnList = "owner_id"))
public class Job {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String company;

    @Column(nullable = false)
    private String role;

    @ManyToOne(optional = false)
    private User owner;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private SourceCategory sourceCategory;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Stage currentStage;

    // Nullable so the column adds to a populated table without a backfill; see interviewPhaseOr.
    @Enumerated(EnumType.STRING)
    private InterviewPhase interviewPhase;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Outcome outcome;

    // Free text and URLs have no natural bound; Hibernate's default varchar(255) rejected real notes.
    @Column(columnDefinition = "text")
    private String url;

    @Enumerated(EnumType.STRING)
    private Location location;

    @Column(length = 100)
    private String city;

    private Integer compMin;

    private Integer compMax;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    @Column(nullable = false)
    private Long seasonId;

    protected Job() {
    }

    public Job(String company, String role, User owner, SourceCategory sourceCategory, String url, Location location,
            Integer compMin, Integer compMax) {
        this.company = company;
        this.role = role;
        this.owner = owner;
        this.sourceCategory = sourceCategory;
        this.url = url;
        this.location = location;
        this.compMin = compMin;
        this.compMax = compMax;
        this.currentStage = Stage.RESUME_CHECK;
        this.outcome = Outcome.ACTIVE;
    }

    public Long getId() {
        return id;
    }

    public String getCompany() {
        return company;
    }

    public String getRole() {
        return role;
    }

    public User getOwner() {
        return owner;
    }

    public SourceCategory getSourceCategory() {
        return sourceCategory;
    }

    public Stage getCurrentStage() {
        return currentStage;
    }

    public Outcome getOutcome() {
        return outcome;
    }

    public String getUrl() {
        return url;
    }

    public Location getLocation() {
        return location;
    }

    public String getCity() {
        return city;
    }

    public void setCity(String city) {
        this.city = city == null || city.isBlank() ? null : city.strip();
    }

    public Long getSeasonId() {
        return seasonId;
    }

    public void moveToSeason(Long seasonId) {
        this.seasonId = seasonId;
    }

    public Integer getCompMin() {
        return compMin;
    }

    public Integer getCompMax() {
        return compMax;
    }

    // Puts back exactly what a backup or an import held, without applyUpdate's rules: the caller has applied them.
    public void restoreState(Stage currentStage, InterviewPhase interviewPhase, Outcome outcome, Instant createdAt) {
        this.currentStage = currentStage;
        this.interviewPhase = interviewPhase;
        this.outcome = outcome;
        this.createdAt = createdAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    // A decided offer keeps OFFER_STAGE, but the outcome check covers a stage rewound after the fact.
    public boolean hasOffer() {
        return currentStage == Stage.OFFER_STAGE
                || outcome == Outcome.OFFER_ACCEPTED || outcome == Outcome.OFFER_DECLINED;
    }

    public InterviewPhase getInterviewPhase() {
        return interviewPhase;
    }

    // Where the card sits: the drag if there was one, else the furthest round logged. Never stored, so a
    // later round can still move an undragged card.
    public InterviewPhase boardPhase(InterviewPhase furthestRoundPhase) {
        return interviewPhase != null ? interviewPhase : furthestRoundPhase;
    }

    // Interviewing, not waiting on a verdict, and nothing booked ahead: they've asked for the next round and
    // it isn't on the calendar yet. A round under way counts as booked until it ends.
    public boolean needsScheduling(InterviewRound latestRound, Instant now) {
        if (outcome != Outcome.ACTIVE || currentStage != Stage.INTERVIEW_STAGE) {
            return false;
        }
        if (latestRound == null || latestRound.getInterviewDateTime() == null) {
            return true;
        }
        Instant over = latestRound.getInterviewEndDateTime() != null
                ? latestRound.getInterviewEndDateTime() : latestRound.getInterviewDateTime();
        return over.isBefore(now);
    }

    // An offer reached and then lost (withdrawn, rejected) still counts, which the current stage alone forgets.
    public boolean reachedOffer(Stage furthestStage) {
        return hasOffer() || furthestStage == Stage.OFFER_STAGE;
    }

    public void applyUpdate(String company, String role, SourceCategory sourceCategory, String url, Location location,
            Integer compMin, Integer compMax, Stage currentStage, InterviewPhase interviewPhase, Outcome outcome) {
        this.company = company;
        this.role = role;
        this.sourceCategory = sourceCategory;
        this.url = url;
        this.location = location;
        this.compMin = compMin;
        this.compMax = compMax;
        this.outcome = outcome;
        // Enforced here, not in the UI, so a direct PATCH can't park a closed job mid-pipeline.
        this.currentStage = outcome.closesPipeline() ? Stage.FINALIZED : currentStage;
        // A phase only means something while interviewing; kept elsewhere it would resurface on a later return.
        this.interviewPhase = this.currentStage.isInterviewing() ? interviewPhase : null;
    }

    // Moves the job to wherever the trail now ends, unless a closed outcome pins it to FINALIZED.
    public void rewindStageTo(Stage stage) {
        this.currentStage = outcome.closesPipeline() ? Stage.FINALIZED : stage;
        if (!this.currentStage.isInterviewing()) {
            this.interviewPhase = null;
        }
    }

    public void advanceStageIfFurther(Stage newStage) {
        if (newStage.ordinal() > this.currentStage.ordinal()) {
            this.currentStage = newStage;
        }
    }
}
