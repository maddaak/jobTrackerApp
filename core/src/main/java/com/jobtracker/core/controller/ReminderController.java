package com.jobtracker.core.controller;

import com.jobtracker.core.dto.FollowUpResponse;
import com.jobtracker.core.dto.ReminderSettingsRequest;
import com.jobtracker.core.dto.ReminderSettingsResponse;
import com.jobtracker.core.service.ReminderService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/reminders")
public class ReminderController {

    private final ReminderService reminders;

    public ReminderController(ReminderService reminders) {
        this.reminders = reminders;
    }

    @GetMapping("/settings")
    public ReminderSettingsResponse settings(@RequestHeader("X-User-Id") Long ownerId) {
        return reminders.getSettings(ownerId);
    }

    @PutMapping("/settings")
    public ReminderSettingsResponse save(
            @RequestHeader("X-User-Id") Long ownerId, @Valid @RequestBody ReminderSettingsRequest request) {
        return reminders.saveSettings(ownerId, request);
    }

    @GetMapping("/follow-ups")
    public List<FollowUpResponse> followUps(@RequestHeader("X-User-Id") Long ownerId) {
        return reminders.followUpsDue(ownerId);
    }

    @PostMapping("/test")
    public ResponseEntity<Map<String, Boolean>> test(@RequestHeader("X-User-Id") Long ownerId) {
        reminders.sendTest(ownerId);
        return ResponseEntity.ok(Map.of("sent", true));
    }
}
