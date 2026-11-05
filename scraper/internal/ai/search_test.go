package ai

import (
	"encoding/json"
	"strings"
	"testing"
)

// Core refuses a saved source past its limits, so one long page title would cost the whole answer.
func TestASourceFitsWhatCoreKeeps(t *testing.T) {
	block, _ := json.Marshal(map[string]any{
		"type": "text",
		"text": "Pay is typical.",
		"citations": []map[string]string{
			{"type": "web_search_result_location", "url": "https://example.com/pay", "title": strings.Repeat("t", 1000)},
			{"type": "web_search_result_location", "url": "https://example.com/" + strings.Repeat("u", 3000), "title": "Too long a link"},
		},
	})

	_, sources := textAndSources([]json.RawMessage{block})

	if len(sources) != 1 || len(sources[0].Title) != 255 || sources[0].URL != "https://example.com/pay" {
		t.Errorf("expected one source with a 255-character title, got %+v", sources)
	}
}
