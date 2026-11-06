package com.jobtracker.core.model;

import org.junit.jupiter.api.Test;

import java.util.EnumSet;
import java.util.Map;

import static com.jobtracker.core.model.InterviewPhase.INITIAL_SCREEN;
import static com.jobtracker.core.model.InterviewPhase.MID_ROUNDS;
import static com.jobtracker.core.model.InterviewPhase.PANEL;
import static org.assertj.core.api.Assertions.assertThat;

class InterviewTypeTests {

    // Written out, not derived: a new type fails here until someone decides which column it belongs in.
    private static final Map<InterviewType, InterviewPhase> BOARD_PHASE = Map.ofEntries(
            Map.entry(InterviewType.RECRUITER_PHONE_SCREEN, INITIAL_SCREEN),
            Map.entry(InterviewType.RECRUITER_DEBRIEF, INITIAL_SCREEN),
            Map.entry(InterviewType.TECHNICAL_PHONE_SCREEN, MID_ROUNDS),
            Map.entry(InterviewType.TAKE_HOME_ASSIGNMENT, MID_ROUNDS),
            Map.entry(InterviewType.TECHNICAL_CODE_REVIEW, MID_ROUNDS),
            Map.entry(InterviewType.HIRING_MANAGER_SCREEN, MID_ROUNDS),
            Map.entry(InterviewType.SYSTEM_DESIGN, MID_ROUNDS),
            Map.entry(InterviewType.DATA_MODELING, MID_ROUNDS),
            Map.entry(InterviewType.BEHAVIOR, MID_ROUNDS),
            Map.entry(InterviewType.CULTURE_FIT, MID_ROUNDS),
            Map.entry(InterviewType.VALUES, MID_ROUNDS),
            Map.entry(InterviewType.PANEL_CODING, PANEL),
            Map.entry(InterviewType.PANEL_SYSTEM_DESIGN, PANEL),
            Map.entry(InterviewType.PANEL_BEHAVIOR, PANEL),
            Map.entry(InterviewType.PANEL_CULTURE_FIT, PANEL),
            Map.entry(InterviewType.PANEL_VALUES, PANEL),
            Map.entry(InterviewType.PANEL_HIRING_MANAGER_CHAT, PANEL),
            Map.entry(InterviewType.PANEL_PRODUCT_XFN, PANEL),
            Map.entry(InterviewType.PANEL_TECHNICAL_DEMO, PANEL),
            Map.entry(InterviewType.PANEL_TECHNICAL_DEEP_DIVE, PANEL));

    @Test
    void everyTypeIsPlacedOnPurpose() {
        assertThat(BOARD_PHASE.keySet()).containsExactlyInAnyOrderElementsOf(EnumSet.allOf(InterviewType.class));
    }

    @Test
    void everyTypeMapsToItsBoardPhase() {
        BOARD_PHASE.forEach((type, phase) -> assertThat(type.phase()).as(type.name()).isEqualTo(phase));
    }
}
