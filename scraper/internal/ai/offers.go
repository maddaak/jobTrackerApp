package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"jobtracker/scraper/internal/textutil"
)

// Per offer, so a long note shortens itself rather than cutting the JSON mid-structure and dropping later offers.
const maxOfferNotesChars = 1500

func compareOffers(ctx context.Context, req compareOffersRequest) (compareOffersResult, error) {
	var result compareOffersResult

	offers := make([]offerDetails, len(req.Offers))
	for i, offer := range req.Offers {
		offer.Notes = textutil.Truncate(offer.Notes, maxOfferNotesChars)
		offers[i] = offer
	}
	offersJSON, err := json.Marshal(offers)
	if err != nil {
		return result, fmt.Errorf("marshal offers: %w", err)
	}
	priorities := strings.TrimSpace(req.Priorities)
	if priorities == "" {
		priorities = "(none given; weigh total compensation and growth)"
	}
	userMessage := fmt.Sprintf("Candidate priorities:\n%s\n\nOffers (JSON):\n%s",
		textutil.Truncate(priorities, maxPromptChars), string(offersJSON))

	// Per-offer lists for up to maxOffers offers need more room than the single-verdict calls.
	raw, err := ask(ctx, "offer comparison", compareOffersSystemPrompt, userMessage, 8192, &result)
	if err != nil {
		return result, err
	}
	if strings.TrimSpace(result.Summary) == "" {
		log.Printf("offer comparison: answer had no summary; raw response: %s", textutil.Truncate(raw, 2000))
		return result, errBadResponse
	}

	// Only ids we sent, each once, and always a list: callers render one assessment per offer.
	sent := make(map[string]bool, len(req.Offers))
	for _, offer := range req.Offers {
		sent[offer.ID] = true
	}
	if !sent[result.RecommendedOfferID] {
		result.RecommendedOfferID = ""
	}
	known := []offerAssessment{}
	for _, assessment := range result.Offers {
		if sent[assessment.ID] {
			known = append(known, assessment)
			delete(sent, assessment.ID)
		}
	}
	result.Offers = known
	return result, nil
}
