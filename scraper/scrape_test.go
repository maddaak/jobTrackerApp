package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/PuerkitoBio/goquery"
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
	// Fixtures fetch 127.0.0.1, so disable the SSRF guard for the test.
	original := blockInternalHosts
	blockInternalHosts = false
	t.Cleanup(func() { blockInternalHosts = original })

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

// Structured JSON-LD gives a city location while the workplace model ("hybrid") lives only in the description.
func TestScrapeHybridFromDescriptionWithStructuredLocation(t *testing.T) {
	server := fixtureServer(t, "testdata/jsonld_hybrid.html")
	defer server.Close()

	status, resp := doScrape(t, server.URL)

	if status != http.StatusOK {
		t.Fatalf("expected 200, got %d", status)
	}
	if resp.Location != "NYC_HYBRID" {
		t.Errorf("expected NYC_HYBRID classified from description, got %q", resp.Location)
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

// og:title is role-only while <title> has "... at Company"; company must still come from <title>.
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

// SSRF guard rejects literal private/metadata IPs; no doScrape so blocking stays on, fetch skipped, 200 blank.
func TestScrapeBlocksInternalAddresses(t *testing.T) {
	for _, target := range []string{
		"http://169.254.169.254/latest/meta-data/",
		"http://10.0.0.1/internal",
	} {
		body, _ := json.Marshal(scrapeRequest{URL: target})
		req := httptest.NewRequest(http.MethodPost, "/scrape", bytes.NewReader(body))
		w := httptest.NewRecorder()

		scrapeHandler(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("%s: expected 200, got %d", target, w.Code)
		}
		var resp scrapeResponse
		if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
			t.Fatalf("%s: failed to decode response: %v", target, err)
		}
		if resp.Company != "" || resp.Role != "" || resp.Raw != "" {
			t.Errorf("%s: expected all-blank result for a blocked host, got %+v", target, resp)
		}
		if resp.Fetched || resp.Reason != reasonBlockedHost {
			t.Errorf("%s: expected fetched=false reason=%s, got fetched=%v reason=%q",
				target, reasonBlockedHost, resp.Fetched, resp.Reason)
		}
	}
}

// An oversized request body is rejected with 400 by the MaxBytesReader cap, not read into memory.
func TestScrapeRejectsOversizedRequestBody(t *testing.T) {
	huge := bytes.Repeat([]byte("a"), maxBodyBytes+1)
	req := httptest.NewRequest(http.MethodPost, "/scrape", bytes.NewReader(huge))
	w := httptest.NewRecorder()

	scrapeHandler(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for an oversized request body, got %d", w.Code)
	}
}

// A non-numeric job id is rejected before any Greenhouse API URL is built.
func TestExtractFromGreenhouseEmbedRejectsNonDigitJobID(t *testing.T) {
	htmlSrc := `<html><head><script src="https://boards.greenhouse.io/embed/job_board/js?for=testboard"></script></head><body></body></html>`
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(htmlSrc))
	if err != nil {
		t.Fatalf("failed to build doc: %v", err)
	}
	result := scrapeResponse{}
	if extractFromGreenhouseEmbed(context.Background(), doc, "http://example.com/careers?id=not-a-number", &result) {
		t.Error("expected false for a non-digit job id")
	}
}

// Pins the extra CGNAT/reserved/documentation ranges that must never be dialed.
func TestIsPublicIPRejectsReservedRanges(t *testing.T) {
	blocked := []string{
		"100.64.0.1", // CGNAT
		"100.127.255.1",
		"240.0.0.1",  // reserved
		"192.0.2.5",  // TEST-NET-1
		"198.18.0.1", // benchmarking
		"198.19.255.1",
		"0.1.2.3", // "this network"
	}
	for _, s := range blocked {
		if isPublicIP(net.ParseIP(s)) {
			t.Errorf("expected %s to be rejected as non-public", s)
		}
	}
	for _, s := range []string{"8.8.8.8", "1.1.1.1", "93.184.216.34"} {
		if !isPublicIP(net.ParseIP(s)) {
			t.Errorf("expected %s to be accepted as public", s)
		}
	}
}

// JS-rendered careers page with only nav/footer text: the whole-body fallback must not accept it as a JD.
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

// Go's client doesn't error on 404/410, so without a status check a dead posting's error page got scraped as real.
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

// F65: the Greenhouse path used to park the whole JD in a location-typed field and rely on a later
// pass to normalize it. It classifies in place now, so classifyLocation must accept its own output.
func TestClassifyLocationIsIdempotent(t *testing.T) {
	for _, value := range []string{"REMOTE", "NYC_HYBRID", "NYC_IN_PERSON"} {
		if got := classifyLocation(value); got != value {
			t.Fatalf("classifyLocation(%q) = %q, want %q", value, got, value)
		}
	}
}

// F57: every failure mode used to be one blank 200, so the client inferred "fetch failed" purely
// from an empty Raw and couldn't tell a dead link from a page with no job data.
func TestScrapeReportsWhyItFoundNothing(t *testing.T) {
	notFound := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "nope", http.StatusNotFound)
	}))
	defer notFound.Close()

	code, resp := doScrape(t, notFound.URL)
	if code != http.StatusOK {
		t.Fatalf("expected 200, got %d", code)
	}
	if resp.Fetched || resp.Reason != reasonHTTPError {
		t.Fatalf("expected fetched=false reason=%s, got fetched=%v reason=%q", reasonHTTPError, resp.Fetched, resp.Reason)
	}

	// A page that loads fine but carries no job content is a different outcome from a dead link.
	empty := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.Write([]byte("<html><body><nav>Home About Contact</nav></body></html>"))
	}))
	defer empty.Close()

	code, resp = doScrape(t, empty.URL)
	if code != http.StatusOK {
		t.Fatalf("expected 200, got %d", code)
	}
	if !resp.Fetched || resp.Reason != reasonNoJobData {
		t.Fatalf("expected fetched=true reason=%s, got fetched=%v reason=%q", reasonNoJobData, resp.Fetched, resp.Reason)
	}

	// An unreachable host is distinguishable too.
	code, resp = doScrape(t, "http://127.0.0.1:1/gone")
	if code != http.StatusOK {
		t.Fatalf("expected 200, got %d", code)
	}
	if resp.Fetched || resp.Reason != reasonUnreachable {
		t.Fatalf("expected fetched=false reason=%s, got fetched=%v reason=%q", reasonUnreachable, resp.Fetched, resp.Reason)
	}
}

// A successful scrape must not carry a reason, or the client will treat it as a failure.
func TestScrapeSuccessHasNoReason(t *testing.T) {
	const page = `<html><head><title>Backend Engineer at Acme</title></head>
		<body><h1>Backend Engineer</h1><p>Responsibilities: build APIs. Requirements: Go experience. Remote.</p></body></html>`
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.Write([]byte(page))
	}))
	defer server.Close()

	code, resp := doScrape(t, server.URL)
	if code != http.StatusOK {
		t.Fatalf("expected 200, got %d", code)
	}
	if !resp.Fetched || resp.Reason != "" {
		t.Fatalf("expected fetched=true with no reason, got fetched=%v reason=%q", resp.Fetched, resp.Reason)
	}
}
