package com.jobtracker.core.controller;

import com.jobtracker.core.dto.AccountResponse;
import com.jobtracker.core.dto.AuthResponse;
import com.jobtracker.core.dto.ChangePasswordRequest;
import com.jobtracker.core.dto.UpdateAccountRequest;
import com.jobtracker.core.service.AccountService;
import com.jobtracker.core.service.BackupService;
import com.jobtracker.core.service.SampleDataService;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import java.time.Clock;
import java.time.LocalDate;
import java.util.Map;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/account")
public class AccountController {

    private final AccountService accounts;
    private final BackupService backups;
    private final SampleDataService samples;
    private final Clock clock;

    public AccountController(AccountService accounts, BackupService backups, SampleDataService samples, Clock clock) {
        this.accounts = accounts;
        this.backups = backups;
        this.samples = samples;
        this.clock = clock;
    }

    @GetMapping("/export")
    public ResponseEntity<byte[]> export(@RequestHeader("X-User-Id") Long userId) {
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"job-tracker-backup-" + LocalDate.now(clock) +".json\"")
                .body(backups.export(userId));
    }

    // The raw file, not a parsed body: the backup's own reader decides what it means.
    @PostMapping(path = "/restore", consumes = MediaType.APPLICATION_JSON_VALUE)
    public BackupService.RestoreResult restore(@RequestHeader("X-User-Id") Long userId, @RequestBody byte[] file) {
        return backups.restore(userId, file);
    }

    @GetMapping("/sample")
    public Map<String, Object> sampleJobs(@RequestHeader("X-User-Id") Long userId) {
        return Map.of("jobs", samples.countInView(userId), "canLoad", samples.canLoad(userId));
    }

    @PostMapping("/sample")
    public Map<String, Integer> loadSample(@RequestHeader("X-User-Id") Long userId) {
        return Map.of("jobs", samples.load(userId));
    }

    @DeleteMapping("/sample")
    public Map<String, Integer> removeSample(@RequestHeader("X-User-Id") Long userId) {
        return Map.of("removed", samples.remove(userId));
    }

    @GetMapping
    public AccountResponse get(@RequestHeader("X-User-Id") Long userId) {
        return accounts.get(userId);
    }

    @PutMapping
    public AccountResponse update(@RequestHeader("X-User-Id") Long userId, @Valid @RequestBody UpdateAccountRequest request) {
        return accounts.update(userId, request);
    }

    @PutMapping("/password")
    public AuthResponse changePassword(@RequestHeader("X-User-Id") Long userId, @Valid @RequestBody ChangePasswordRequest request) {
        return accounts.changePassword(userId, request);
    }

    // Answers only when the session is current: SessionVersionFilter refuses one signed out before it gets
    // here. For bff routes that otherwise never ask core, such as fetching a posting.
    @GetMapping("/session")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void session() {
    }

    @PostMapping("/sessions/end-others")
    public AuthResponse endOtherSessions(@RequestHeader("X-User-Id") Long userId) {
        return accounts.endOtherSessions(userId);
    }
}
