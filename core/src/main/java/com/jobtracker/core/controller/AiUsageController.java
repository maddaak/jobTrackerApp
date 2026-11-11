package com.jobtracker.core.controller;

import com.jobtracker.core.service.AiUsageService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

// The limit is the bff's setting, since it's the one making AI calls; keeping count is core's job.
@RestController
public class AiUsageController {

    private final AiUsageService usage;

    public AiUsageController(AiUsageService usage) {
        this.usage = usage;
    }

    @PostMapping("/ai-usage")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void use(@RequestParam int limit) {
        usage.use(limit);
    }
}
