package scrape

import (
	"context"
	"strings"

	"github.com/PuerkitoBio/goquery"

	"jobtracker/scraper/internal/textutil"
)

const rawTextLimit = 8000

// extract runs the strategies in reliability order, then fills whatever they missed from body text.
func extract(ctx context.Context, doc *goquery.Document, result *response, requestURL string) {
	if extractFromJSONLD(doc, result) {
		// JSON-LD filled structured fields; the fallbacks below still fill anything it missed.
	} else if !extractFromGreenhouseEmbed(ctx, doc, requestURL, result) {
		extractFromMetaAndTitle(doc, result)
	}

	// Skip the full DOM walk unless a text fallback actually needs it.
	var bodyText string
	if result.Raw == "" || (result.CompMin == nil && result.CompMax == nil) || result.Location == "" {
		bodyText = strings.TrimSpace(doc.Find("body").Text())
	}
	if result.Raw == "" && looksLikeJobContent(bodyText) {
		result.Raw = textutil.Truncate(collapseWhitespace(bodyText), rawTextLimit)
	}
	if result.CompMin == nil && result.CompMax == nil {
		if min, max, ok := extractCompRange(bodyText); ok {
			result.CompMin = &min
			result.CompMax = &max
		}
	}
	// Remote/hybrid/onsite is stated in the description, not the structured location field, so scan the text first.
	if model := classifyLocation(result.Raw + " " + bodyText); model != "" {
		result.Location = model
	} else if result.Location != "" {
		result.Location = classifyLocation(result.Location)
	}
}

// jobContentSignalWords gate the whole-body fallback so nav/footer boilerplate isn't accepted as a JD.
var jobContentSignalWords = []string{
	"responsibilit", "requirement", "qualification", "experience",
	"skill", "role", "position", "you will", "we are looking",
}

func looksLikeJobContent(text string) bool {
	lower := strings.ToLower(text)
	for _, word := range jobContentSignalWords {
		if strings.Contains(lower, word) {
			return true
		}
	}
	return false
}
