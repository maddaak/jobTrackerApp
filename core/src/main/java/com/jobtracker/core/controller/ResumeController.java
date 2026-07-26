package com.jobtracker.core.controller;

import com.jobtracker.core.dto.ApplyResumeAnalysisRequest;
import com.jobtracker.core.dto.CreateResumeResponse;
import com.jobtracker.core.dto.ResumeSummaryResponse;
import com.jobtracker.core.service.ResumeService;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.UncheckedIOException;
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
        try {
            return resumeService.createResume(
                    ownerId, file.getOriginalFilename(), file.getContentType(), file.getBytes());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @GetMapping
    public List<ResumeSummaryResponse> list(@RequestHeader("X-User-Id") Long ownerId) {
        return resumeService.listResumes(ownerId);
    }

    @PatchMapping("/{id}/analysis")
    public ResumeSummaryResponse applyAnalysis(
            @RequestHeader("X-User-Id") Long ownerId, @PathVariable String id,
            @RequestBody ApplyResumeAnalysisRequest request) {
        return resumeService.applyAnalysis(ownerId, id, request);
    }

    @DeleteMapping("/{id}")
    public Map<String, Boolean> delete(@RequestHeader("X-User-Id") Long ownerId, @PathVariable String id) {
        resumeService.deleteResume(ownerId, id);
        return Map.of("deleted", true);
    }
}
