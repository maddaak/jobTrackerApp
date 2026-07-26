package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"unicode/utf8"
)

func fixtureServer(t *testing.T, path string) *httptest.Server {
	t.Helper()
	html, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("failed to read fixture %s: %v", path, err)
	}
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.Write(html)
	}))
}

func doScrape(t *testing.T, targetURL string) (int, scrapeResponse) {
	t.Helper()
	body, _ := json.Marshal(scrapeRequest{URL: targetURL})
	req := httptest.NewRequest(http.MethodPost, "/scrape", bytes.NewReader(body))
	w := httptest.NewRecorder()

	scrapeHandler(w, req)

	var resp scrapeResponse
	if w.Code == http.StatusOK {
		if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}
	}
	return w.Code, resp
}

func TestScrapeFromJSONLD(t *testing.T) {
	server := fixtureServer(t, "testdata/jsonld_job.html")
	defer server.Close()

	status, resp := doScrape(t, server.URL)

	if status != http.StatusOK {
		t.Fatalf("expected 200, got %d", status)
	}
	if resp.Company != "Acme Corp" {
		t.Errorf("expected company Acme Corp, got %q", resp.Company)
	}
	if resp.Role != "Senior Backend Engineer" {
		t.Errorf("expected role Senior Backend Engineer, got %q", resp.Role)
	}
	if resp.CompMin == nil || *resp.CompMin != 150000 {
		t.Errorf("expected compMin 150000, got %v", resp.CompMin)
	}
	if resp.CompMax == nil || *resp.CompMax != 190000 {
		t.Errorf("expected compMax 190000, got %v", resp.CompMax)
	}
	if resp.Raw == "" {
		t.Error("expected non-empty raw text")
	}
}

func TestScrapeFromMetaAndTitleFallback(t *testing.T) {
	server := fixtureServer(t, "testdata/meta_fallback.html")
	defer server.Close()

	status, resp := doScrape(t, server.URL)

	if status != http.StatusOK {
		t.Fatalf("expected 200, got %d", status)
	}
	if resp.Company != "Globex" {
		t.Errorf("expected company Globex, got %q", resp.Company)
	}
	if resp.Role != "Staff Product Designer" {
		t.Errorf("expected role Staff Product Designer, got %q", resp.Role)
	}
	if resp.Location != "REMOTE" {
		t.Errorf("expected location REMOTE, got %q", resp.Location)
	}
	if resp.CompMin == nil || *resp.CompMin != 140000 {
		t.Errorf("expected compMin 140000, got %v", resp.CompMin)
	}
	if resp.CompMax == nil || *resp.CompMax != 170000 {
		t.Errorf("expected compMax 170000, got %v", resp.CompMax)
	}
}

func withGreenhouseBoardsAPIBaseURL(t *testing.T, url string) {
	t.Helper()
	original := greenhouseBoardsAPIBaseURL
	greenhouseBoardsAPIBaseURL = url
	t.Cleanup(func() { greenhouseBoardsAPIBaseURL = original })
}

// TestScrapeFromGreenhouseEmbedFallback covers career pages that embed Greenhouse's
// client-side job board widget instead of server-rendering the posting (real example:
// doubleverify.com/careers/job?id=...&board=doubleverify) — the static HTML has no JSON-LD
// and no useful meta/title content, only the embed script and a job id in the URL's query
// string, so the scraper has to call Greenhouse's public jobs API directly.
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

	// No ?id= on the request URL — extractFromGreenhouseEmbed can't resolve a job, so this
	// just confirms the handler still falls back gracefully (200, no panic) rather than
	// getting stuck once an embed script is found but there's nothing to look up.
	status, _ := doScrape(t, server.URL)

	if status != http.StatusOK {
		t.Fatalf("expected 200, got %d", status)
	}
}

// TestScrapeOgTitleRoleOnlyFallsBackToPageTitleForCompany covers a real bug found on
// Greenhouse job pages: og:title is just the role ("Senior Software Engineer") with no
// company, while the <title> tag has "Job Application for X at Company". Company must
// still be picked up from the <title> tag in that case.
func TestScrapeOgTitleRoleOnlyFallsBackToPageTitleForCompany(t *testing.T) {
	server := fixtureServer(t, "testdata/og_title_role_only.html")
	defer server.Close()

	status, resp := doScrape(t, server.URL)

	if status != http.StatusOK {
		t.Fatalf("expected 200, got %d", status)
	}
	if resp.Company != "Gong.io" {
		t.Errorf("expected company Gong.io, got %q", resp.Company)
	}
	if resp.Role != "Senior Software Engineer" {
		t.Errorf("expected role Senior Software Engineer, got %q", resp.Role)
	}
}

func TestScrapeGarbagePageReturnsBlanksNotError(t *testing.T) {
	server := fixtureServer(t, "testdata/garbage.html")
	defer server.Close()

	status, resp := doScrape(t, server.URL)

	if status != http.StatusOK {
		t.Fatalf("expected 200 even for a garbage page, got %d", status)
	}
	if resp.CompMin != nil || resp.CompMax != nil {
		t.Errorf("expected no comp range extracted, got %v-%v", resp.CompMin, resp.CompMax)
	}
	if resp.Location != "" {
		t.Errorf("expected no location classified, got %q", resp.Location)
	}
}

