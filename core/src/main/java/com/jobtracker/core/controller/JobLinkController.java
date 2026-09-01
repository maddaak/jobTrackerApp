package com.jobtracker.core.controller;

import com.jobtracker.core.dto.CreateJobLinkRequest;
import com.jobtracker.core.dto.JobLinkResponse;
import com.jobtracker.core.service.JobLinkService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/jobs/{jobId}/links")
public class JobLinkController {

    private final JobLinkService jobLinkService;

    public JobLinkController(JobLinkService jobLinkService) {
        this.jobLinkService = jobLinkService;
    }

    @PostMapping
    public List<JobLinkResponse> link(
            @RequestHeader("X-User-Id") Long ownerId, @PathVariable Long jobId,
            @Valid @RequestBody CreateJobLinkRequest request) {
        return jobLinkService.link(ownerId, jobId, request.targetJobId(), request.relation());
    }

    @DeleteMapping("/{targetJobId}")
    public List<JobLinkResponse> unlink(
            @RequestHeader("X-User-Id") Long ownerId, @PathVariable Long jobId, @PathVariable Long targetJobId) {
        return jobLinkService.unlink(ownerId, jobId, targetJobId);
    }
}
