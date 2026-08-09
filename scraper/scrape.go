package main

import (
	"context"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/PuerkitoBio/goquery"
)

type scrapeRequest struct {
	URL string `json:"url"`
}

type scrapeResponse struct {
	Company  string `json:"company"`
	Role     string `json:"role"`
	Location string `json:"location"`
	CompMin  *int   `json:"compMin"`
	CompMax  *int   `json:"compMax"`
	Raw      string `json:"raw"`
	// Lets the caller tell a blocked host from a dead link from a page with no job data.
	Fetched bool   `json:"fetched"`
	Reason  string `json:"reason,omitempty"`
}

// Reasons a scrape produced nothing; the client maps these to a specific message.
const (
	reasonBlockedHost   = "blocked_host"
	reasonRequestFailed = "request_failed"
	reasonUnreachable   = "unreachable"
	reasonHTTPError     = "http_error"
	reasonUnreadable    = "unreadable"
	reasonNoJobData     = "no_job_data"
)

var httpClient = &http.Client{Timeout: 8 * time.Second}

// maxBodyBytes caps request and fetched-page bodies so a huge payload can't exhaust memory.
const maxBodyBytes = 5 << 20 // 5MB

// SSRF guard on the user URL; a package var so tests can disable it for 127.0.0.1 fixtures.
var blockInternalHosts = true

// blockedIPNets are must-never-dial ranges Go's net.IP predicates miss: CGNAT, reserved, docs/test, 0.0.0.0/8.
var blockedIPNets = func() []*net.IPNet {
	nets := make([]*net.IPNet, 0, 5)
	for _, cidr := range []string{
		"100.64.0.0/10", // CGNAT (RFC 6598)
		"240.0.0.0/4",   // reserved / future use
		"192.0.2.0/24",  // TEST-NET-1 documentation
		"198.18.0.0/15", // benchmarking
		"0.0.0.0/8",     // "this network"
	} {
		_, n, err := net.ParseCIDR(cidr)
		if err != nil {
			panic(fmt.Sprintf("invalid blocked CIDR %q: %v", cidr, err))
		}
		nets = append(nets, n)
	}
	return nets
}()

// isPublicIP reports whether ip is a routable public address safe to dial.
func isPublicIP(ip net.IP) bool {
	if ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsMulticast() || ip.IsUnspecified() || ip.IsPrivate() {
		return false
	}
	for _, blocked := range blockedIPNets {
		if blocked.Contains(ip) {
			return false
		}
	}
	return true
}

// isSafeScrapeURL rejects a URL whose host (IP literal, or any resolved IP) isn't public, for SSRF.
func isSafeScrapeURL(ctx context.Context, rawURL string) bool {
	if !blockInternalHosts {
		return true
	}
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return false
	}
	host := parsed.Hostname()
	if host == "" {
		return false
	}
	if ip := net.ParseIP(host); ip != nil {
		return isPublicIP(ip)
	}
	ips, err := net.DefaultResolver.LookupIP(ctx, "ip", host)
	if err != nil || len(ips) == 0 {
		return false
	}
	for _, ip := range ips {
		if !isPublicIP(ip) {
			return false
		}
	}
	return true
}

var safeDialer = &net.Dialer{Timeout: 5 * time.Second}

// Dial only vetted public IPs so DNS rebinding can't slip a private IP past the pre-check.
func safeDialContext(ctx context.Context, network, addr string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return nil, err
	}
	if ip := net.ParseIP(host); ip != nil {
		if !isPublicIP(ip) {
			return nil, fmt.Errorf("refusing to dial unsafe address %s", host)
		}
		return safeDialer.DialContext(ctx, network, addr)
	}
	ips, err := net.DefaultResolver.LookupIP(ctx, "ip", host)
	if err != nil {
		return nil, err
	}
	// Try each public record so a multi-homed host still connects if the first is down.
	var lastErr error
	for _, ip := range ips {
		if !isPublicIP(ip) {
			continue
		}
		conn, err := safeDialer.DialContext(ctx, network, net.JoinHostPort(ip.String(), port))
		if err != nil {
			lastErr = err
			continue
		}
		return conn, nil
	}
	if lastErr != nil {
		return nil, lastErr
	}
	return nil, fmt.Errorf("no safe public address for host %q", host)
}

// safeFetchClient pins every dial and re-checks every redirect target so neither rebinding nor a redirect reaches an internal host.
var safeFetchClient = &http.Client{
	Timeout:   8 * time.Second,
	Transport: &http.Transport{DialContext: safeDialContext},
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 10 {
			return fmt.Errorf("stopped after 10 redirects")
		}
		if !isSafeScrapeURL(req.Context(), req.URL.String()) {
			return fmt.Errorf("redirect to unsafe host blocked")
		}
		return nil
	},
}