func TestScrapeRejectsNonHTTPURL(t *testing.T) {
	status, _ := doScrape(t, "file:///etc/passwd")

	if status != http.StatusBadRequest {
		t.Fatalf("expected 400 for a non-http(s) url, got %d", status)
	}
}

func TestScrapeUnreachableHostReturnsBlanksNotError(t *testing.T) {
	status, resp := doScrape(t, "http://127.0.0.1:1/does-not-exist")

	if status != http.StatusOK {
		t.Fatalf("expected 200 even when the target is unreachable, got %d", status)
	}
	if resp.Company != "" || resp.Role != "" || resp.Raw != "" {
		t.Errorf("expected all-blank result for an unreachable host, got %+v", resp)
	}
}

// TestScrapeDoesNotAcceptFooterBoilerplateAsJobDescription covers a real case: a JS-rendered
// careers page (client-side widget, no JSON-LD, no known embed) whose static HTML body is
// just nav/footer/legal text — the last-resort whole-body fallback used to accept that as
// "the job description" and hand it to the AI match, which could only ever produce a
// nonsense verdict from boilerplate with no actual role content.
func TestScrapeDoesNotAcceptFooterBoilerplateAsJobDescription(t *testing.T) {
	server := fixtureServer(t, "testdata/js_rendered_no_signal.html")
	defer server.Close()

	status, resp := doScrape(t, server.URL)

	if status != http.StatusOK {
		t.Fatalf("expected 200, got %d", status)
	}
	if resp.Raw != "" {
		t.Errorf("expected blank Raw for boilerplate-only body text, got %q", resp.Raw)
	}
}

// TestScrapeIgnoresNon2xxResponseBody covers a real bug: Go's http client does not treat a
// 404/410/etc. as an error, so without an explicit status check a dead/removed job posting's
// error page got scraped and extracted from as if it were a real posting — silently feeding a
// 404 page's title/meta into the form (and from there into the AI match) instead of surfacing
// a fetch failure the user could react to.
func TestScrapeIgnoresNon2xxResponseBody(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte(`<html><head><title>404 Not Found | Careers</title></head><body>Page not found</body></html>`))
	}))
	defer server.Close()

	status, resp := doScrape(t, server.URL)

	if status != http.StatusOK {
		t.Fatalf("expected 200 (best-effort), got %d", status)
	}
	if resp.Company != "" || resp.Role != "" || resp.Raw != "" {
		t.Errorf("expected an all-blank result for a 404 response, got %+v", resp)
	}
}

func TestExtractCompRange(t *testing.T) {
	cases := []struct {
		name    string
		text    string
		wantMin int
		wantMax int
		wantOk  bool
	}{
		{"dollar-prefixed with k only on the right applies k to both sides", "$100-150k", 100000, 150000, true},
		{"bare digits with k only on the right, no $ at all", "Salary: 100-150k per year", 100000, 150000, true},
		{"full numbers with commas on both sides", "$140,000 - $170,000", 140000, 170000, true},
		{"k suffix on both sides", "$100k-$150k", 100000, 150000, true},
		{"phone number is not a salary", "Call us at 212-555-0182", 0, 0, false},
		{"year range is not a salary", "Founded in 2020-2024", 0, 0, false},
		{"small bare range is not a salary", "1-2 years of experience required", 0, 0, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			min, max, ok := extractCompRange(tc.text)
			if ok != tc.wantOk {
				t.Fatalf("extractCompRange(%q) ok = %v, want %v", tc.text, ok, tc.wantOk)
			}
			if !tc.wantOk {
				return
			}
			if min != tc.wantMin || max != tc.wantMax {
				t.Errorf("extractCompRange(%q) = (%d, %d), want (%d, %d)", tc.text, min, max, tc.wantMin, tc.wantMax)
			}
		})
	}
}

func TestTruncateDoesNotSplitAMultiByteRune(t *testing.T) {
	// "é" is 2 bytes (0xC3 0xA9); a byte-offset cut of 1 would land mid-rune.
	s := "café"
	if got := truncate(s, len(s)-1); strings.Contains(got, "�") || !utf8.ValidString(got) {
		t.Fatalf("truncate(%q, %d) = %q, want a valid UTF-8 string with no split rune", s, len(s)-1, got)
	}
}

func TestRequireInternalTokenRejectsMissingOrWrongToken(t *testing.T) {
	handler := requireInternalToken(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}, "expected-token")

	req := httptest.NewRequest(http.MethodPost, "/scrape", nil)
	w := httptest.NewRecorder()
	handler(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 with no token, got %d", w.Code)
	}

	req2 := httptest.NewRequest(http.MethodPost, "/scrape", nil)
	req2.Header.Set("X-Internal-Token", "wrong-token")
	w2 := httptest.NewRecorder()
	handler(w2, req2)
	if w2.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 with wrong token, got %d", w2.Code)
	}

	req3 := httptest.NewRequest(http.MethodPost, "/scrape", nil)
	req3.Header.Set("X-Internal-Token", "expected-token")
	w3 := httptest.NewRecorder()
	handler(w3, req3)
	if w3.Code != http.StatusOK {
		t.Fatalf("expected 200 with correct token, got %d", w3.Code)
	}
}
