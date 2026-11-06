package com.jobtracker.core.model;

// Which resume a job was sent with, without the rest of its document.
public record JobResume(Long jobId, String sentResume) {
}
