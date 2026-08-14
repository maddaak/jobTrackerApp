package scrape

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/PuerkitoBio/goquery"
)

func withGreenhouseBoardsAPIBaseURL(t *testing.T, url string) {
	t.Helper()
	original := greenhouseBoardsAPIBaseURL
	greenhouseBoardsAPIBaseURL = url
	t.Cleanup(func() { greenhouseBoardsAPIBaseURL = original })
}

// Career page that only embeds Greenhouse's widget: no JSON-LD, just the embed script and a URL job id, so the scraper must call Greenhouse's API.
func TestScrapeFromGreenhouseEmbedFallback(t *testing.T) {
	pageServer := fixtureServer(t, "testdata/greenhouse_embed.html")
	defer pageServer.Close()

	apiServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/boards/testboard/jobs/12345" {
			t.Errorf("unexpected greenhouse API path: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"title":        "Sr. Software Engineer II",
			"company_name": "TestCo",
			"content":      "&lt;p&gt;This is a hybrid role. Compensation: $107,000 - $212,000.&lt;/p&gt;",
			"location":     map[string]string{"name": "NYC Global HQ"},
		})
	}))
	defer apiServer.Close()
	withGreenhouseBoardsAPIBaseURL(t, apiServer.URL)

	status, resp := doScrape(t, pageServer.URL+"?id=12345")

	if status != http.StatusOK {
		t.Fatalf("expected 200, got %d", status)
	}
	if resp.Role != "Sr. Software Engineer II" {
		t.Errorf("expected role from greenhouse API, got %q", resp.Role)
	}
	if resp.Company != "TestCo" {
		t.Errorf("expected company from greenhouse API, got %q", resp.Company)
	}
	if resp.Location != "NYC_HYBRID" {
		t.Errorf("expected location NYC_HYBRID classified from JD text, got %q", resp.Location)
	}
	if resp.CompMin == nil || *resp.CompMin != 107000 {
		t.Errorf("expected compMin 107000, got %v", resp.CompMin)
	}
	if resp.CompMax == nil || *resp.CompMax != 212000 {
		t.Errorf("expected compMax 212000, got %v", resp.CompMax)
	}
	if !strings.Contains(resp.Raw, "hybrid role") {
		t.Errorf("expected raw JD text decoded from greenhouse content, got %q", resp.Raw)
	}
}

func TestScrapeGreenhouseEmbedWithoutJobIDDoesNotErrorOut(t *testing.T) {
	server := fixtureServer(t, "testdata/greenhouse_embed.html")
	defer server.Close()

	// No ?id=, so the embed can't resolve a job; confirm the handler still falls back gracefully.
	status, _ := doScrape(t, server.URL)

	if status != http.StatusOK {
		t.Fatalf("expected 200, got %d", status)
	}
}

// A non-numeric job id is rejected before any Greenhouse API URL is built.
func TestExtractFromGreenhouseEmbedRejectsNonDigitJobID(t *testing.T) {
	htmlSrc := `<html><head><script src="https://boards.greenhouse.io/embed/job_board/js?for=testboard"></script></head><body></body></html>`
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(htmlSrc))
	if err != nil {
		t.Fatalf("failed to build doc: %v", err)
	}
	result := response{}
	if extractFromGreenhouseEmbed(context.Background(), doc, "http://example.com/careers?id=not-a-number", &result) {
		t.Error("expected false for a non-digit job id")
	}
}
