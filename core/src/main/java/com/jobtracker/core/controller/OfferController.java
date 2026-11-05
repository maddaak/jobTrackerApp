package com.jobtracker.core.controller;

import com.jobtracker.core.dto.MarketCheckRequest;
import com.jobtracker.core.dto.OfferRequest;
import com.jobtracker.core.dto.OfferResponse;
import com.jobtracker.core.service.OfferService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import java.util.List;

@RestController
public class OfferController {

    private final OfferService offerService;

    public OfferController(OfferService offerService) {
        this.offerService = offerService;
    }

    @GetMapping("/offers")
    public List<OfferResponse> list(@RequestHeader("X-User-Id") Long ownerId) {
        return offerService.listOffers(ownerId);
    }

    @PutMapping("/jobs/{id}/offer")
    public OfferResponse save(
            @RequestHeader("X-User-Id") Long ownerId, @PathVariable Long id,
            @Valid @RequestBody OfferRequest request) {
        return offerService.saveOffer(ownerId, id, request);
    }

    @PutMapping("/jobs/{id}/offer/market-check")
    public OfferResponse saveMarketCheck(
            @RequestHeader("X-User-Id") Long ownerId, @PathVariable Long id,
            @Valid @RequestBody MarketCheckRequest request) {
        return offerService.saveMarketCheck(ownerId, id, request);
    }

    @DeleteMapping("/jobs/{id}/offer/market-check")
    public OfferResponse clearMarketCheck(@RequestHeader("X-User-Id") Long ownerId, @PathVariable Long id) {
        return offerService.clearMarketCheck(ownerId, id);
    }
}
