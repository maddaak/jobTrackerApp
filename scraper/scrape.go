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
}

var httpClient = &http.Client{Timeout: 8 * time.Second}

// maxBodyBytes caps both the inbound request body and the fetched page body so a huge
// payload cannot exhaust memory.
const maxBodyBytes = 5 << 20 // 5MB

// blockInternalHosts guards the user-supplied scrape URL against SSRF. It is a package var
// so tests that fetch 127.0.0.1 fixtures can turn it off.
var blockInternalHosts = true

// blockedIPNets are ranges the standard net.IP predicates below don't already cover but that
// must never be dialed: CGNAT shared address space, IANA reserved/future-use space, the
// documentation/test ranges, and the "this network" 0.0.0.0/8 block. Parsed once at startup.
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

// isPublicIP reports whether ip is a routable public address. It rejects loopback, private
// (RFC1918 10/8, 172.16/12, 192.168/16), link-local (169.254/16 including the cloud metadata
// IP 169.254.169.254 and IPv6 fe80::/10), unique-local IPv6 (fc00::/7), IPv6 loopback,
// unspecified (0.0.0.0 / ::), multicast ranges, and the extra CGNAT/reserved/documentation
// ranges in blockedIPNets.
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

// isSafeScrapeURL resolves the host of rawURL and reports whether it is safe to fetch. An IP
// literal is checked directly; a hostname is resolved with net.DefaultResolver.LookupIP under
// the caller's context and rejected if ANY resolved address falls in a blocked range. When
// blockInternalHosts is false the check is skipped entirely and the URL is treated as safe.
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

// safeDialContext closes the SSRF DNS-rebinding hole in the pre-fetch isSafeScrapeURL check.
// isSafeScrapeURL resolves and validates the host, but the HTTP transport would otherwise
// re-resolve DNS independently when dialing, so a rebinding attacker could return a public IP
// to the check and a private IP to the dialer. This resolves the host itself, dials only an IP
// that passes isPublicIP (the same classification the pre-check uses), and connects to that
// IP:port directly so no second, unvalidated DNS lookup can happen. An IP literal is validated
// as-is; a hostname that resolves to no safe address is refused.
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
	// A multi-homed host whose first record is down should still connect via a later one, as Go's
	// default dialer does. Non-public IPs stay skipped and each dial is pinned to keep the SSRF guard.
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

// safeFetchClient dials only validated public IPs (via safeDialContext) so a DNS-rebinding
// attacker cannot slip a private IP past the pre-fetch check, and re-runs the safety check on
// every redirect target so a redirect cannot reach an internal host either. Redirects are
// pinned too, since they dial through the same transport.
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

// userFetchClient picks the client for the user-supplied URL: the SSRF-pinned safeFetchClient
// when blocking is on, the plain shared client when off.
func userFetchClient() *http.Client {
	if !blockInternalHosts {
		return httpClient
	}
	return safeFetchClient
}

var compRegex = regexp.MustCompile(`(\$)?\s?([\d,]+)([kK])?\s*(?:-|–|to)\s*(\$)?\s?([\d,]+)([kK])?`)

const rawTextLimit = 8000

// greenhouseEmbedForPattern pulls the board token out of a Greenhouse embed script's src,
// e.g. "https://boards.greenhouse.io/embed/job_board/js?for=doubleverify" -> "doubleverify".
var greenhouseEmbedForPattern = regexp.MustCompile(`[?&]for=([a-zA-Z0-9_-]+)`)

// greenhouseJobIDPattern constrains the job id pulled from the page URL to digits only.
var greenhouseJobIDPattern = regexp.MustCompile(`^\d+$`)

// greenhouseBoardsAPIBaseURL is a package var (not a const) so tests can point it at a local
// httptest.Server instead of the real Greenhouse API.
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

	// Bound DNS resolution, the page fetch, and the Greenhouse fallback to the inbound
	// request's lifetime plus an upper deadline, so a hung upstream or a disconnected client
	// can't tie the handler up past this ceiling. Each HTTP client also enforces its own 8s
	// timeout, which stays the primary governor of a single call.
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()

	// SSRF guard: only fetch the user URL if it resolves to a public host. isSafeScrapeURL
	// returns true when blocking is off, so this also permits the fetch in that mode. An
	// unsafe host is treated exactly like an unreachable one: skip the fetch and fall
	// through to the all-blank best-effort result, without leaking which host was blocked.
	if isSafeScrapeURL(ctx, req.URL) {
		httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, req.URL, nil)
		if err == nil {
			httpReq.Header.Set("User-Agent",
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36")
			resp, fetchErr := userFetchClient().Do(httpReq)
			if fetchErr == nil {
				defer resp.Body.Close()
				// A non-2xx response (404, 410, etc.) still has an HTTP body (Go's client
				// doesn't treat that as an error), so without this check a dead/removed
				// posting's error page gets scraped and extracted from as if it were real,
				// silently feeding garbage into the form and the AI match instead of
				// surfacing a fetch failure the user can react to.
				if resp.StatusCode >= 200 && resp.StatusCode < 300 {
					limited := io.LimitReader(resp.Body, maxBodyBytes)
					if doc, parseErr := goquery.NewDocumentFromReader(limited); parseErr == nil {
						extract(ctx, doc, &result, req.URL)
					}
				}
			}
		}
	}
	// Best-effort by design: a fetch/parse failure just leaves `result` at its zero
	// value (all blanks), never a 500; the caller always gets a 200 to fill in manually.

	writeJSON(w, http.StatusOK, result)
}

