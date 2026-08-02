package com.jobtracker.core.controller;

import com.jobtracker.core.dto.CreateInterviewRequest;
import com.jobtracker.core.dto.InterviewResponse;
import com.jobtracker.core.dto.UpdateInterviewRequest;
import com.jobtracker.core.service.InterviewService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/interviews")
public class InterviewController {

    private final InterviewService interviewService;

    public InterviewController(InterviewService interviewService) {
        this.interviewService = interviewService;
    }

    @PostMapping
    public InterviewResponse create(
            @RequestHeader("X-User-Id") Long ownerId, @Valid @RequestBody CreateInterviewRequest request) {
        return interviewService.createInterview(ownerId, request);
    }

    @PatchMapping("/{id}")
    public InterviewResponse update(
            @RequestHeader("X-User-Id") Long ownerId, @PathVariable Long id,
            @Valid @RequestBody UpdateInterviewRequest request) {
        return interviewService.updateInterview(ownerId, id, request);
    }

    @GetMapping
    public List<InterviewResponse> list(@RequestHeader("X-User-Id") Long ownerId) {
        return interviewService.listInterviews(ownerId);
    }

    @GetMapping("/upcoming")
    public List<InterviewResponse> upcoming(@RequestHeader("X-User-Id") Long ownerId) {
        return interviewService.listUpcomingInterviews(ownerId);
    }

    @DeleteMapping("/{id}")
    public Map<String, Boolean> delete(@RequestHeader("X-User-Id") Long ownerId, @PathVariable Long id) {
        interviewService.deleteInterview(ownerId, id);
        return Map.of("deleted", true);
    }
}