// userFetchClient returns the SSRF-pinned client when blocking is on, else the plain shared client.
func userFetchClient() *http.Client {
	if !blockInternalHosts {
		return httpClient
	}
	return safeFetchClient
}

var compRegex = regexp.MustCompile(`(\$)?\s?([\d,]+)([kK])?\s*(?:-|–|to)\s*(\$)?\s?([\d,]+)([kK])?`)

const rawTextLimit = 8000

// greenhouseEmbedForPattern pulls the board token from a Greenhouse embed script src (?for=...).
var greenhouseEmbedForPattern = regexp.MustCompile(`[?&]for=([a-zA-Z0-9_-]+)`)

// greenhouseJobIDPattern constrains the job id pulled from the page URL to digits only.
var greenhouseJobIDPattern = regexp.MustCompile(`^\d+$`)

// greenhouseBoardsAPIBaseURL is a package var so tests can point it at a local server.
var greenhouseBoardsAPIBaseURL = "https://boards-api.greenhouse.io"

type greenhouseJobResponse struct {
	Title       string `json:"title"`
	CompanyName string `json:"company_name"`
	Content     string `json:"content"`
	Location    struct {
		Name string `json:"name"`
	} `json:"location"`
}

func scrapeHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	var req scrapeRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	parsed, err := url.Parse(req.URL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		writeError(w, http.StatusBadRequest, "url must be http or https")
		return
	}

	result := scrapeResponse{}

	// Cap DNS, the fetch, and the Greenhouse fallback to the request lifetime plus a hard ceiling.
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()

	// SSRF guard: skip the fetch for a non-public host (a no-op when blocking is off), treating it like an unreachable one.
	if !isSafeScrapeURL(ctx, req.URL) {
		result.Reason = reasonBlockedHost
	} else if httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, req.URL, nil); err != nil {
		result.Reason = reasonRequestFailed
	} else {
		httpReq.Header.Set("User-Agent",
			"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36")
		resp, fetchErr := userFetchClient().Do(httpReq)
		switch {
		case fetchErr != nil:
			result.Reason = reasonUnreachable
		// Go's client doesn't error on non-2xx, so without this a 404 error page gets scraped as if real.
		case resp.StatusCode < 200 || resp.StatusCode >= 300:
			resp.Body.Close()
			result.Reason = reasonHTTPError
		default:
			defer resp.Body.Close()
			limited := io.LimitReader(resp.Body, maxBodyBytes)
			doc, parseErr := goquery.NewDocumentFromReader(limited)
			if parseErr != nil {
				result.Reason = reasonUnreadable
			} else {
				result.Fetched = true
				extract(ctx, doc, &result, req.URL)
				if result.Raw == "" {
					result.Reason = reasonNoJobData
				}
			}
		}
	}
	// Still best-effort: partial data is useful, so the status stays 200 and Reason carries the why.
	writeJSON(w, http.StatusOK, result)
}

