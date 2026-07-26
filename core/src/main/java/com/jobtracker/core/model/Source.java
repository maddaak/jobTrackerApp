
package com.jobtracker.core.model;

import jakarta.persistence.*;

@Entity
@Table(name = "sources")
public class Source {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private SourceCategory category;

    protected Source() {
    }

    public Source(SourceCategory category) {
        this.category = category;
    }

    public Long getId() {
        return id;
    }

    public SourceCategory getCategory() {
        return category;
    }

    public void setCategory(SourceCategory category) {
        this.category = category;
    }
}
