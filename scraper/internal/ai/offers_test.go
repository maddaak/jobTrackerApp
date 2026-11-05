package ai

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const twoOffers = `{"priorities":"remote work","offers":[` +
	`{"id":"1","company":"Acme","role":"Engineer","baseSalary":150000},` +
	`{"id":"2","company":"Globex","role":"Engineer","baseSalary":160000}]}`

func TestCompareOffersHandlerRequiresAnOffer(t *testing.T) {
	w := doPost(t, CompareOffersHandler, `{"priorities":"remote","offers":[]}`)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestCompareOffersHandlerRejectsTooManyOffers(t *testing.T) {
	offers := make([]string, maxOffers+1)
	for i := range offers {
		offers[i] = fmt.Sprintf(`{"id":"%d","company":"Co","role":"Engineer"}`, i)
	}
	w := doPost(t, CompareOffersHandler, `{"offers":[`+strings.Join(offers, ",")+`]}`)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestCompareOffersHandlerReturns503WhenNotConfigured(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "")

	w := doPost(t, CompareOffersHandler, twoOffers)

	if w.Code != http.StatusServiceUnavailable || !strings.Contains(w.Body.String(), "not_configured") {
		t.Fatalf("expected 503 not_configured, got %d: %s", w.Code, w.Body.String())
	}
}

func TestCompareOffersHandlerDropsIdsThatWereNeverSent(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "test-key")
	server := fakeAnthropicServer(t, `{"recommendedOfferId":"9","summary":"Globex pays more.",`+
		`"offers":[{"id":"2","pros":["higher base"],"cons":[],"negotiationPoints":[]},`+
		`{"id":"9","pros":["invented"],"cons":[],"negotiationPoints":[]}]}`)
	withAnthropicBaseURL(t, server.URL)

	w := doPost(t, CompareOffersHandler, twoOffers)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var result compareOffersResult
	if err := json.NewDecoder(w.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if result.RecommendedOfferID != "" {
		t.Fatalf("expected phantom recommendation coerced to empty, got %q", result.RecommendedOfferID)
	}
	if len(result.Offers) != 1 || result.Offers[0].ID != "2" {
		t.Fatalf("expected only the assessment for offer 2, got %+v", result.Offers)
	}
}

func TestCompareOffersHandlerAlwaysReturnsAListAndEachOfferOnce(t *testing.T) {
	cases := map[string]string{
		"missing list": `{"recommendedOfferId":"1","summary":"Take Acme."}`,
		"duplicate id": `{"recommendedOfferId":"1","summary":"Take Acme.","offers":[` +
			`{"id":"1","pros":["a"]},{"id":"1","pros":["b"]}]}`,
	}
	for name, reply := range cases {
		t.Run(name, func(t *testing.T) {
			t.Setenv("ANTHROPIC_API_KEY", "test-key")
			withAnthropicBaseURL(t, fakeAnthropicServer(t, reply).URL)

			w := doPost(t, CompareOffersHandler, twoOffers)

			if w.Code != http.StatusOK {
				t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
			}
			if !strings.Contains(w.Body.String(), `"offers":[`) {
				t.Fatalf("expected offers to be a JSON list, got %s", w.Body.String())
			}
			var result compareOffersResult
			if err := json.NewDecoder(w.Body).Decode(&result); err != nil {
				t.Fatalf("failed to decode response: %v", err)
			}
			if len(result.Offers) > 1 {
				t.Fatalf("expected each offer at most once, got %+v", result.Offers)
			}
		})
	}
}

func TestCompareOffersShortensLongNotesWithoutDroppingLaterOffers(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "test-key")
	var prompt string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Messages []struct{ Content string } `json:"messages"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		prompt = body.Messages[0].Content
		reply, _ := json.Marshal(map[string]any{"content": []map[string]string{
			{"type": "text", "text": `{"recommendedOfferId":"2","summary":"ok","offers":[]}`},
		}})
		_, _ = w.Write(reply)
	}))
	t.Cleanup(server.Close)
	withAnthropicBaseURL(t, server.URL)

	longNotes := strings.Repeat("x", 20000)
	body := `{"offers":[{"id":"1","company":"Acme","role":"Engineer","notes":"` + longNotes + `"},` +
		`{"id":"2","company":"Globex","role":"Engineer"}]}`
	w := doPost(t, CompareOffersHandler, body)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if !strings.Contains(prompt, `"company":"Globex"`) {
		t.Fatal("expected the second offer to reach the prompt after a long first note")
	}
	if strings.Contains(prompt, strings.Repeat("x", maxOfferNotesChars+1)) {
		t.Fatalf("expected the long note shortened to %d chars, prompt was %d chars", maxOfferNotesChars, len(prompt))
	}
}

func TestCompareOffersHandlerRejectsAMissingSummary(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "test-key")
	server := fakeAnthropicServer(t, `{"recommendedOfferId":"1","offers":[]}`)
	withAnthropicBaseURL(t, server.URL)

	w := doPost(t, CompareOffersHandler, twoOffers)

	if w.Code != http.StatusBadGateway {
		t.Fatalf("expected 502 for a missing summary, got %d: %s", w.Code, w.Body.String())
	}
}
