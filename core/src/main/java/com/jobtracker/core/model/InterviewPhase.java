package com.jobtracker.core.model;

// Where an interviewing job sits on the board. Refines INTERVIEW_STAGE and WAITING_INTERVIEW_RESULTS, never replaces them.
public enum InterviewPhase {
    INITIAL_SCREEN,
    MID_ROUNDS,
    PANEL
}
