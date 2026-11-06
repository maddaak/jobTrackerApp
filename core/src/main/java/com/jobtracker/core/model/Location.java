package com.jobtracker.core.model;

import com.fasterxml.jackson.annotation.JsonCreator;

import java.util.Map;

// The work model. Where the office is goes in the job's city.
public enum Location {
    REMOTE,
    ON_SITE,
    HYBRID;

    // Before V4 the only offices were in New York, so the two office models carried the city in their names.
    // A database or backup from then still holds these.
    public static final Map<String, Location> PRE_V4_NAMES = Map.of("NYC_IN_PERSON", ON_SITE, "NYC_HYBRID", HYBRID);
    public static final String PRE_V4_CITY = "New York";

    // So a pre-V4 backup still reads, down to the location a saved market check priced.
    @JsonCreator
    public static Location fromName(String name) {
        Location renamed = PRE_V4_NAMES.get(name);
        return renamed != null ? renamed : valueOf(name);
    }
}
