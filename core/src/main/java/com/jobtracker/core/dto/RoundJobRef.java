package com.jobtracker.core.dto;

import com.jobtracker.core.model.InterviewType;

import java.util.List;

// `times` keeps a company faced twice as one application. `components` is what its panel held,
// empty for single-type rows since it would only repeat the row's own label.
public record RoundJobRef(Long jobId, String company, String role, long times, List<InterviewType> components) {
}
