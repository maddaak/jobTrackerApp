package com.jobtracker.core.controller;

import com.jobtracker.core.dto.AiResultRequest;
import com.jobtracker.core.model.AiResult;
import com.jobtracker.core.service.AiResultService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

// Job and round results are read with the job's detail and its rounds; only account-wide ones have a GET.
@RestController
public class AiResultController {

    private final AiResultService aiResults;

    public AiResultController(AiResultService aiResults) {
        this.aiResults = aiResults;
    }

    @PutMapping("/jobs/{id}/ai/{kind}")
    public AiResult saveForJob(@RequestHeader("X-User-Id") Long ownerId, @PathVariable Long id,
            @PathVariable String kind, @RequestParam(required = false) String interviewType,
            @Valid @RequestBody AiResultRequest request) {
        return aiResults.saveForJob(ownerId, id, kind, interviewType, request.content());
    }

    @DeleteMapping("/jobs/{id}/ai/{kind}")
    public ResponseEntity<Void> clearForJob(@RequestHeader("X-User-Id") Long ownerId, @PathVariable Long id,
            @PathVariable String kind, @RequestParam(required = false) String interviewType) {
        aiResults.clearForJob(ownerId, id, kind, interviewType);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/interviews/{roundId}/ai/{kind}")
    public AiResult saveForRound(@RequestHeader("X-User-Id") Long ownerId, @PathVariable String roundId,
            @PathVariable String kind, @Valid @RequestBody AiResultRequest request) {
        return aiResults.saveForRound(ownerId, roundId, kind, request.content());
    }

    @DeleteMapping("/interviews/{roundId}/ai/{kind}")
    public ResponseEntity<Void> clearForRound(@RequestHeader("X-User-Id") Long ownerId,
            @PathVariable String roundId, @PathVariable String kind) {
        aiResults.clearForRound(ownerId, roundId, kind);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/ai/{kind}")
    public AiResult getForAccount(@RequestHeader("X-User-Id") Long ownerId, @PathVariable String kind,
            @RequestParam(required = false) String company) {
        return aiResults.getForAccount(ownerId, kind, company);
    }

    @PutMapping("/ai/{kind}")
    public AiResult saveForAccount(@RequestHeader("X-User-Id") Long ownerId, @PathVariable String kind,
            @RequestParam(required = false) String company, @RequestParam(required = false) String season,
            @Valid @RequestBody AiResultRequest request) {
        return aiResults.saveForAccount(ownerId, kind, company, season, request.content());
    }

    @DeleteMapping("/ai/{kind}")
    public ResponseEntity<Void> clearForAccount(@RequestHeader("X-User-Id") Long ownerId, @PathVariable String kind,
            @RequestParam(required = false) String company) {
        aiResults.clearForAccount(ownerId, kind, company);
        return ResponseEntity.noContent().build();
    }
}
