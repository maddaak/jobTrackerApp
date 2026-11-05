package com.jobtracker.core.model;

public enum InterviewType {
    RECRUITER_PHONE_SCREEN,
    TECHNICAL_PHONE_SCREEN,
    TAKE_HOME_ASSIGNMENT,
    TECHNICAL_CODE_REVIEW,
    HIRING_MANAGER_SCREEN,
    SYSTEM_DESIGN,
    DATA_MODELING,
    BEHAVIOR,
    CULTURE_FIT,
    VALUES,
    PANEL_CODING,
    PANEL_SYSTEM_DESIGN,
    PANEL_BEHAVIOR,
    PANEL_CULTURE_FIT,
    PANEL_VALUES,
    PANEL_HIRING_MANAGER_CHAT,
    PANEL_PRODUCT_XFN,
    PANEL_TECHNICAL_DEMO,
    PANEL_TECHNICAL_DEEP_DIVE,
    RECRUITER_DEBRIEF;

    // The prefix is the marker: a panel round is one slot of a larger loop, not a step on its own.
    public boolean isPanel() {
        return name().startsWith("PANEL");
    }

    // A debrief follows a recruiter screen, so it belongs with it rather than counting as a mid round.
    public InterviewPhase phase() {
        if (isPanel()) {
            return InterviewPhase.PANEL;
        }
        if (this == RECRUITER_PHONE_SCREEN || this == RECRUITER_DEBRIEF) {
            return InterviewPhase.INITIAL_SCREEN;
        }
        return InterviewPhase.MID_ROUNDS;
    }
}
