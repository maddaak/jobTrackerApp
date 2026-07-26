package com.jobtracker.core.controller;

import com.jobtracker.core.dto.MetricsResponse;
import com.jobtracker.core.service.MetricsService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/metrics")
public class MetricsController {

    private final MetricsService metricsService;

    public MetricsController(MetricsService metricsService) {
        this.metricsService = metricsService;
    }

    @GetMapping
    public MetricsResponse get(@RequestHeader("X-User-Id") Long ownerId) {
        return metricsService.getMetrics(ownerId);
    }
}
