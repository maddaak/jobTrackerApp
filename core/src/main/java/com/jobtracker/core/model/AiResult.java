package com.jobtracker.core.model;

import java.time.Instant;
import java.util.Map;

// An AI answer kept so seeing it again doesn't pay for it again. Core only stores and scopes it: the scraper
// checks its shape and the page renders it, so a new field in an answer needs no change here.
public record AiResult(Map<String, Object> content, Instant createdAt) {
}
