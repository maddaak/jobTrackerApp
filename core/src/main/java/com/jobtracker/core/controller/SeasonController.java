package com.jobtracker.core.controller;

import com.jobtracker.core.dto.ActiveSeasonRequest;
import com.jobtracker.core.dto.SeasonRequest;
import com.jobtracker.core.dto.SeasonResponse;
import com.jobtracker.core.service.SeasonService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/seasons")
public class SeasonController {

    private final SeasonService seasons;

    public SeasonController(SeasonService seasons) {
        this.seasons = seasons;
    }

    @GetMapping
    public List<SeasonResponse> list(@RequestHeader("X-User-Id") Long ownerId) {
        return seasons.list(ownerId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public SeasonResponse create(@RequestHeader("X-User-Id") Long ownerId, @Valid @RequestBody SeasonRequest request) {
        return seasons.create(ownerId, request.name());
    }

    @PatchMapping("/{id}")
    public SeasonResponse rename(@RequestHeader("X-User-Id") Long ownerId, @PathVariable Long id,
            @Valid @RequestBody SeasonRequest request) {
        return seasons.rename(ownerId, id, request.name());
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@RequestHeader("X-User-Id") Long ownerId, @PathVariable Long id) {
        seasons.delete(ownerId, id);
    }

    @PutMapping("/{id}/jobs/{jobId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void moveJob(@RequestHeader("X-User-Id") Long ownerId, @PathVariable Long id, @PathVariable Long jobId) {
        seasons.moveJob(ownerId, jobId, id);
    }

    @PutMapping("/active")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void view(@RequestHeader("X-User-Id") Long ownerId, @RequestBody ActiveSeasonRequest request) {
        seasons.view(ownerId, request.seasonId());
    }
}
