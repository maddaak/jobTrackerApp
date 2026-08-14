package scrape

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"jobtracker/scraper/internal/httpx"
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

func doScrape(t *testing.T, targetURL string) (int, response) {
	t.Helper()
	// Fixtures fetch 127.0.0.1, so disable the SSRF guard for the test.
	original := blockInternalHosts
	blockInternalHosts = false
	t.Cleanup(func() { blockInternalHosts = original })

	body, _ := json.Marshal(request{URL: targetURL})
	req := httptest.NewRequest(http.MethodPost, "/scrape", bytes.NewReader(body))
	w := httptest.NewRecorder()

	Handler(w, req)

	var resp response
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
		body, _ := json.Marshal(request{URL: target})
		req := httptest.NewRequest(http.MethodPost, "/scrape", bytes.NewReader(body))
		w := httptest.NewRecorder()

		Handler(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("%s: expected 200, got %d", target, w.Code)
		}
		var resp response
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
	huge := bytes.Repeat([]byte("a"), httpx.MaxBodyBytes+1)
	req := httptest.NewRequest(http.MethodPost, "/scrape", bytes.NewReader(huge))
	w := httptest.NewRecorder()

	Handler(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for an oversized request body, got %d", w.Code)
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
