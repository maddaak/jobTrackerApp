package com.jobtracker.core.dto;

import com.jobtracker.core.model.InterviewType;
import com.jobtracker.core.model.Stage;
import java.time.Instant;
import com.jobtracker.core.model.AiResult;
import java.util.List;
import java.util.Map;

public record InterviewResponse(
        String roundId,
        Long jobId,
        String company,
        String role,
        Stage stage,
        Instant interviewDateTime,
        Instant interviewEndDateTime,
        InterviewType interviewType,
        String meetingLink,
        String location,
        List<InterviewerResponse> interviewers,
        // By AiKind key: the round's debrief, once run.
        Map<String, AiResult> aiResults) {
}
