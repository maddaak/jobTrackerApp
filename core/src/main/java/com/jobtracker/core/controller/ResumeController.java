package com.jobtracker.core.controller;

import com.jobtracker.core.dto.ApplyResumeAnalysisRequest;
import com.jobtracker.core.dto.CreateResumeResponse;
import com.jobtracker.core.dto.ResumeSummaryResponse;
import com.jobtracker.core.dto.ResumeTextResponse;
import com.jobtracker.core.service.ResumeService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/resumes")
public class ResumeController {

    private final ResumeService resumeService;

    public ResumeController(ResumeService resumeService) {
        this.resumeService = resumeService;
    }

    @PostMapping
    public CreateResumeResponse create(
            @RequestHeader("X-User-Id") Long ownerId, @RequestParam("file") MultipartFile file) {
        return resumeService.createResume(ownerId, file);
    }

    @GetMapping
    public List<ResumeSummaryResponse> list(@RequestHeader("X-User-Id") Long ownerId) {
        return resumeService.listResumes(ownerId);
    }

    @PatchMapping("/{id}/analysis")
    public ResumeSummaryResponse applyAnalysis(
            @RequestHeader("X-User-Id") Long ownerId, @PathVariable String id,
            @Valid @RequestBody ApplyResumeAnalysisRequest request) {
        return resumeService.applyAnalysis(ownerId, id, request);
    }

    @GetMapping("/{id}/text")
    public ResumeTextResponse getText(@RequestHeader("X-User-Id") Long ownerId, @PathVariable String id) {
        return resumeService.getExtractedText(ownerId, id);
    }

    @DeleteMapping("/{id}")
    public Map<String, Boolean> delete(@RequestHeader("X-User-Id") Long ownerId, @PathVariable String id) {
        resumeService.deleteResume(ownerId, id);
        return Map.of("deleted", true);
    }
}
