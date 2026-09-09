package com.jobtracker.core.controller;

import com.jobtracker.core.dto.JobImageResponse;
import com.jobtracker.core.model.JobImage;
import com.jobtracker.core.service.JobImageService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/jobs/{jobId}/images")
public class JobImageController {

    private final JobImageService jobImageService;

    public JobImageController(JobImageService jobImageService) {
        this.jobImageService = jobImageService;
    }

    @GetMapping
    public List<JobImageResponse> list(@RequestHeader("X-User-Id") Long ownerId, @PathVariable Long jobId) {
        return jobImageService.list(ownerId, jobId);
    }

    @PostMapping
    public JobImageResponse upload(
            @RequestHeader("X-User-Id") Long ownerId, @PathVariable Long jobId,
            @RequestParam("file") MultipartFile file) {
        try {
            return jobImageService.upload(ownerId, jobId, file.getOriginalFilename(), file.getBytes());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    // Inline is safe only because the type comes from the bytes and SVG is refused.
    @GetMapping("/{imageId}")
    public ResponseEntity<byte[]> download(
            @RequestHeader("X-User-Id") Long ownerId, @PathVariable Long jobId, @PathVariable String imageId) {
        JobImage image = jobImageService.download(ownerId, jobId, imageId);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_TYPE, image.getContentType())
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + image.getFileName() + "\"")
                .header("X-Content-Type-Options", "nosniff")
                .body(image.getData());
    }

    @DeleteMapping("/{imageId}")
    public Map<String, Boolean> delete(
            @RequestHeader("X-User-Id") Long ownerId, @PathVariable Long jobId, @PathVariable String imageId) {
        jobImageService.delete(ownerId, jobId, imageId);
        return Map.of("deleted", true);
    }
}