func extract(ctx context.Context, doc *goquery.Document, result *scrapeResponse, requestURL string) {
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
		result.Raw = truncate(collapseWhitespace(bodyText), rawTextLimit)
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

// extractFromJSONLD reads a schema.org JobPosting from ld+json, far more reliable than visible text.
func extractFromJSONLD(doc *goquery.Document, result *scrapeResponse) bool {
	found := false
	doc.Find(`script[type="application/ld+json"]`).EachWithBreak(func(_ int, s *goquery.Selection) bool {
		var raw interface{}
		if err := json.Unmarshal([]byte(s.Text()), &raw); err != nil {
			return true
		}
		posting := findJobPosting(raw)
		if posting == nil {
			return true
		}
		applyJobPosting(posting, result)
		found = true
		return false
	})
	return found
}

func findJobPosting(node interface{}) map[string]interface{} {
	switch v := node.(type) {
	case map[string]interface{}:
		if typeIs(v["@type"], "JobPosting") {
			return v
		}
		if graph, ok := v["@graph"].([]interface{}); ok {
			for _, item := range graph {
				if posting := findJobPosting(item); posting != nil {
					return posting
				}
			}
		}
	case []interface{}:
		for _, item := range v {
			if posting := findJobPosting(item); posting != nil {
				return posting
			}
		}
	}
	return nil
}

func typeIs(value interface{}, want string) bool {
	switch v := value.(type) {
	case string:
		return v == want
	case []interface{}:
		for _, item := range v {
			if s, ok := item.(string); ok && s == want {
				return true
			}
		}
	}
	return false
}

func applyJobPosting(posting map[string]interface{}, result *scrapeResponse) {
	if title, ok := posting["title"].(string); ok {
		result.Role = strings.TrimSpace(title)
	}
	if org, ok := posting["hiringOrganization"].(map[string]interface{}); ok {
		if name, ok := org["name"].(string); ok {
			result.Company = strings.TrimSpace(name)
		}
	}
	result.Location = jobLocationText(posting)
	if min, max, ok := baseSalaryRange(posting); ok {
		result.CompMin = &min
		result.CompMax = &max
	}
	if desc, ok := posting["description"].(string); ok {
		result.Raw = truncate(collapseWhitespace(stripHTML(desc)), rawTextLimit)
	}
}

func jobLocationText(posting map[string]interface{}) string {
	if locType, ok := posting["jobLocationType"].(string); ok && strings.EqualFold(locType, "TELECOMMUTE") {
		return "remote"
	}
	loc := posting["jobLocation"]
	if list, ok := loc.([]interface{}); ok && len(list) > 0 {
		loc = list[0]
	}
	locMap, ok := loc.(map[string]interface{})
	if !ok {
		return ""
	}
	address, ok := locMap["address"].(map[string]interface{})
	if !ok {
		return ""
	}
	parts := []string{}
	for _, key := range []string{"addressLocality", "addressRegion"} {
		if s, ok := address[key].(string); ok && s != "" {
			parts = append(parts, s)
		}
	}
	return strings.Join(parts, ", ")
}

func baseSalaryRange(posting map[string]interface{}) (int, int, bool) {
	salary, ok := posting["baseSalary"].(map[string]interface{})
	if !ok {
		return 0, 0, false
	}
	value, ok := salary["value"].(map[string]interface{})
	if !ok {
		return 0, 0, false
	}
	min, minOK := numericValue(value["minValue"])
	max, maxOK := numericValue(value["maxValue"])
	if minOK && maxOK {
		return min, max, true
	}
	if single, ok := numericValue(value["value"]); ok {
		return single, single, true
	}
	return 0, 0, false
}

func numericValue(v interface{}) (int, bool) {
	switch n := v.(type) {
	case float64:
		return int(n), true
	case string:
		clean := strings.ReplaceAll(n, ",", "")
		if i, err := strconv.Atoi(clean); err == nil {
			return i, true
		}
	}
	return 0, false
}

// extractFromGreenhouseEmbed handles pages that only embed Greenhouse's widget by calling its jobs API with the board token and URL job id (gh_jid or id).
func extractFromGreenhouseEmbed(ctx context.Context, doc *goquery.Document, requestURL string, result *scrapeResponse) bool {
	boardToken := ""
	doc.Find(`script[src*="boards.greenhouse.io/embed/job_board"]`).EachWithBreak(func(_ int, s *goquery.Selection) bool {
		src, ok := s.Attr("src")
		if !ok {
			return true
		}
		match := greenhouseEmbedForPattern.FindStringSubmatch(src)
		if match == nil {
			return true
		}
		boardToken = match[1]
		return false
	})
	if boardToken == "" {
		return false
	}

	parsed, err := url.Parse(requestURL)
	if err != nil {
		return false
	}
	jobID := parsed.Query().Get("gh_jid")
	if jobID == "" {
		jobID = parsed.Query().Get("id")
	}
	if jobID == "" {
		return false
	}
	// Constrain jobID to digits so a crafted query param can't inject path segments into the API URL.
	if !greenhouseJobIDPattern.MatchString(jobID) {
		return false
	}

	apiURL := fmt.Sprintf("%s/v1/boards/%s/jobs/%s?content=true", greenhouseBoardsAPIBaseURL, boardToken, jobID)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return false
	}
	resp, err := httpClient.Do(httpReq)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return false
	}

	var job greenhouseJobResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, maxBodyBytes)).Decode(&job); err != nil {
		return false
	}

	if result.Role == "" {
		result.Role = strings.TrimSpace(job.Title)
	}
	if result.Company == "" {
		result.Company = strings.TrimSpace(job.CompanyName)
	}

	// job.Content is entity-escaped HTML, so decode entities before stripHTML sees real tags.
	contentText := collapseWhitespace(stripHTML(html.UnescapeString(job.Content)))
	if contentText != "" {
		result.Raw = truncate(contentText, rawTextLimit)
	}
	if result.Location == "" {
		lower := strings.ToLower(contentText)
		if strings.Contains(lower, "hybrid") || strings.Contains(lower, "remote") ||
			strings.Contains(lower, "onsite") || strings.Contains(lower, "on-site") {
			// Classify here rather than park a whole document in a location-typed field.
			result.Location = classifyLocation(contentText)
		} else {
			result.Location = job.Location.Name
		}
	}
	if result.CompMin == nil && result.CompMax == nil {
		if min, max, ok := extractCompRange(contentText); ok {
			result.CompMin = &min
			result.CompMax = &max
		}
	}
	return result.Role != ""
}

