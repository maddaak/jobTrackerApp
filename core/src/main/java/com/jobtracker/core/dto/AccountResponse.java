package com.jobtracker.core.dto;

// name and email are null on an account made before V4 until the person fills them in under Profile.
public record AccountResponse(String username, String name, String email) {
}