func extract(ctx context.Context, doc *goquery.Document, result *scrapeResponse, requestURL string) {
	if extractFromJSONLD(doc, result) {
		// JSON-LD gave us structured fields; still run keyword classification over
		// whatever location text we found, and fall back to page text for comp/raw
		// if JSON-LD didn't have them.
	} else if !extractFromGreenhouseEmbed(ctx, doc, requestURL, result) {
		extractFromMetaAndTitle(doc, result)
	}

	// Only the Raw/comp/location fallbacks read this, so skip the full DOM walk (up to 5MB) when
	// JSON-LD already filled them.
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
	if result.Location == "" {
		result.Location = classifyLocation(bodyText)
	} else {
		result.Location = classifyLocation(result.Location)
	}
}

// jobContentSignalWords are words a real job posting almost always contains somewhere.
// The whole-page-body fallback in extract() is a last resort for sites we have no
// structured way to read: on a JS-rendered careers page (client-side widget, no JSON-LD,
// no known embed) that body text is just nav/footer/legal boilerplate, not the JD. Without
// this check that boilerplate gets accepted as "the job description" and silently fed to
// the AI match, which can only ever produce a nonsense verdict from it.
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

// extractFromJSONLD looks for a <script type="application/ld+json"> block describing a
// schema.org JobPosting. Most ATS platforms (Greenhouse/Lever/Ashby) embed one, and it's
// far more reliable than scraping visible text.
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

// extractFromGreenhouseEmbed handles pages that embed Greenhouse's client-side board widget
// instead of server-rendering the posting: a plain HTML fetch sees only site chrome, so this
// calls Greenhouse's public jobs API with the embed's board token and a job id from the URL
// (gh_jid, or id, both seen in the wild).
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
	// Constrain jobID to digits (like boardToken is constrained) before building the API
	// URL, so a crafted query param cannot inject path segments into the Greenhouse call.
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

	// job.Content is HTML, itself HTML-entity-escaped by the API (e.g. "&lt;div&gt;"), so
	// decode the entities first so stripHTML actually sees real tags to strip.
	contentText := collapseWhitespace(stripHTML(html.UnescapeString(job.Content)))
	if contentText != "" {
		result.Raw = truncate(contentText, rawTextLimit)
	}
	if result.Location == "" {
		lower := strings.ToLower(contentText)
		if strings.Contains(lower, "hybrid") || strings.Contains(lower, "remote") ||
			strings.Contains(lower, "onsite") || strings.Contains(lower, "on-site") {
			// Let the shared classifyLocation() call below pick the right value out of
			// this; the JD text is a more reliable signal than the bare office name.
			result.Location = contentText
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

// extractFromMetaAndTitle is the fallback when no JobPosting JSON-LD is present: Open Graph
// meta tags and title-tag heuristics, supported even by simple career pages.
func extractFromMetaAndTitle(doc *goquery.Document, result *scrapeResponse) {
	if siteName, ok := doc.Find(`meta[property="og:site_name"]`).Attr("content"); ok {
		result.Company = strings.TrimSpace(siteName)
	}

	pageTitle := strings.TrimSpace(doc.Find("title").First().Text())
	ogTitle := ""
	if v, ok := doc.Find(`meta[property="og:title"]`).Attr("content"); ok {
		ogTitle = strings.TrimSpace(v)
	}

	// og:title is often just the role with no "at Company" suffix (e.g. Greenhouse job
	// pages), while the <title> tag has the company but a noisier role prefix like "Job
	// Application for ...". Split both and take whichever half each one actually has,
	// preferring og:title since it's the cleaner source when it does have a separator.
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

// splitTitleHeuristic handles the common "Role at Company" / "Role - Company" page-title
// patterns job boards use.
func splitTitleHeuristic(title string) (role string, company string) {
	for _, sep := range []string{" at ", " - ", " | "} {
		if idx := strings.Index(title, sep); idx > 0 {
			return strings.TrimSpace(title[:idx]), strings.TrimSpace(title[idx+len(sep):])
		}
	}
	return title, ""
}

func classifyLocation(text string) string {
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

// extractCompRange scans for the first digit-range match that actually looks like a salary
// (has a $ or a k/K suffix on at least one side) rather than any bare "N - N" in the page:
// phone numbers, years ("2020-2024"), and "1-2 years experience" would otherwise all match.
func extractCompRange(text string) (int, int, bool) {
	for _, match := range compRegex.FindAllStringSubmatch(text, -1) {
		hasDollar := match[1] != "" || match[4] != ""
		hasK := match[3] != "" || match[6] != ""
		if !hasDollar && !hasK {
			continue
		}
		// A k/K suffix on either side means the whole range is in that shorthand:
		// "$100-150k" is $100k-$150k, not $100-$150,000.
		min, ok1 := parseCompNumber(match[2], hasK)
		max, ok2 := parseCompNumber(match[5], hasK)
		if !ok1 || !ok2 || min == 0 || max == 0 || min > max {
			continue
		}
		if !hasK && (min < 1000 || max < 1000) {
			// No shorthand and a sub-$1,000 figure: too small to be a real salary,
			// almost certainly a false positive (e.g. "1-2 years").
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
	// Back off to the start of a rune so a multi-byte UTF-8 character never gets cut in
	// half (which would otherwise leave a trailing garbled/replacement character).
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
