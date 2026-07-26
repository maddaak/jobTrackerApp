package com.jobtracker.core.exception;

public class UnsupportedResumeTypeException extends RuntimeException {
    public UnsupportedResumeTypeException(String contentType) {
        super("unsupported resume file type: " + contentType + " (only PDF, DOCX, and plain text are supported)");
    }
}
