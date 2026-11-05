package com.jobtracker.core.model;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import java.time.Instant;
import java.util.Map;

// An AI result about the whole account rather than one job: a company brief, shared by every job at that
// company, or the Insights patterns and offer comparison of one season. key says which, so one account
// holds one of each.
@Document(collection = "ai_results")
public class AccountAiResult {

    @Id
    private String id;

    private Long ownerId;
    private String key;
    private Map<String, Object> content;
    private Instant createdAt;

    protected AccountAiResult() {
    }

    public AccountAiResult(Long ownerId, String key, AiResult result) {
        this.ownerId = ownerId;
        this.key = key;
        replace(result);
    }

    public void replace(AiResult result) {
        this.content = result.content();
        this.createdAt = result.createdAt();
    }

    public AiResult result() {
        return new AiResult(content, createdAt);
    }

    public void restoreAs(Long newOwnerId) {
        this.id = null;
        this.ownerId = newOwnerId;
    }

    // Keyed by one season's id, which a restore doesn't keep: seasons come back under new ids.
    public boolean madeForOneSeason() {
        return key != null && key.matches(".*:season:\\d+");
    }
}