// extractFromMetaAndTitle falls back to Open Graph meta and title-tag heuristics when no JSON-LD is present.
func extractFromMetaAndTitle(doc *goquery.Document, result *scrapeResponse) {
	if siteName, ok := doc.Find(`meta[property="og:site_name"]`).Attr("content"); ok {
		result.Company = strings.TrimSpace(siteName)
	}

	pageTitle := strings.TrimSpace(doc.Find("title").First().Text())
	ogTitle := ""
	if v, ok := doc.Find(`meta[property="og:title"]`).Attr("content"); ok {
		ogTitle = strings.TrimSpace(v)
	}

	// og:title is often role-only while <title> carries the company; take whichever half each has, preferring og:title.
	ogRole, ogCompany := splitTitleHeuristic(ogTitle)
	pageRole, pageCompany := splitTitleHeuristic(pageTitle)

	role := ogRole
	if role == "" {
		role = pageRole
	}
	company := ogCompany
	if company == "" {
		company = pageCompany
	}

	if result.Role == "" {
		result.Role = role
	}
	if result.Company == "" {
		result.Company = company
	}
}

// splitTitleHeuristic splits the common "Role at Company" / "Role - Company" title patterns.
func splitTitleHeuristic(title string) (role string, company string) {
	for _, sep := range []string{" at ", " - ", " | "} {
		if idx := strings.Index(title, sep); idx > 0 {
			return strings.TrimSpace(title[:idx]), strings.TrimSpace(title[idx+len(sep):])
		}
	}
	return title, ""
}

func classifyLocation(text string) string {
	// extract re-classifies its own output, and NYC_IN_PERSON misses the "in-person" check below.
	switch text {
	case "REMOTE", "NYC_HYBRID", "NYC_IN_PERSON":
		return text
	}
	lower := strings.ToLower(text)
	hybrid := strings.Contains(lower, "hybrid")
	if strings.Contains(lower, "remote") && !hybrid {
		return "REMOTE"
	}
	if hybrid {
		return "NYC_HYBRID"
	}
	if strings.Contains(lower, "onsite") || strings.Contains(lower, "on-site") ||
		strings.Contains(lower, "in-person") || strings.Contains(lower, "in office") {
		return "NYC_IN_PERSON"
	}
	return ""
}

// extractCompRange takes the first digit range with a $ or k, so phone numbers and year ranges don't match.
func extractCompRange(text string) (int, int, bool) {
	for _, match := range compRegex.FindAllStringSubmatch(text, -1) {
		hasDollar := match[1] != "" || match[4] != ""
		hasK := match[3] != "" || match[6] != ""
		if !hasDollar && !hasK {
			continue
		}
		// A k on either side applies to both: "$100-150k" is $100k-$150k.
		min, ok1 := parseCompNumber(match[2], hasK)
		max, ok2 := parseCompNumber(match[5], hasK)
		if !ok1 || !ok2 || min == 0 || max == 0 || min > max {
			continue
		}
		if !hasK && (min < 1000 || max < 1000) {
			// No shorthand and sub-$1,000: too small for a real salary, likely a false positive.
			continue
		}
		return min, max, true
	}
	return 0, 0, false
}

func parseCompNumber(digits string, applyKMultiplier bool) (int, bool) {
	clean := strings.ReplaceAll(digits, ",", "")
	n, err := strconv.Atoi(clean)
	if err != nil {
		return 0, false
	}
	if applyKMultiplier {
		n *= 1000
	}
	return n, true
}

func stripHTML(s string) string {
	if doc, err := goquery.NewDocumentFromReader(strings.NewReader(s)); err == nil {
		return doc.Text()
	}
	return s
}

func collapseWhitespace(s string) string {
	return strings.Join(strings.Fields(s), " ")
}

func truncate(s string, limit int) string {
	if len(s) <= limit {
		return s
	}
	// Back off to a rune start so a multi-byte character isn't cut in half.
	for limit > 0 && !utf8.RuneStart(s[limit]) {
		limit--
	}
	return s[:limit]
}

func writeJSON(w http.ResponseWriter, status int, body interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
