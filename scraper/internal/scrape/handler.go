package scrape

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"time"

	"github.com/PuerkitoBio/goquery"

	"jobtracker/scraper/internal/httpx"
)

func Handler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, httpx.MaxBodyBytes))
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	var req request
	if err := json.Unmarshal(body, &req); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	parsed, err := url.Parse(req.URL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		httpx.WriteError(w, http.StatusBadRequest, "url must be http or https")
		return
	}

	// Cap DNS, the fetch, and the Greenhouse fallback to the request lifetime plus a hard ceiling.
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()

	result := fetchAndExtract(ctx, req.URL)

	// Still best-effort: partial data is useful, so the status stays 200 and Reason carries the why.
	httpx.WriteJSON(w, http.StatusOK, result)
}

func fetchAndExtract(ctx context.Context, requestURL string) response {
	result := response{}

	// SSRF guard: skip the fetch for a non-public host (a no-op when blocking is off), treating it like an unreachable one.
	if !isSafeScrapeURL(ctx, requestURL) {
		result.Reason = reasonBlockedHost
		return result
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
	if err != nil {
		result.Reason = reasonRequestFailed
		return result
	}
	httpReq.Header.Set("User-Agent",
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36")

	resp, fetchErr := userFetchClient().Do(httpReq)
	if fetchErr != nil {
		result.Reason = reasonUnreachable
		return result
	}
	defer resp.Body.Close()

	// Go's client doesn't error on non-2xx, so without this a 404 error page gets scraped as if real.
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		result.Reason = reasonHTTPError
		return result
	}

	doc, parseErr := goquery.NewDocumentFromReader(io.LimitReader(resp.Body, httpx.MaxBodyBytes))
	if parseErr != nil {
		result.Reason = reasonUnreadable
		return result
	}

	result.Fetched = true
	extract(ctx, doc, &result, requestURL)
	if result.Raw == "" {
		result.Reason = reasonNoJobData
	}
	return result
}
