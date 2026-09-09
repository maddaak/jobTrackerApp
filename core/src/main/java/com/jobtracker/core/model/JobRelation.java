package com.jobtracker.core.model;

public enum JobRelation {
    REPLACED_BY,
    REPLACES,
    RELATED;

    // Both ends are stored, so writing one needs the other's wording.
    public JobRelation inverse() {
        return switch (this) {
            case REPLACED_BY -> REPLACES;
            case REPLACES -> REPLACED_BY;
            case RELATED -> RELATED;
        };
    }
}
