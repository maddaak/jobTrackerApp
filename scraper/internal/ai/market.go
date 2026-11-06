package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"jobtracker/scraper/internal/textutil"
)

// Searching adds the model's reading of the results to the output, so it needs more room than an estimate.
const marketCheckMaxTokens = 8192

func checkMarket(ctx context.Context, req marketCheckRequest) (marketCheckResult, error) {
	var result marketCheckResult
	offerJSON, err := json.Marshal(req)
	if err != nil {
		return result, fmt.Errorf("marshal offer: %w", err)
	}
	userMessage := "Offer (JSON):\n" + string(offerJSON)

	prompt := marketCheckEstimatePrompt
	if canSearch() {
		prompt = marketCheckSearchPrompt
	}
	raw, sources, searched, err := research(ctx, prompt, userMessage, marketCheckMaxTokens)
	if err != nil {
		return result, err
	}
	if err := decodeObject("market check", raw, &result); err != nil {
		return result, err
	}
	// A verdict the page can't show, or one with nothing behind it, isn't an answer.
	if !validVerdicts[result.Verdict] || strings.TrimSpace(result.Summary) == "" {
		log.Printf("market check: answer had verdict %q; raw response: %s", result.Verdict, textutil.Truncate(raw, 2000))
		return result, errBadResponse
	}
	if result.NegotiationPoints == nil {
		result.NegotiationPoints = []string{}
	}
	result.Searched = searched
	result.Sources = sources
	if result.Sources == nil {
		result.Sources = []source{}
	}
	return result, nil
}

func canSearch() bool {
	p, err := configuredProvider()
	return err == nil && p.spec.protocol.search != nil
}
