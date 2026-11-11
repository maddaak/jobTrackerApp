package com.jobtracker.core.exception;

public class SampleDataRefusedException extends RuntimeException {
    public SampleDataRefusedException() {
        super("sample data goes only into an account with no jobs yet, so it never mixes with a real search");
    }
}
