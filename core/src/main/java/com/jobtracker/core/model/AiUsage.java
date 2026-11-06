package com.jobtracker.core.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PostLoad;
import jakarta.persistence.PostPersist;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;
import org.springframework.data.domain.Persistable;
import java.time.LocalDate;

// How many AI calls the app made on one UTC day.
@Entity
@Table(name = "ai_usage")
public class AiUsage implements Persistable<LocalDate> {

    @Id
    @Column(name = "usage_day")
    private LocalDate day;

    // The key is assigned, so save() would otherwise merge a new day over the one another call just added.
    @Transient
    private boolean stored;

    @Column(nullable = false)
    private int calls;

    protected AiUsage() {
    }

    public AiUsage(LocalDate day) {
        this.day = day;
    }

    @PostLoad
    @PostPersist
    void markStored() {
        stored = true;
    }

    @Override
    public LocalDate getId() {
        return day;
    }

    @Override
    public boolean isNew() {
        return !stored;
    }

    public int getCalls() {
        return calls;
    }

    public void counted() {
        calls++;
    }
}
