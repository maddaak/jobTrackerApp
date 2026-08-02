package com.jobtracker.core.controller;

import com.jobtracker.core.dto.CreateJobRequest;
import com.jobtracker.core.dto.JobDetailDocumentResponse;
import com.jobtracker.core.dto.JobDetailResponse;
import com.jobtracker.core.dto.JobSummaryResponse;
import com.jobtracker.core.dto.ResumeRecommendationResponse;
import com.jobtracker.core.dto.UpdateJobDetailRequest;
import com.jobtracker.core.dto.UpdateJobRequest;
import com.jobtracker.core.service.JobDetailService;
import com.jobtracker.core.service.JobService;
import com.jobtracker.core.service.ResumeRecommenderService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/jobs")
public class JobController {

    private final JobService jobService;
    private final JobDetailService jobDetailService;
    private final ResumeRecommenderService resumeRecommenderService;

    public JobController(
            JobService jobService, JobDetailService jobDetailService, ResumeRecommenderService resumeRecommenderService) {
        this.jobService = jobService;
        this.jobDetailService = jobDetailService;
        this.resumeRecommenderService = resumeRecommenderService;
    }

    @PostMapping
    public JobDetailResponse create(
            @RequestHeader("X-User-Id") Long ownerId, @Valid @RequestBody CreateJobRequest request) {
        return jobService.createJob(ownerId, request);
    }

    @GetMapping
    public List<JobSummaryResponse> list(@RequestHeader("X-User-Id") Long ownerId) {
        return jobService.listJobs(ownerId);
    }

    @GetMapping("/{id}")
    public JobDetailResponse get(@RequestHeader("X-User-Id") Long ownerId, @PathVariable Long id) {
        return jobService.getJob(ownerId, id);
    }

    @PatchMapping("/{id}")
    public JobSummaryResponse update(
            @RequestHeader("X-User-Id") Long ownerId, @PathVariable Long id,
            @Valid @RequestBody UpdateJobRequest request) {
        return jobService.updateJob(ownerId, id, request);
    }

    @DeleteMapping("/{id}")
    public Map<String, Boolean> delete(@RequestHeader("X-User-Id") Long ownerId, @PathVariable Long id) {
        jobService.deleteJob(ownerId, id);
        return Map.of("deleted", true);
    }

    @GetMapping("/{id}/detail")
    public JobDetailDocumentResponse getDetail(@RequestHeader("X-User-Id") Long ownerId, @PathVariable Long id) {
        return jobDetailService.getDetail(ownerId, id);
    }

    @PutMapping("/{id}/detail")
    public JobDetailDocumentResponse updateDetail(
            @RequestHeader("X-User-Id") Long ownerId, @PathVariable Long id,
            @RequestBody UpdateJobDetailRequest request) {
        return jobDetailService.updateDetail(ownerId, id, request);
    }

    @GetMapping("/{id}/resume-recommendation")
    public ResumeRecommendationResponse getResumeRecommendation(
            @RequestHeader("X-User-Id") Long ownerId, @PathVariable Long id) {
        return resumeRecommenderService.recommend(ownerId, id);
    }
}
